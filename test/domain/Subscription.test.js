'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Subscription, REJECTIONS } = require('../../src/domain/Subscription');
const { Money } = require('../../src/domain/Money');
const { makeSubscription } = require('../fixtures/goldenCases');

const build = (overrides) => Subscription.fromPrimitives(makeSubscription(overrides));

describe('Subscription', () => {
  it('fromPrimitives/toPrimitives conserva el contrato de persistencia', () => {
    const raw = makeSubscription({ lastTransactionRef: 'TX_1', balance: 12.5 });
    assert.deepEqual(Subscription.fromPrimitives(raw).toPrimitives(), raw);
  });

  it('aplica valores por defecto y omite campos indefinidos', () => {
    const minimal = {
      id: 's',
      customerEmail: 'a@b.c',
      plan: 'PRO',
      amount: 10,
      country: 'US',
      billingCycle: 'MONTHLY',
      status: 'ACTIVE',
      paymentMethod: 'CREDIT_CARD',
      cardLast4: null,
    };
    const subscription = Subscription.fromPrimitives(minimal);
    const primitives = subscription.toPrimitives();

    assert.equal(subscription.currency, 'USD');
    assert.equal(subscription.balance.equals(Money.zero('USD')), true);
    assert.equal(subscription.retryCount, 0);
    assert.equal('lastBilledAt' in primitives, false);
    assert.equal('lastTransactionRef' in primitives, false);
    assert.equal(primitives.cardLast4, null);
  });

  it('ACTIVE es facturable (y activateForBilling no exige argumentos)', () => {
    const subscription = build({});
    assert.equal(subscription.activateForBilling(), null);
    assert.equal(subscription.isActive(), true);
  });

  it('SUSPENDED sin forceRetry se rechaza y conserva su estado', () => {
    const subscription = build({ status: 'SUSPENDED' });
    assert.equal(subscription.activateForBilling({ forceRetry: false }), REJECTIONS.SUSPENDED);
    assert.equal(subscription.status, 'SUSPENDED');
    assert.equal(subscription.isActive(), false);
  });

  it('SUSPENDED con forceRetry se reactiva', () => {
    const subscription = build({ status: 'SUSPENDED' });
    assert.equal(subscription.activateForBilling({ forceRetry: true }), null);
    assert.equal(subscription.status, 'ACTIVE');
  });

  it('cualquier otro estado es inactivo', () => {
    assert.equal(build({ status: 'CANCELLED' }).activateForBilling({ forceRetry: true }), REJECTIONS.INACTIVE);
  });

  it('el tercer fallo de pasarela suspende la cuenta', () => {
    const subscription = build({ retryCount: 1 });
    subscription.registerGatewayFailure();
    assert.equal(subscription.retryCount, 2);
    assert.equal(subscription.status, 'ACTIVE');
    subscription.registerGatewayFailure();
    assert.equal(subscription.retryCount, 3);
    assert.equal(subscription.status, 'SUSPENDED');
  });

  it('registerCharge acumula saldo y guarda referencia y fecha ISO', () => {
    const subscription = build({ balance: 10 });
    subscription.registerCharge({
      total: Money.fromCents(10825),
      reference: 'TX_9',
      at: new Date('2026-10-29T12:00:00Z'),
    });
    assert.equal(subscription.balance.toNumber(), 118.25);
    assert.equal(subscription.lastBilledAt, '2026-10-29T12:00:00.000Z');
    assert.equal(subscription.lastTransactionRef, 'TX_9');
  });

  it('isBilledIn detecta el período mensual, anual y la ausencia de cobros', () => {
    const monthly = build({ lastBilledAt: '2026-10-05T00:00:00Z' });
    assert.equal(monthly.isBilledIn('2026-10'), true);
    assert.equal(monthly.isBilledIn('2026-11'), false);

    const annual = build({ billingCycle: 'ANNUAL', lastBilledAt: '2026-01-01T00:00:00Z' });
    assert.equal(annual.isBilledIn('2026'), true);

    assert.equal(build({ lastBilledAt: undefined }).isBilledIn('2026-10'), false);
  });
});
