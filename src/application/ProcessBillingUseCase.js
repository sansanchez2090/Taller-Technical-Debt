'use strict';

const { BillingCalculator } = require('../domain/BillingCalculator');
const { periodKey } = require('../domain/billingPeriod');
const { GatewayTimeoutError } = require('../ports/PaymentGatewayPort');

const failure = (code, msg) => ({ success: false, code, msg });

const toNumbers = ({ baseAmount, discount, taxes, surcharge, total }) => ({
  baseAmount: baseAmount.toNumber(),
  discount: discount.toNumber(),
  taxes: taxes.toNumber(),
  surcharge: surcharge.toNumber(),
  finalTotal: total.toNumber(),
});

/**
 * Caso de uso: procesar el cobro de una suscripción.
 * - Exclusión mutua por suscripción (locks) => sin carreras dentro del proceso.
 * - Idempotencia por período => un segundo intento devuelve el cobro original (replay).
 * - Llave de idempotencia también hacia la pasarela => reintentos seguros.
 */
class ProcessBillingUseCase {
  #repository;
  #gateway;
  #locks;
  #clock;
  #newReference;
  #calculator;

  constructor({ repository, gateway, locks, clock, newReference, calculator = new BillingCalculator() } = {}) {
    const dependencies = { repository, gateway, locks, clock, newReference };
    for (const [name, dependency] of Object.entries(dependencies)) {
      if (!dependency) {
        throw new TypeError(`ProcessBillingUseCase requiere la dependencia "${name}"`);
      }
    }
    this.#repository = repository;
    this.#gateway = gateway;
    this.#locks = locks;
    this.#clock = clock;
    this.#newReference = newReference;
    this.#calculator = calculator;
  }

  execute(subscriptionId, options = {}) {
    return this.#locks.runExclusive(`billing:${subscriptionId}`, () => this.#process(subscriptionId, options));
  }

  async #process(subscriptionId, options) {
    const subscription = await this.#repository.findById(subscriptionId);
    if (!subscription) {
      return failure('ERR_SUB_NOT_FOUND', 'Suscripcion no existe');
    }

    const rejection = subscription.activateForBilling({ forceRetry: options.forceRetry === true });
    if (rejection) {
      return failure(rejection.code, rejection.msg);
    }

    const now = this.#clock.now();
    const period = periodKey(subscription.billingCycle, now);
    if (subscription.isBilledIn(period)) {
      return this.#replay(subscription);
    }

    const breakdown = this.#calculator.calculate(subscription, options);
    return this.#collect(subscription, breakdown, { reference: this.#newReference(), period, now });
  }

  async #collect(subscription, breakdown, { reference, period, now }) {
    try {
      await this.#gateway.charge({
        reference,
        amount: breakdown.total,
        cardLast4: subscription.cardLast4,
        idempotencyKey: `${subscription.id}:${period}`,
      });
    } catch (error) {
      if (!(error instanceof GatewayTimeoutError)) {
        throw error;
      }
      return this.#registerGatewayFailure(subscription, reference);
    }

    subscription.registerCharge({ total: breakdown.total, reference, at: now });
    await this.#repository.save(subscription);

    return {
      success: true,
      code: 'BILLING_PROCESSED',
      subId: subscription.id,
      customer: subscription.customerEmail,
      breakdown: toNumbers(breakdown),
      transactionReference: reference,
      processedAt: subscription.lastBilledAt,
    };
  }

  async #registerGatewayFailure(subscription, reference) {
    subscription.registerGatewayFailure();
    await this.#repository.save(subscription);
    return { success: false, code: 'GATEWAY_TIMEOUT', ref: reference, retryCount: subscription.retryCount };
  }

  #replay(subscription) {
    return {
      success: true,
      code: 'BILLING_ALREADY_PROCESSED',
      replayed: true,
      subId: subscription.id,
      customer: subscription.customerEmail,
      transactionReference: subscription.lastTransactionRef,
      processedAt: subscription.lastBilledAt,
    };
  }
}

module.exports = { ProcessBillingUseCase };
