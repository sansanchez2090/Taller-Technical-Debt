'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildContainer } = require('../../src/server');
const { makeSubscription } = require('../fixtures/goldenCases');

describe('Integración: archivo + lock + pasarela (contenedor real)', () => {
  let directory;
  let dataFile;

  const readStored = async () => JSON.parse(await fs.readFile(dataFile, 'utf-8'));

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fastpay-int-'));
    dataFile = path.join(directory, 'subscriptions.json');
    const base = { lastBilledAt: '2020-01-01T00:00:00Z', amount: 100 };
    await fs.writeFile(
      dataFile,
      JSON.stringify([makeSubscription({ id: 'sub_A', ...base }), makeSubscription({ id: 'sub_B', ...base })]),
    );
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('5 cobros simultáneos de la misma suscripción generan un solo cargo', async () => {
    const { processBilling } = buildContainer({ dataFile, gatewayLatencyMs: 10 });

    const results = await Promise.all(Array.from({ length: 5 }, () => processBilling.execute('sub_A', {})));

    assert.equal(results.filter((result) => result.code === 'BILLING_PROCESSED').length, 1);
    assert.equal(results.filter((result) => result.code === 'BILLING_ALREADY_PROCESSED').length, 4);
    assert.equal((await readStored())[0].balance, 108.25);
  });

  it('cobros simultáneos de suscripciones distintas no pierden actualizaciones', async () => {
    const { processBilling } = buildContainer({ dataFile, gatewayLatencyMs: 10 });

    await Promise.all([processBilling.execute('sub_A', {}), processBilling.execute('sub_B', {})]);

    const stored = await readStored();
    assert.deepEqual(stored.map((record) => record.balance), [108.25, 108.25]);
    assert.ok(stored.every((record) => record.lastTransactionRef));
  });

  it('el lote masivo es idempotente al reejecutarse', async () => {
    const { batchBilling } = buildContainer({ dataFile });

    const first = await batchBilling.execute();
    const second = await batchBilling.execute();

    assert.equal(first.results.every((result) => result.code === 'BILLING_PROCESSED'), true);
    assert.equal(second.results.every((result) => result.code === 'BILLING_ALREADY_PROCESSED'), true);
    assert.deepEqual((await readStored()).map((record) => record.balance), [108.25, 108.25]);
  });
});
