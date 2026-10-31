'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');

const SUBSCRIPTION_ID_PATTERN = /^[\w-]{1,64}$/;
const MAX_PROMO_CODE_LENGTH = 32;

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res)).catch(next);
};

/** Lista blanca de opciones aceptadas desde el exterior. */
function sanitizeOptions(body) {
  const options = {};
  if (body && body.forceRetry === true) {
    options.forceRetry = true;
  }
  if (body && typeof body.promoCode === 'string') {
    options.promoCode = body.promoCode.slice(0, MAX_PROMO_CODE_LENGTH);
  }
  return options;
}

/** Adaptador de entrada (controlador HTTP). Solo traduce HTTP <-> casos de uso. */
function createApp({ processBilling, batchBilling, listSubscriptions, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (req, res) => {
    res.json({ service: 'fastpay-billing-service', version: '2.0.0', status: 'UP', uptime: process.uptime() });
  });

  app.get('/api/subscriptions', asyncHandler(async (req, res) => {
    const data = await listSubscriptions.execute();
    res.json({ count: data.length, data });
  }));

  app.post('/api/subscriptions/batch-run', asyncHandler(async (req, res) => {
    res.json(await batchBilling.execute());
  }));

  app.post('/api/subscriptions/:id/bill', asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!SUBSCRIPTION_ID_PATTERN.test(id)) {
      res.status(400).json({ success: false, code: 'ERR_INVALID_ID', msg: 'Identificador de suscripcion invalido' });
      return;
    }
    const result = await processBilling.execute(id, sanitizeOptions(req.body));
    res.status(result.success ? 200 : 400).json(result);
  }));

  app.use((err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'INVALID_JSON' });
      return;
    }
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });
      return;
    }
    const correlationId = randomUUID();
    logger.error(`[${correlationId}] ${err.stack || err.message}`);
    res.status(500).json({ error: 'INTERNAL_BILLING_FAILURE', correlationId });
  });

  return app;
}

module.exports = { createApp };
