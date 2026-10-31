'use strict';

class ListSubscriptionsUseCase {
  #repository;

  constructor({ repository }) {
    this.#repository = repository;
  }

  async execute() {
    const subscriptions = await this.#repository.findAll();
    return subscriptions.map((subscription) => subscription.toPrimitives());
  }
}

module.exports = { ListSubscriptionsUseCase };
