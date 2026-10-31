'use strict';

const { Money } = require('./Money');

const CO_SURCHARGE_THRESHOLD_CENTS = 20000;
const NO_SURCHARGE = () => 0;

/**
 * Reglas fiscales por país (OCP): para agregar un país se agrega una regla,
 * sin modificar TaxPolicy ni el caso de uso.
 */
const DEFAULT_TAX_RULES = Object.freeze([
  {
    country: 'CO',
    rateBps: 1900,
    surchargeCents: (subscription) => (subscription.amount.cents > CO_SURCHARGE_THRESHOLD_CENTS ? 450 : 0),
  },
  {
    country: 'MX',
    rateBps: 1600,
    surchargeCents: (subscription) => (subscription.paymentMethod === 'WIRE_TRANSFER' ? 800 : 0),
  },
  { country: 'AR', rateBps: 5600, surchargeCents: () => 1250 },
  { country: 'US', rateBps: 825, surchargeCents: NO_SURCHARGE },
]);

const FALLBACK_TAX_RULE = Object.freeze({ country: '*', rateBps: 1000, surchargeCents: NO_SURCHARGE });

class TaxPolicy {
  #rules;
  #fallbackRule;

  constructor(rules = DEFAULT_TAX_RULES, fallbackRule = FALLBACK_TAX_RULE) {
    this.#rules = new Map(rules.map((rule) => [rule.country, rule]));
    this.#fallbackRule = fallbackRule;
  }

  ruleFor(country) {
    return this.#rules.get(country) ?? this.#fallbackRule;
  }

  taxesOn(taxableAmount, country) {
    return taxableAmount.percentage(this.ruleFor(country).rateBps);
  }

  surchargeFor(subscription) {
    const cents = this.ruleFor(subscription.country).surchargeCents(subscription);
    return Money.fromCents(cents, subscription.currency);
  }
}

module.exports = { TaxPolicy, DEFAULT_TAX_RULES, FALLBACK_TAX_RULE };
