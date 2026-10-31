'use strict';

const { PaymentGatewayPort, GatewayTimeoutError } = require('../ports/PaymentGatewayPort');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pasarela simulada (TDR-DEC-01). Replica el legado: la tarjeta terminada en 9999 da timeout.
 * Es idempotente por llave, como lo sería una pasarela real (p. ej. Idempotency-Key de Stripe).
 */
class MockPaymentGateway extends PaymentGatewayPort {
  #failingCards;
  #latencyMs;
  #approvals = new Map();

  constructor({ failingCardLast4 = ['9999'], latencyMs = 0 } = {}) {
    super();
    this.#failingCards = new Set(failingCardLast4);
    this.#latencyMs = latencyMs;
  }

  async charge({ reference, amount, cardLast4, idempotencyKey }) {
    if (this.#latencyMs > 0) {
      await delay(this.#latencyMs);
    }
    if (this.#failingCards.has(cardLast4)) {
      throw new GatewayTimeoutError(`Timeout simulado para la tarjeta terminada en ${cardLast4}`);
    }
    const known = this.#approvals.get(idempotencyKey);
    if (known) {
      return known;
    }
    const approval = Object.freeze({ reference, status: 'APPROVED', amountCents: amount.cents });
    this.#approvals.set(idempotencyKey, approval);
    return approval;
  }

  get charges() {
    return [...this.#approvals.values()];
  }
}

module.exports = { MockPaymentGateway };
