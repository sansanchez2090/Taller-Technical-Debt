'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Money } = require('../../src/domain/Money');
const { Subscription } = require('../../src/domain/Subscription');
const { TaxPolicy } = require('../../src/domain/TaxPolicy');
const { DiscountPolicy } = require('../../src/domain/DiscountPolicy');
const { BillingCalculator } = require('../../src/domain/BillingCalculator');
const { makeSubscription } = require('../fixtures/goldenCases');

const build = (overrides) => Subscription.fromPrimitives(makeSubscription(overrides));
const ONE_HUNDRED = Money.fromCents(10000);

describe('TaxPolicy', () => {
  const policy = new TaxPolicy();

  it('aplica la tasa de cada país y la tasa por defecto', () => {
    assert.equal(policy.taxesOn(ONE_HUNDRED, 'CO').cents, 1900);
    assert.equal(policy.taxesOn(ONE_HUNDRED, 'MX').cents, 1600);
    assert.equal(policy.taxesOn(ONE_HUNDRED, 'AR').cents, 5600);
    assert.equal(policy.taxesOn(ONE_HUNDRED, 'US').cents, 825);
    assert.equal(policy.taxesOn(ONE_HUNDRED, 'BR').cents, 1000);
  });

  it('calcula recargos por país', () => {
    assert.equal(policy.surchargeFor(build({ country: 'CO', amount: 200 })).cents, 0);
    assert.equal(policy.surchargeFor(build({ country: 'CO', amount: 200.01 })).cents, 450);
    assert.equal(policy.surchargeFor(build({ country: 'MX', paymentMethod: 'WIRE_TRANSFER' })).cents, 800);
    assert.equal(policy.surchargeFor(build({ country: 'MX' })).cents, 0);
    assert.equal(policy.surchargeFor(build({ country: 'AR' })).cents, 1250);
    assert.equal(policy.surchargeFor(build({ country: 'US' })).cents, 0);
    assert.equal(policy.surchargeFor(build({ country: 'BR' })).cents, 0);
  });

  it('OCP: se agrega un país nuevo sin modificar el código existente', () => {
    const custom = new TaxPolicy([{ country: 'PE', rateBps: 1800, surchargeCents: () => 100 }]);
    assert.equal(custom.taxesOn(ONE_HUNDRED, 'PE').cents, 1800);
    assert.equal(custom.surchargeFor(build({ country: 'PE' })).cents, 100);
    assert.equal(custom.taxesOn(ONE_HUNDRED, 'CO').cents, 1000);
  });
});

describe('DiscountPolicy', () => {
  const policy = new DiscountPolicy();
  const base = Money.fromCents(59950);

  it('ENTERPRISE_PLUS anual: 15%', () => {
    const subscription = build({ plan: 'ENTERPRISE_PLUS', billingCycle: 'ANNUAL' });
    assert.equal(policy.discountFor(subscription, base, {}).cents, 8993);
  });

  it('ENTERPRISE_PLUS mensual: descuento plano de 25', () => {
    const subscription = build({ plan: 'ENTERPRISE_PLUS', billingCycle: 'MONTHLY' });
    assert.equal(policy.discountFor(subscription, base, {}).cents, 2500);
  });

  it('ENTERPRISE con FAST2026: 30 planos', () => {
    const subscription = build({ plan: 'ENTERPRISE' });
    assert.equal(policy.discountFor(subscription, base, { promoCode: 'FAST2026' }).cents, 3000);
  });

  it('sin regla aplicable el descuento es cero (y options es opcional)', () => {
    assert.equal(policy.discountFor(build({ plan: 'ENTERPRISE' }), base).cents, 0);
    assert.equal(policy.discountFor(build({ plan: 'PRO' }), base, { promoCode: 'FAST2026' }).cents, 0);
  });

  it('el descuento nunca supera el importe base', () => {
    const subscription = build({ plan: 'ENTERPRISE_PLUS', billingCycle: 'MONTHLY' });
    assert.equal(policy.discountFor(subscription, Money.fromCents(2000), {}).cents, 2000);
  });
});

describe('BillingCalculator', () => {
  const summarize = (b) => [b.baseAmount.cents, b.discount.cents, b.taxes.cents, b.surcharge.cents, b.total.cents];

  it('desglosa ENTERPRISE en Colombia', () => {
    const subscription = build({ plan: 'ENTERPRISE', amount: 299.99, country: 'CO' });
    assert.deepEqual(summarize(new BillingCalculator().calculate(subscription, {})), [29999, 0, 5700, 450, 36149]);
  });

  it('aplica la promo FAST2026', () => {
    const subscription = build({ plan: 'ENTERPRISE', amount: 299.99, country: 'CO' });
    const breakdown = new BillingCalculator().calculate(subscription, { promoCode: 'FAST2026' });
    assert.deepEqual(summarize(breakdown), [29999, 3000, 5130, 450, 32579]);
  });

  it('options es opcional', () => {
    assert.equal(new BillingCalculator().calculate(build({ amount: 100 })).total.cents, 10825);
  });

  it('acepta políticas inyectadas', () => {
    const calculator = new BillingCalculator({
      taxPolicy: new TaxPolicy([{ country: 'PE', rateBps: 1800, surchargeCents: () => 0 }]),
    });
    assert.equal(calculator.calculate(build({ country: 'PE', amount: 100 }), {}).total.cents, 11800);
  });
});
