'use strict';

const { ProcessBillingUseCase } = require('../../src/application/ProcessBillingUseCase');
const { InMemorySubscriptionRepository } = require('../../src/infrastructure/InMemorySubscriptionRepository');
const { InMemoryLockManager } = require('../../src/infrastructure/InMemoryLockManager');
const { MockPaymentGateway } = require('../../src/infrastructure/MockPaymentGateway');
const { FIXED_NOW } = require('../fixtures/goldenCases');

function sequentialReferences(prefix = 'TX_TEST') {
  let counter = 0;
  return () => `${prefix}_${++counter}`;
}

function buildUseCase(subscriptions, overrides = {}) {
  const repository = new InMemorySubscriptionRepository(subscriptions);
  const gateway = overrides.gateway ?? new MockPaymentGateway({ latencyMs: overrides.latencyMs ?? 0 });
  const useCase = new ProcessBillingUseCase({
    repository,
    gateway,
    locks: new InMemoryLockManager(),
    clock: { now: () => overrides.now ?? FIXED_NOW },
    newReference: sequentialReferences(),
    ...(overrides.calculator ? { calculator: overrides.calculator } : {}),
  });
  return { useCase, repository, gateway };
}

function createRefactoredAdapter() {
  return {
    async bill(subscriptions, id, options = {}) {
      const { useCase, repository } = buildUseCase(subscriptions);
      const result = await useCase.execute(id, options);
      return { result, persisted: repository.snapshot() };
    },
  };
}

module.exports = { createRefactoredAdapter, buildUseCase, sequentialReferences };
