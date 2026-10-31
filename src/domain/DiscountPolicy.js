'use strict';

const { Money } = require('./Money');

/** La primera regla que aplique gana (equivale al if/else-if del legado). */
const DEFAULT_DISCOUNT_RULES = Object.freeze([
  {
    name: 'ENTERPRISE_PLUS_ANNUAL',
    applies: (subscription) => subscription.plan === 'ENTERPRISE_PLUS' && subscription.billingCycle === 'ANNUAL',
    amountFor: (base) => base.percentage(1500),
  },
  {
    name: 'ENTERPRISE_PLUS_FLAT',
    applies: (subscription) => subscription.plan === 'ENTERPRISE_PLUS',
    amountFor: (base) => Money.fromCents(2500, base.currency),
  },
  {
    name: 'ENTERPRISE_PROMO_FAST2026',
    applies: (subscription, options) => subscription.plan === 'ENTERPRISE' && options.promoCode === 'FAST2026',
    amountFor: (base) => Money.fromCents(3000, base.currency),
  },
]);

class DiscountPolicy {
  #rules;

  constructor(rules = DEFAULT_DISCOUNT_RULES) {
    this.#rules = rules;
  }

  /** El descuento nunca supera el importe base (el legado podía generar totales negativos). */
  discountFor(subscription, base, options = {}) {
    const rule = this.#rules.find((candidate) => candidate.applies(subscription, options));
    const discount = rule ? rule.amountFor(base) : Money.zero(base.currency);
    return discount.isGreaterThan(base) ? base : discount;
  }
}

module.exports = { DiscountPolicy, DEFAULT_DISCOUNT_RULES };
