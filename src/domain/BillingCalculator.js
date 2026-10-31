'use strict';

const { TaxPolicy } = require('./TaxPolicy');
const { DiscountPolicy } = require('./DiscountPolicy');

/** Servicio de dominio puro: sin I/O, sin reloj, sin frameworks. */
class BillingCalculator {
  #taxPolicy;
  #discountPolicy;

  constructor({ taxPolicy = new TaxPolicy(), discountPolicy = new DiscountPolicy() } = {}) {
    this.#taxPolicy = taxPolicy;
    this.#discountPolicy = discountPolicy;
  }

  calculate(subscription, options = {}) {
    const baseAmount = subscription.amount;
    const discount = this.#discountPolicy.discountFor(subscription, baseAmount, options);
    const taxable = baseAmount.subtract(discount);
    const taxes = this.#taxPolicy.taxesOn(taxable, subscription.country);
    const surcharge = this.#taxPolicy.surchargeFor(subscription);

    return { baseAmount, discount, taxes, surcharge, total: taxable.add(taxes).add(surcharge) };
  }
}

module.exports = { BillingCalculator };
