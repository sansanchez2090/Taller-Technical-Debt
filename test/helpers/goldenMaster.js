'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PRICING_CASES, makeSubscription } = require('../fixtures/goldenCases');

const BREAKDOWN_KEYS = ['baseAmount', 'discount', 'taxes', 'surcharge', 'finalTotal'];

function assertClose(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance + 1e-9,
    `${label}: esperado ≈ ${expected} (±${tolerance}), obtenido ${actual}`,
  );
}

const byId = (list, id) => list.find((subscription) => subscription.id === id);

/**
 * Suite de caracterización compartida. Se ejecuta contra el motor LEGADO (paso 1)
 * y contra el motor REFACTORIZADO (paso 2) con exactamente las mismas aserciones.
 *
 * adapter.bill(subscriptions, id, options) => { result, persisted }
 */
function defineGoldenMasterSuite({ label, adapter, tolerance }) {
  describe(`[${label}] cálculo de importes`, () => {
    for (const testCase of PRICING_CASES) {
      it(testCase.name, async () => {
        const subscription = makeSubscription(testCase.subscription);
        const { result } = await adapter.bill([subscription], subscription.id, testCase.options);

        assert.equal(result.success, true);
        assert.equal(result.code, 'BILLING_PROCESSED');
        for (const key of BREAKDOWN_KEYS) {
          assertClose(result.breakdown[key], testCase.expected[key], tolerance, `${testCase.name} -> ${key}`);
        }
      });
    }
  });

  describe(`[${label}] reglas de estado, persistencia y pasarela`, () => {
    it('cobro exitoso persiste saldo, referencia y fecha sin tocar otras suscripciones', async () => {
      const target = makeSubscription({ id: 'sub_A', balance: 10 });
      const bystander = makeSubscription({ id: 'sub_B', balance: 5 });

      const { result, persisted } = await adapter.bill([target, bystander], 'sub_A', {});
      const saved = byId(persisted, 'sub_A');

      assertClose(saved.balance, 10 + result.breakdown.finalTotal, tolerance, 'saldo acumulado');
      assert.equal(saved.lastTransactionRef, result.transactionReference);
      assert.equal(saved.lastBilledAt, result.processedAt);
      assert.match(result.transactionReference, /^TX_/);
      assert.ok(!Number.isNaN(Date.parse(result.processedAt)));
      assert.deepEqual(byId(persisted, 'sub_B'), bystander);
    });

    it('suscripción inexistente: ERR_SUB_NOT_FOUND y sin cambios', async () => {
      const subscription = makeSubscription({ id: 'sub_A' });
      const { result, persisted } = await adapter.bill([subscription], 'sub_X', {});

      assert.deepEqual(result, { success: false, code: 'ERR_SUB_NOT_FOUND', msg: 'Suscripcion no existe' });
      assert.deepEqual(persisted, [subscription]);
    });

    it('SUSPENDED sin forceRetry: ERR_SUSPENDED y sin cambios', async () => {
      const subscription = makeSubscription({ status: 'SUSPENDED' });
      const { result, persisted } = await adapter.bill([subscription], subscription.id, {});

      assert.deepEqual(result, { success: false, code: 'ERR_SUSPENDED', msg: 'Cuenta suspendida por mora' });
      assert.deepEqual(persisted, [subscription]);
    });

    it('SUSPENDED con forceRetry === true: reactiva a la fuerza, cobra y persiste ACTIVE', async () => {
      const subscription = makeSubscription({ status: 'SUSPENDED' });
      const { result, persisted } = await adapter.bill([subscription], subscription.id, { forceRetry: true });

      assert.equal(result.success, true);
      assert.equal(byId(persisted, subscription.id).status, 'ACTIVE');
    });

    it('SUSPENDED con forceRetry no booleano ("true"): se rechaza (comparación estricta)', async () => {
      const subscription = makeSubscription({ status: 'SUSPENDED' });
      const { result } = await adapter.bill([subscription], subscription.id, { forceRetry: 'true' });

      assert.equal(result.code, 'ERR_SUSPENDED');
    });

    it('estado distinto de ACTIVE/SUSPENDED (CANCELLED): ERR_INACTIVE', async () => {
      const subscription = makeSubscription({ status: 'CANCELLED' });
      const { result, persisted } = await adapter.bill([subscription], subscription.id, {});

      assert.deepEqual(result, { success: false, code: 'ERR_INACTIVE', msg: 'Suscripcion inactiva' });
      assert.deepEqual(persisted, [subscription]);
    });

    it('tarjeta 9999: GATEWAY_TIMEOUT, retryCount 1, saldo intacto y sigue ACTIVE', async () => {
      const subscription = makeSubscription({ cardLast4: '9999', balance: 50 });
      const { result, persisted } = await adapter.bill([subscription], subscription.id, {});
      const saved = byId(persisted, subscription.id);

      assert.equal(result.success, false);
      assert.equal(result.code, 'GATEWAY_TIMEOUT');
      assert.equal(result.retryCount, 1);
      assert.match(result.ref, /^TX_/);
      assert.equal(saved.balance, 50);
      assert.equal(saved.status, 'ACTIVE');
      assert.equal(saved.retryCount, 1);
    });

    it('tarjeta 9999 con retryCount 2: el tercer fallo suspende la cuenta', async () => {
      const subscription = makeSubscription({ cardLast4: '9999', retryCount: 2 });
      const { result, persisted } = await adapter.bill([subscription], subscription.id, {});
      const saved = byId(persisted, subscription.id);

      assert.equal(result.retryCount, 3);
      assert.equal(saved.status, 'SUSPENDED');
      assert.equal(saved.retryCount, 3);
    });

    it('tarjeta 9999 sin retryCount previo: el contador arranca en 1', async () => {
      const subscription = makeSubscription({ cardLast4: '9999', retryCount: undefined });
      const { result } = await adapter.bill([subscription], subscription.id, {});

      assert.equal(result.retryCount, 1);
    });

    it('SUSPENDED + forceRetry + tarjeta 9999: reactiva, falla y vuelve a suspender (retryCount 5)', async () => {
      const subscription = makeSubscription({ status: 'SUSPENDED', cardLast4: '9999', retryCount: 4 });
      const { result, persisted } = await adapter.bill([subscription], subscription.id, { forceRetry: true });
      const saved = byId(persisted, subscription.id);

      assert.equal(result.code, 'GATEWAY_TIMEOUT');
      assert.equal(result.retryCount, 5);
      assert.equal(saved.status, 'SUSPENDED');
      assert.equal(saved.retryCount, 5);
    });

    it('un cobro exitoso NO reinicia retryCount (comportamiento heredado)', async () => {
      const subscription = makeSubscription({ retryCount: 2 });
      const { persisted } = await adapter.bill([subscription], subscription.id, {});

      assert.equal(byId(persisted, subscription.id).retryCount, 2);
    });
  });
}

module.exports = { defineGoldenMasterSuite, assertClose };
