'use strict';

const { LockManagerPort } = require('../ports/LockManagerPort');

/**
 * Mutex por clave dentro de UN proceso (cola de promesas).
 * Limitación consciente (TDR-DEC-02): no protege entre varias réplicas.
 */
class InMemoryLockManager extends LockManagerPort {
  #tails = new Map();

  async runExclusive(key, task) {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    const result = previous.then(() => task());
    const tail = result.catch(() => {});
    this.#tails.set(key, tail);
    try {
      return await result;
    } finally {
      if (this.#tails.get(key) === tail) {
        this.#tails.delete(key);
      }
    }
  }
}

module.exports = { InMemoryLockManager };
