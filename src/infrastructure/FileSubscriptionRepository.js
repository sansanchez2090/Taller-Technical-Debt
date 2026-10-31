'use strict';

const fs = require('node:fs/promises');
const { SubscriptionRepositoryPort } = require('../ports/SubscriptionRepositoryPort');
const { Subscription } = require('../domain/Subscription');

/**
 * Adaptador de persistencia en archivo JSON:
 * - I/O asíncrono (no bloquea el Event Loop).
 * - Cola interna: lectura-modificación-escritura serializada (sin "lost updates").
 * - Escritura atómica: archivo temporal + rename.
 */
class FileSubscriptionRepository extends SubscriptionRepositoryPort {
  #filePath;
  #queue = Promise.resolve();

  constructor(filePath) {
    super();
    this.#filePath = filePath;
  }

  findById(id) {
    return this.#enqueue(async () => {
      const record = (await this.#readAll()).find((candidate) => candidate.id === id);
      return record ? Subscription.fromPrimitives(record) : null;
    });
  }

  findAll() {
    return this.#enqueue(async () => {
      const records = await this.#readAll();
      return records.map((record) => Subscription.fromPrimitives(record));
    });
  }

  save(subscription) {
    return this.#enqueue(async () => {
      const records = await this.#readAll();
      const index = records.findIndex((candidate) => candidate.id === subscription.id);
      if (index === -1) {
        records.push(subscription.toPrimitives());
      } else {
        records[index] = subscription.toPrimitives();
      }
      await this.#writeAll(records);
    });
  }

  #enqueue(operation) {
    const run = this.#queue.then(operation);
    this.#queue = run.catch(() => {});
    return run;
  }

  async #readAll() {
    return JSON.parse(await fs.readFile(this.#filePath, 'utf-8'));
  }

  async #writeAll(records) {
    const temporaryFile = `${this.#filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(records, null, 2));
    await fs.rename(temporaryFile, this.#filePath);
  }
}

module.exports = { FileSubscriptionRepository };
