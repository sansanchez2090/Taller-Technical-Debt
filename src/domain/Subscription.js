'use strict';

const { Money } = require('./Money');
const { periodKey } = require('./billingPeriod');

const STATUS = Object.freeze({ ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED' });
const MAX_GATEWAY_RETRIES = 3;

const REJECTIONS = Object.freeze({
  SUSPENDED: Object.freeze({ code: 'ERR_SUSPENDED', msg: 'Cuenta suspendida por mora' }),
  INACTIVE: Object.freeze({ code: 'ERR_INACTIVE', msg: 'Suscripcion inactiva' }),
});

class Subscription {
  constructor(props) {
    this.id = props.id;
    this.customerEmail = props.customerEmail;
    this.plan = props.plan;
    this.amount = props.amount;
    this.currency = props.currency;
    this.country = props.country;
    this.billingCycle = props.billingCycle;
    this.status = props.status;
    this.paymentMethod = props.paymentMethod;
    this.cardLast4 = props.cardLast4;
    this.balance = props.balance;
    this.lastBilledAt = props.lastBilledAt;
    this.retryCount = props.retryCount;
    this.lastTransactionRef = props.lastTransactionRef;
  }

  static fromPrimitives(raw) {
    const currency = raw.currency ?? 'USD';
    return new Subscription({
      ...raw,
      currency,
      amount: Money.fromDecimal(raw.amount, currency),
      balance: Money.fromDecimal(raw.balance ?? 0, currency),
      retryCount: raw.retryCount ?? 0,
    });
  }

  toPrimitives() {
    const primitives = {
      id: this.id,
      customerEmail: this.customerEmail,
      plan: this.plan,
      amount: this.amount.toNumber(),
      currency: this.currency,
      country: this.country,
      billingCycle: this.billingCycle,
      status: this.status,
      paymentMethod: this.paymentMethod,
      cardLast4: this.cardLast4,
      balance: this.balance.toNumber(),
      lastBilledAt: this.lastBilledAt,
      retryCount: this.retryCount,
      lastTransactionRef: this.lastTransactionRef,
    };
    return Object.fromEntries(Object.entries(primitives).filter(([, value]) => value !== undefined));
  }

  isActive() {
    return this.status === STATUS.ACTIVE;
  }

  /**
   * Verifica que la suscripción pueda cobrarse. Una cuenta SUSPENDED solo se
   * reactiva con forceRetry (atajo heredado). Devuelve null o el motivo de rechazo.
   */
  activateForBilling({ forceRetry = false } = {}) {
    if (this.status === STATUS.ACTIVE) {
      return null;
    }
    if (this.status !== STATUS.SUSPENDED) {
      return REJECTIONS.INACTIVE;
    }
    if (!forceRetry) {
      return REJECTIONS.SUSPENDED;
    }
    this.status = STATUS.ACTIVE;
    return null;
  }

  isBilledIn(period) {
    if (!this.lastBilledAt) {
      return false;
    }
    return periodKey(this.billingCycle, new Date(this.lastBilledAt)) === period;
  }

  registerGatewayFailure() {
    this.retryCount += 1;
    if (this.retryCount >= MAX_GATEWAY_RETRIES) {
      this.status = STATUS.SUSPENDED;
    }
  }

  registerCharge({ total, reference, at }) {
    this.balance = this.balance.add(total);
    this.lastBilledAt = at.toISOString();
    this.lastTransactionRef = reference;
  }
}

module.exports = { Subscription, STATUS, REJECTIONS, MAX_GATEWAY_RETRIES };
