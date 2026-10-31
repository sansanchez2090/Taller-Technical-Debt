'use strict';

/**
 * Puerto de salida: exclusión mutua por clave.
 * runExclusive(key, task) ejecuta task en serie con otras tareas de la misma clave.
 */
class LockManagerPort {
  async runExclusive() {
    throw new Error(`${this.constructor.name}.runExclusive no implementado`);
  }
}

module.exports = { LockManagerPort };
