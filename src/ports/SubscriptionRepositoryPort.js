'use strict';

/**
 * Puerto de salida: persistencia de suscripciones.
 * findById(id) => Promise<Subscription|null> | findAll() => Promise<Subscription[]> | save(subscription) => Promise<void>
 */
class SubscriptionRepositoryPort {
  async findById() {
    throw new Error(`${this.constructor.name}.findById no implementado`);
  }

  async findAll() {
    throw new Error(`${this.constructor.name}.findAll no implementado`);
  }

  async save() {
    throw new Error(`${this.constructor.name}.save no implementado`);
  }
}

module.exports = { SubscriptionRepositoryPort };
