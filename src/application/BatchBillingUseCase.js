'use strict';

/** Facturación masiva: secuencial, no bloqueante y segura ante reejecuciones (idempotente). */
class BatchBillingUseCase {
  #repository;
  #processBilling;

  constructor({ repository, processBilling }) {
    this.#repository = repository;
    this.#processBilling = processBilling;
  }

  async execute() {
    const subscriptions = await this.#repository.findAll();
    const results = [];
    for (const subscription of subscriptions) {
      if (subscription.isActive()) {
        results.push(await this.#processBilling.execute(subscription.id, {}));
      }
    }
    return { processedCount: results.length, results };
  }
}

module.exports = { BatchBillingUseCase };
