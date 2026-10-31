'use strict';

const fs = require('node:fs');

/**
 * Carga el motor legado desde legacy/ (post-refactor) o src/ (estado original).
 */
function loadLegacyEngine() {
  const candidates = ['../../legacy/legacy_billing_engine', '../../src/legacy_billing_engine'];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') {
        throw error;
      }
    }
  }
  throw new Error('No se encontró legacy_billing_engine.js ni en legacy/ ni en src/');
}

function quiet(fn) {
  const original = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = original;
  }
}

/**
 * Adaptador del motor legado: siembra el archivo JSON, ejecuta el cobro y devuelve
 * el resultado más el estado persistido. Respalda y restaura data/subscriptions.json.
 */
function createLegacyAdapter() {
  const engine = loadLegacyEngine();
  let originalContent = null;

  return {
    engine,
    snapshot() {
      originalContent = fs.readFileSync(engine.DB_FILE, 'utf-8');
    },
    restore() {
      if (originalContent !== null) {
        fs.writeFileSync(engine.DB_FILE, originalContent);
      }
    },
    async bill(subscriptions, id, options = {}) {
      engine.resetSubscriptions(subscriptions);
      const result = quiet(() => engine.processSubscriptionBilling(id, options));
      return { result, persisted: engine.getAllSubscriptions() };
    },
  };
}

module.exports = { createLegacyAdapter };
