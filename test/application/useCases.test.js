'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ProcessBillingUseCase } = require('../../src/application/ProcessBillingUseCase');
const { BatchBillingUseCase } = require('../../src/application/BatchBillingUseCase');
const { ListSubscriptionsUseCase } = require('../../src/application/ListSubscriptionsUseCase');
const { Money } = require('../../src/domain/Money');
const { buildUseCase } = require('../helpers/refactoredAdapter');
const { makeSubscription } = require('../fixtures/goldenCases');

describe('ProcessBillingUseCase', () => {
  it('exige todas sus dependencias', () => {
    assert.throws(() => new ProcessBillingUseCase(), /repository/);
    assert.throws(() => new ProcessBillingUseCase({ repository: {} }), /gateway/);
  });

  it('suscripción inexistente (options es opcional)', async () => {
    const { useCase } = buildUseCase([]);
    const result = await useCase.execute('nope');
    assert.equal(result.code, 'ERR_SUB_NOT_FOUND');
  });

  it('envía a la pasarela monto, tarjeta, referencia y llave de idempotencia por período', async () => {
    const requests = [];
    const gateway = {
      async charge(request) {
        requests.push(request);
        return { status: 'APPROVED' };
      },
    };
    const subscription = makeSubscription({ amount: 100 });
    const { useCase } = buildUseCase([subscription], { gateway });

    await useCase.execute(subscription.id, {});

    assert.equal(requests.length, 1);
    assert.equal(requests[0].amount.cents, 10825);
    assert.equal(requests[0].cardLast4, '4242');
    assert.equal(requests[0].idempotencyKey, 'sub_T:2026-10');
    assert.match(requests[0].reference, /^TX_TEST_/);
  });

  it('un error inesperado de la pasarela se propaga y no persiste nada', async () => {
    const gateway = {
      async charge() {
        throw new Error('boom');
      },
    };
    const subscription = makeSubscription();
    const { useCase, repository } = buildUseCase([subscription], { gateway });

    await assert.rejects(useCase.execute(subscription.id, {}), /boom/);
    assert.deepEqual(repository.snapshot(), [subscription]);
    // el lock se liberó: un nuevo intento vuelve a ejecutarse
    await assert.rejects(useCase.execute(subscription.id, {}), /boom/);
  });

  it('un período ya cobrado devuelve replay sin invocar la pasarela', async () => {
    const subscription = makeSubscription({ lastBilledAt: '2026-10-05T00:00:00Z', lastTransactionRef: 'TX_OLD' });
    const { useCase, gateway } = buildUseCase([subscription]);

    const result = await useCase.execute(subscription.id, {});

    assert.equal(result.code, 'BILLING_ALREADY_PROCESSED');
    assert.equal(result.transactionReference, 'TX_OLD');
    assert.equal(gateway.charges.length, 0);
  });

  it('suscripciones distintas se cobran en paralelo sin interferirse', async () => {
    const subscriptions = [makeSubscription({ id: 'sub_A' }), makeSubscription({ id: 'sub_B' })];
    const { useCase, gateway } = buildUseCase(subscriptions, { latencyMs: 5 });

    const results = await Promise.all([useCase.execute('sub_A'), useCase.execute('sub_B')]);

    assert.deepEqual(results.map((result) => result.code), ['BILLING_PROCESSED', 'BILLING_PROCESSED']);
    assert.equal(gateway.charges.length, 2);
  });

  it('acepta un calculador inyectado', async () => {
    const fixed = Money.fromCents(1234);
    const zero = Money.zero();
    const calculator = {
      calculate: () => ({ baseAmount: fixed, discount: zero, taxes: zero, surcharge: zero, total: fixed }),
    };
    const subscription = makeSubscription();
    const { useCase } = buildUseCase([subscription], { calculator });

    const result = await useCase.execute(subscription.id, {});

    assert.equal(result.breakdown.finalTotal, 12.34);
  });
});

describe('BatchBillingUseCase', () => {
  it('procesa únicamente las suscripciones ACTIVE', async () => {
    const subscriptions = [
      makeSubscription({ id: 'sub_A' }),
      makeSubscription({ id: 'sub_B', status: 'SUSPENDED' }),
      makeSubscription({ id: 'sub_C' }),
    ];
    const { useCase, repository } = buildUseCase(subscriptions);
    const batch = new BatchBillingUseCase({ repository, processBilling: useCase });

    const outcome = await batch.execute();

    assert.equal(outcome.processedCount, 2);
    assert.deepEqual(outcome.results.map((result) => result.subId), ['sub_A', 'sub_C']);
  });

  it('reejecutar el lote en el mismo período no vuelve a cobrar', async () => {
    const { useCase, repository, gateway } = buildUseCase([makeSubscription({ id: 'sub_A' })]);
    const batch = new BatchBillingUseCase({ repository, processBilling: useCase });

    await batch.execute();
    const second = await batch.execute();

    assert.equal(second.results[0].code, 'BILLING_ALREADY_PROCESSED');
    assert.equal(gateway.charges.length, 1);
  });
});

describe('ListSubscriptionsUseCase', () => {
  it('devuelve los datos en formato primitivo', async () => {
    const subscriptions = [makeSubscription({ id: 'sub_A' }), makeSubscription({ id: 'sub_B' })];
    const { repository } = buildUseCase(subscriptions);

    const list = await new ListSubscriptionsUseCase({ repository }).execute();

    assert.deepEqual(list, subscriptions);
  });
});
