'use strict';

/**
 * Mismas aserciones del Golden Master legado, ejecutadas contra el motor hexagonal.
 * Tolerancia de 1 centavo: el único cambio intencional es el redondeo monetario (DV-01).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { defineGoldenMasterSuite } = require('./helpers/goldenMaster');
const { createRefactoredAdapter, buildUseCase } = require('./helpers/refactoredAdapter');
const { makeSubscription } = require('./fixtures/goldenCases');

describe('Golden Master del motor REFACTORIZADO', () => {
  defineGoldenMasterSuite({ label: 'HEXAGONAL', adapter: createRefactoredAdapter(), tolerance: 0.01 });

  describe('[HEXAGONAL] defectos del legado corregidos', () => {
    it('DT-07: los importes son exactos a centavos', async () => {
      const subscription = makeSubscription({ plan: 'ENTERPRISE', country: 'CO', amount: 299.99 });
      const { useCase } = buildUseCase([subscription]);
      const { breakdown } = await useCase.execute(subscription.id, {});

      assert.equal(breakdown.taxes, 57);
      assert.equal(breakdown.surcharge, 4.5);
      assert.equal(breakdown.finalTotal, 361.49);
    });

    it('DT-03: el segundo cobro del mismo período es un replay idempotente', async () => {
      const subscription = makeSubscription({ amount: 100 });
      const { useCase, repository, gateway } = buildUseCase([subscription]);

      const first = await useCase.execute(subscription.id, {});
      const second = await useCase.execute(subscription.id, {});

      assert.equal(first.code, 'BILLING_PROCESSED');
      assert.equal(second.code, 'BILLING_ALREADY_PROCESSED');
      assert.equal(second.replayed, true);
      assert.equal(second.transactionReference, first.transactionReference);
      assert.equal(gateway.charges.length, 1);
      assert.equal(repository.snapshot()[0].balance, 108.25);
    });

    it('DT-03: 5 solicitudes concurrentes producen UN solo cargo', async () => {
      const subscription = makeSubscription({ amount: 100 });
      const { useCase, repository, gateway } = buildUseCase([subscription], { latencyMs: 5 });

      const results = await Promise.all(Array.from({ length: 5 }, () => useCase.execute(subscription.id, {})));
      const processed = results.filter((result) => result.code === 'BILLING_PROCESSED');
      const replays = results.filter((result) => result.code === 'BILLING_ALREADY_PROCESSED');

      assert.equal(processed.length, 1);
      assert.equal(replays.length, 4);
      assert.equal(gateway.charges.length, 1);
      assert.equal(repository.snapshot()[0].balance, 108.25);
    });
  });
});
