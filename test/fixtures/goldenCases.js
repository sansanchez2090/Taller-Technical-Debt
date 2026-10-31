'use strict';

/**
 * GOLDEN MASTER - datos de referencia capturados del motor LEGADO.
 * Los importes esperados son el resultado matemático exacto de las reglas
 * del legado (sin redondeo a centavos). Cada motor se valida con su propia tolerancia.
 */

const FIXED_NOW = new Date('2026-10-29T12:00:00.000Z');

function makeSubscription(overrides = {}) {
  return {
    id: 'sub_T',
    customerEmail: 'qa@fastpay.test',
    plan: 'PRO',
    amount: 100,
    currency: 'USD',
    country: 'US',
    billingCycle: 'MONTHLY',
    status: 'ACTIVE',
    paymentMethod: 'CREDIT_CARD',
    cardLast4: '4242',
    balance: 0,
    lastBilledAt: '2026-09-24T00:00:00Z',
    retryCount: 0,
    ...overrides,
  };
}

const PRICING_CASES = [
  {
    name: 'CO: monto = 200 NO paga recargo bancario (umbral estricto > 200)',
    subscription: { country: 'CO', amount: 200 },
    options: {},
    expected: { baseAmount: 200, discount: 0, taxes: 38, surcharge: 0, finalTotal: 238 },
  },
  {
    name: 'CO: monto 200.01 paga recargo bancario de 4.5',
    subscription: { country: 'CO', amount: 200.01 },
    options: {},
    expected: { baseAmount: 200.01, discount: 0, taxes: 38.0019, surcharge: 4.5, finalTotal: 242.5119 },
  },
  {
    name: 'CO: ENTERPRISE 299.99 (caso sub_101 del simulador)',
    subscription: { plan: 'ENTERPRISE', country: 'CO', amount: 299.99 },
    options: {},
    expected: { baseAmount: 299.99, discount: 0, taxes: 56.9981, surcharge: 4.5, finalTotal: 361.4881 },
  },
  {
    name: 'CO: ENTERPRISE + promo FAST2026 descuenta 30 plano',
    subscription: { plan: 'ENTERPRISE', country: 'CO', amount: 299.99 },
    options: { promoCode: 'FAST2026' },
    expected: { baseAmount: 299.99, discount: 30, taxes: 51.2981, surcharge: 4.5, finalTotal: 325.7881 },
  },
  {
    name: 'MX: IVA 16% con tarjeta, sin recargo',
    subscription: { country: 'MX', amount: 99 },
    options: {},
    expected: { baseAmount: 99, discount: 0, taxes: 15.84, surcharge: 0, finalTotal: 114.84 },
  },
  {
    name: 'MX: transferencia (WIRE_TRANSFER) agrega recargo de 8',
    subscription: { country: 'MX', amount: 99, paymentMethod: 'WIRE_TRANSFER' },
    options: {},
    expected: { baseAmount: 99, discount: 0, taxes: 15.84, surcharge: 8, finalTotal: 122.84 },
  },
  {
    name: 'AR: carga impositiva 56% + recargo fijo 12.5',
    subscription: { country: 'AR', amount: 29, plan: 'STARTER' },
    options: {},
    expected: { baseAmount: 29, discount: 0, taxes: 16.24, surcharge: 12.5, finalTotal: 57.74 },
  },
  {
    name: 'US: ENTERPRISE_PLUS anual descuenta 15%; WIRE_TRANSFER no recarga fuera de MX',
    subscription: {
      country: 'US',
      plan: 'ENTERPRISE_PLUS',
      billingCycle: 'ANNUAL',
      amount: 599.5,
      paymentMethod: 'WIRE_TRANSFER',
      lastBilledAt: '2025-10-24T00:00:00Z',
    },
    options: {},
    expected: { baseAmount: 599.5, discount: 89.925, taxes: 42.0399375, surcharge: 0, finalTotal: 551.6149375 },
  },
  {
    name: 'US: tasa estándar 8.25%',
    subscription: { country: 'US', amount: 100 },
    options: {},
    expected: { baseAmount: 100, discount: 0, taxes: 8.25, surcharge: 0, finalTotal: 108.25 },
  },
  {
    name: 'País no documentado (BR): tasa por defecto 10%',
    subscription: { country: 'BR', amount: 100 },
    options: {},
    expected: { baseAmount: 100, discount: 0, taxes: 10, surcharge: 0, finalTotal: 110 },
  },
  {
    name: 'ENTERPRISE_PLUS mensual: descuento plano de 25',
    subscription: { country: 'BR', plan: 'ENTERPRISE_PLUS', billingCycle: 'MONTHLY', amount: 100 },
    options: {},
    expected: { baseAmount: 100, discount: 25, taxes: 7.5, surcharge: 0, finalTotal: 82.5 },
  },
  {
    name: 'Promo FAST2026 en plan PRO NO aplica',
    subscription: { country: 'BR', plan: 'PRO', amount: 100 },
    options: { promoCode: 'FAST2026' },
    expected: { baseAmount: 100, discount: 0, taxes: 10, surcharge: 0, finalTotal: 110 },
  },
  {
    name: 'ENTERPRISE con promo desconocida NO descuenta',
    subscription: { country: 'BR', plan: 'ENTERPRISE', amount: 100 },
    options: { promoCode: 'OTRO' },
    expected: { baseAmount: 100, discount: 0, taxes: 10, surcharge: 0, finalTotal: 110 },
  },
];

module.exports = { FIXED_NOW, makeSubscription, PRICING_CASES };
