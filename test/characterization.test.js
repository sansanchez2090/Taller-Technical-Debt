'use strict';

/**
 * PRUEBAS DE CARACTERIZACIÓN (GOLDEN MASTER) - FASE 4, PASO 1
 *
 * Congelan el comportamiento REAL del motor legado ANTES de refactorizar.
 * Regla de oro: ningún cambio en el código de negocio sin esta red de seguridad.
 *
 * Ejecutar solo este archivo (el motor legado escribe en data/subscriptions.json):
 *   node --test --test-concurrency=1 test/characterization.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { defineGoldenMasterSuite, assertClose } = require('./helpers/goldenMaster');
const { createLegacyAdapter } = require('./helpers/legacyAdapter');
const { makeSubscription } = require('./fixtures/goldenCases');

const legacy = createLegacyAdapter();

describe('Golden Master del motor LEGADO', () => {
  before(() => legacy.snapshot());
  after(() => legacy.restore());

  defineGoldenMasterSuite({ label: 'LEGADO', adapter: legacy, tolerance: 1e-6 });

  describe('[LEGADO] defectos conocidos que el refactor DEBE corregir (se documentan, no son requisitos)', () => {
    it('DT-07 (coma flotante): el total NO se redondea a centavos', async () => {
      const subscription = makeSubscription({ plan: 'ENTERPRISE', country: 'CO', amount: 299.99 });
      const { result } = await legacy.bill([subscription], subscription.id, {});
      const total = result.breakdown.finalTotal;

      assert.notEqual(Math.round(total * 100) / 100, total);
    });

    it('DT-03 (sin idempotencia): dos cobros del mismo período se aceptan y se acumulan', async () => {
      const subscription = makeSubscription({ amount: 100 });
      legacy.engine.resetSubscriptions([subscription]);

      const first = legacy.engine.processSubscriptionBilling(subscription.id, {});
      const second = legacy.engine.processSubscriptionBilling(subscription.id, {});
      const saved = legacy.engine.getAllSubscriptions()[0];

      assert.equal(first.success, true);
      assert.equal(second.success, true);
      assertClose(saved.balance, 216.5, 1e-6, 'saldo con doble cobro');
    });

    it('DT-02 (secretos): el log de error de pasarela imprime la clave secreta', async () => {
      const subscription = makeSubscription({ cardLast4: '9999' });
      legacy.engine.resetSubscriptions([subscription]);

      const lines = [];
      const original = console.log;
      console.log = (...args) => lines.push(args.join(' '));
      try {
        legacy.engine.processSubscriptionBilling(subscription.id, {});
      } finally {
        console.log = original;
      }

      assert.ok(lines.some((line) => line.includes('sk_live_')));
    });
  });
});
