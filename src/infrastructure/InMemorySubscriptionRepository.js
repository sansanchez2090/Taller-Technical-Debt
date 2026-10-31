'use strict';

const { SubscriptionRepositoryPort } = require('../ports/SubscriptionRepositoryPort');
const { Subscription } = require('../domain/Subscription');

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Adaptador en memoria para pruebas y desarrollo. Simula la frontera de persistencia clonando. */
class InMemorySubscriptionRepository extends SubscriptionRepositoryPort {
  #records;

  constructor(initial = []) {
    super();
    this.#records = new Map(initial.map((record) => [record.id, clone(record)]));
  }

  async findById(id) {
    const record = this.#records.get(id);
    return record ? Subscription.fromPrimitives(clone(record)) : null;
  }

  async findAll() {
    return [...this.#records.values()].map((record) => Subscription.fromPrimitives(clone(record)));
  }

  async save(subscription) {
    this.#records.set(subscription.id, subscription.toPrimitives());
  }

  snapshot() {
    return [...this.#records.values()].map((record) => clone(record));
  }
}

module.exports = { InMemorySubscriptionRepository };
