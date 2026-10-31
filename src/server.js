'use strict';

/**
 * COMPOSITION ROOT: único lugar donde se conectan puertos con adaptadores.
 */

const { randomUUID } = require('node:crypto');
const { loadConfig } = require('./infrastructure/config');
const { FileSubscriptionRepository } = require('./infrastructure/FileSubscriptionRepository');
const { InMemoryLockManager } = require('./infrastructure/InMemoryLockManager');
const { MockPaymentGateway } = require('./infrastructure/MockPaymentGateway');
const { createApp } = require('./infrastructure/http/createApp');
const { ProcessBillingUseCase } = require('./application/ProcessBillingUseCase');
const { BatchBillingUseCase } = require('./application/BatchBillingUseCase');
const { ListSubscriptionsUseCase } = require('./application/ListSubscriptionsUseCase');

function buildContainer(config) {
  const repository = new FileSubscriptionRepository(config.dataFile);
  // TDR-DEC-01: pasarela simulada. El adaptador real recibirá config.gatewayApiKey.
  const gateway = new MockPaymentGateway({ latencyMs: config.gatewayLatencyMs });

  const processBilling = new ProcessBillingUseCase({
    repository,
    gateway,
    locks: new InMemoryLockManager(),
    clock: { now: () => new Date() },
    newReference: () => `TX_${randomUUID()}`,
  });

  return {
    processBilling,
    batchBilling: new BatchBillingUseCase({ repository, processBilling }),
    listSubscriptions: new ListSubscriptionsUseCase({ repository }),
  };
}

function start(config = loadConfig()) {
  const app = createApp(buildContainer(config));
  return app.listen(config.port, () => {
    console.log(`[fastpay-billing-service] escuchando en http://localhost:${config.port}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = { buildContainer, start };
