'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../../src/infrastructure/http/createApp');

function fakeUseCases(overrides = {}) {
  return {
    processBilling: {
      execute: async (id, options) => ({ success: true, code: 'BILLING_PROCESSED', subId: id, echoedOptions: options }),
    },
    batchBilling: { execute: async () => ({ processedCount: 0, results: [] }) },
    listSubscriptions: { execute: async () => [{ id: 'sub_1' }] },
    ...overrides,
  };
}

async function withServer(useCases, run) {
  const app = createApp({ ...useCases, logger: { error() {} } });
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeIdleConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

const postJson = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

describe('Adaptador HTTP (Express)', () => {
  it('GET /health responde UP', async () => {
    await withServer(fakeUseCases(), async (base) => {
      const response = await fetch(`${base}/health`);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.status, 'UP');
    });
  });

  it('POST /bill filtra las opciones con lista blanca', async () => {
    await withServer(fakeUseCases(), async (base) => {
      const response = await postJson(`${base}/api/subscriptions/sub_1/bill`,
        JSON.stringify({ promoCode: 'FAST2026', forceRetry: true, hack: 'x' }));
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(body.echoedOptions, { forceRetry: true, promoCode: 'FAST2026' });
    });
  });

  it('POST /bill ignora forceRetry no booleano y promoCode no textual; funciona sin cuerpo', async () => {
    await withServer(fakeUseCases(), async (base) => {
      const tricky = await postJson(`${base}/api/subscriptions/sub_1/bill`,
        JSON.stringify({ forceRetry: 'true', promoCode: 123 }));
      assert.deepEqual((await tricky.json()).echoedOptions, {});

      const empty = await fetch(`${base}/api/subscriptions/sub_1/bill`, { method: 'POST' });
      assert.deepEqual((await empty.json()).echoedOptions, {});
    });
  });

  it('POST /bill devuelve 400 cuando el cobro es rechazado', async () => {
    const processBilling = {
      execute: async () => ({ success: false, code: 'ERR_SUSPENDED', msg: 'Cuenta suspendida por mora' }),
    };
    await withServer(fakeUseCases({ processBilling }), async (base) => {
      const response = await postJson(`${base}/api/subscriptions/sub_1/bill`, '{}');
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'ERR_SUSPENDED');
    });
  });

  it('rechaza identificadores inválidos', async () => {
    await withServer(fakeUseCases(), async (base) => {
      const response = await postJson(`${base}/api/subscriptions/bad%20id/bill`, '{}');
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'ERR_INVALID_ID');
    });
  });

  it('JSON malformado => 400 y cuerpo demasiado grande => 413', async () => {
    await withServer(fakeUseCases(), async (base) => {
      const malformed = await postJson(`${base}/api/subscriptions/sub_1/bill`, '{bad');
      assert.equal(malformed.status, 400);
      assert.equal((await malformed.json()).error, 'INVALID_JSON');

      const huge = await postJson(`${base}/api/subscriptions/sub_1/bill`, JSON.stringify({ promoCode: 'x'.repeat(20000) }));
      assert.equal(huge.status, 413);
    });
  });

  it('errores inesperados => 500 sin filtrar stack ni mensaje interno', async () => {
    const processBilling = {
      execute: async () => {
        throw new Error('disk exploded at /secret/path');
      },
    };
    await withServer(fakeUseCases({ processBilling }), async (base) => {
      const response = await postJson(`${base}/api/subscriptions/sub_1/bill`, '{}');
      const body = await response.json();
      assert.equal(response.status, 500);
      assert.equal(body.error, 'INTERNAL_BILLING_FAILURE');
      assert.ok(body.correlationId);
      assert.equal(JSON.stringify(body).includes('disk exploded'), false);
      assert.equal(body.stack, undefined);
    });
  });

  it('GET /api/subscriptions y POST /batch-run delegan en los casos de uso', async () => {
    await withServer(fakeUseCases(), async (base) => {
      const list = await (await fetch(`${base}/api/subscriptions`)).json();
      assert.deepEqual(list, { count: 1, data: [{ id: 'sub_1' }] });

      const batch = await fetch(`${base}/api/subscriptions/batch-run`, { method: 'POST' });
      assert.deepEqual(await batch.json(), { processedCount: 0, results: [] });
    });
  });
});
