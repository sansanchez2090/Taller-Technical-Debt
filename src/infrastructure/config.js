'use strict';

const path = require('node:path');

/** Toda la configuración (y los secretos) llegan por variables de entorno. Ver .env.example */
function loadConfig(env = process.env) {
  return Object.freeze({
    port: Number.parseInt(env.PORT ?? '4000', 10),
    dataFile: env.DB_FILE ? path.resolve(env.DB_FILE) : path.join(__dirname, '../../data/subscriptions.json'),
    gatewayApiKey: env.PAYMENT_GATEWAY_API_KEY ?? '',
  });
}

module.exports = { loadConfig };
