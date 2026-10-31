'use strict';

class GatewayTimeoutError extends Error {
  constructor(message = 'La pasarela de pago no respondio a tiempo') {
    super(message);
    this.name = 'GatewayTimeoutError';
  }
}

/**
 * Puerto de salida: cobro en la pasarela externa.
 * charge({ reference, amount: Money, cardLast4, idempotencyKey }) => Promise<{ status }>
 * Debe lanzar GatewayTimeoutError cuando la pasarela no responde.
 */
class PaymentGatewayPort {
  async charge() {
    throw new Error(`${this.constructor.name}.charge no implementado`);
  }
}

module.exports = { PaymentGatewayPort, GatewayTimeoutError };
