'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Money } = require('../../src/domain/Money');
const { Subscription } = require('../../src/domain/Subscription');
const { GatewayTimeoutError } = require('../../src/ports/PaymentGatewayPort');
const { MockPaymentGateway } = require('../../src/infrastructure/MockPaymentGateway');
const { InMemoryLockManager } = require('../../src/infrastructure/InMemoryLockManager');
const { FileSubscriptionRepository } = require('../../src/infrastructure/FileSubscriptionRepository');
const { loadConfig } = require('../../src/infrastructure/config');
const { makeSubscription } = require('../fixtures/goldenCases');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('MockPaymentGateway', () => {
  const request = { reference: 'TX_1', amount: Money.fromCents(500), cardLast4: '4242', idempotencyKey: 'k1' };

  it('aprueba y es idempotente por llave', async () => {
    const gateway = new MockPaymentGateway();
    const first = await gateway.charge(request);
    const second = await gateway.charge({ ...request, reference: 'TX_2' });

    assert.equal(first.status, 'APPROVED');
    assert.equal(second.reference, 'TX_1');
    assert.equal(gateway.charges.length, 1);
  });

  it('la tarjeta 9999 provoca GatewayTimeoutError', async () => {
    await assert.rejects(new MockPaymentGateway().charge({ ...request, cardLast4: '9999' }), GatewayTimeoutError);
  });

  it('tarjetas fallidas y latencia son configurables', async () => {
    const gateway = new MockPaymentGateway({ failingCardLast4: ['0000'], latencyMs: 2 });
    await assert.rejects(gateway.charge({ ...request, cardLast4: '0000' }), GatewayTimeoutError);
    assert.equal((await gateway.charge({ ...request, cardLast4: '9999', idempotencyKey: 'k9' })).status, 'APPROVED');
  });
});

describe('InMemoryLockManager', () => {
  it('serializa tareas de la misma clave', async () => {
    const locks = new InMemoryLockManager();
    const events = [];
    const task = (name, ms) => async () => {
      events.push(`start:${name}`);
      await sleep(ms);
      events.push(`end:${name}`);
    };

    await Promise.all([locks.runExclusive('k', task('a', 15)), locks.runExclusive('k', task('b', 1))]);

    assert.deepEqual(events, ['start:a', 'end:a', 'start:b', 'end:b']);
  });

  it('claves distintas se ejecutan en paralelo', async () => {
    const locks = new InMemoryLockManager();
    const events = [];
    const task = (name) => async () => {
      events.push(`start:${name}`);
      await sleep(5);
    };

    await Promise.all([locks.runExclusive('x', task('x')), locks.runExclusive('y', task('y'))]);

    assert.deepEqual(events, ['start:x', 'start:y']);
  });

  it('un error no envenena la cola', async () => {
    const locks = new InMemoryLockManager();
    await assert.rejects(locks.runExclusive('k', async () => { throw new Error('boom'); }), /boom/);
    assert.equal(await locks.runExclusive('k', async () => 'ok'), 'ok');
  });
});

describe('FileSubscriptionRepository', () => {
  let directory;
  let file;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fastpay-repo-'));
    file = path.join(directory, 'subscriptions.json');
    await fs.writeFile(file, JSON.stringify([makeSubscription({ id: 'sub_A' }), makeSubscription({ id: 'sub_B' })]));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('busca por id y devuelve null si no existe', async () => {
    const repository = new FileSubscriptionRepository(file);
    assert.equal((await repository.findById('sub_A')).id, 'sub_A');
    assert.equal(await repository.findById('nope'), null);
    assert.equal((await repository.findAll()).length, 2);
  });

  it('guarda actualizaciones e inserta nuevas suscripciones', async () => {
    const repository = new FileSubscriptionRepository(file);
    const existing = await repository.findById('sub_A');
    existing.balance = Money.fromCents(500);
    await repository.save(existing);
    await repository.save(Subscription.fromPrimitives(makeSubscription({ id: 'sub_C' })));

    const stored = JSON.parse(await fs.readFile(file, 'utf-8'));
    assert.deepEqual(stored.map((record) => record.id), ['sub_A', 'sub_B', 'sub_C']);
    assert.equal(stored[0].balance, 5);
  });

  it('guardados concurrentes de suscripciones distintas no pierden actualizaciones', async () => {
    const repository = new FileSubscriptionRepository(file);
    const a = await repository.findById('sub_A');
    const b = await repository.findById('sub_B');
    a.balance = Money.fromCents(100);
    b.balance = Money.fromCents(200);

    await Promise.all([repository.save(a), repository.save(b)]);

    const stored = JSON.parse(await fs.readFile(file, 'utf-8'));
    assert.deepEqual(stored.map((record) => record.balance), [1, 2]);
    assert.deepEqual(await fs.readdir(directory), ['subscriptions.json']);
  });
});

describe('loadConfig', () => {
  it('usa valores por defecto seguros', () => {
    const config = loadConfig({});
    assert.equal(config.port, 4000);
    assert.equal(config.gatewayApiKey, '');
    assert.match(config.dataFile, /subscriptions\.json$/);
  });

  it('lee puerto, archivo y clave desde el entorno', () => {
    const config = loadConfig({ PORT: '5000', DB_FILE: './x.json', PAYMENT_GATEWAY_API_KEY: 'sk_test_1' });
    assert.equal(config.port, 5000);
    assert.equal(config.gatewayApiKey, 'sk_test_1');
    assert.equal(path.basename(config.dataFile), 'x.json');
  });
});
