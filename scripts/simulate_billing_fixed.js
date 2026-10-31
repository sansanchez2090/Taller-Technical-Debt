'use strict';

/**
 * Misma simulación que simulate_billing.js, pero contra el servicio refactorizado.
 * Trabaja sobre una COPIA temporal de data/subscriptions.json (no modifica el original).
 */

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { buildContainer } = require('../src/server');

const SOURCE_FILE = path.join(__dirname, '../data/subscriptions.json');
const TARGET_ID = 'sub_101';

async function main() {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fastpay-sim-'));
  const dataFile = path.join(workDir, 'subscriptions.json');

  try {
    await fs.copyFile(SOURCE_FILE, dataFile);
    const { processBilling } = buildContainer({ dataFile, gatewayLatencyMs: 20 });
    const initial = JSON.parse(await fs.readFile(dataFile, 'utf-8')).find((s) => s.id === TARGET_ID);

    console.log('===============================================================');
    console.log('SIMULACION (VERSION CORREGIDA): 5 solicitudes simultaneas');
    console.log('===============================================================');
    console.log(`Objetivo: ${TARGET_ID} (${initial.customerEmail}) | saldo inicial: $${initial.balance.toFixed(2)} USD\n`);

    const attempts = Array.from({ length: 5 }, (_, index) =>
      processBilling.execute(TARGET_ID, { promoCode: index === 0 ? 'FAST2026' : undefined }),
    );
    const results = await Promise.all(attempts);

    results.forEach((result, index) => {
      const detail = result.breakdown ? `$${result.breakdown.finalTotal.toFixed(2)} USD` : '(replay idempotente)';
      console.log(`[Intento #${index + 1}] ${result.code} ${detail} | Ref: ${result.transactionReference}`);
    });

    const real = results.filter((result) => result.code === 'BILLING_PROCESSED').length;
    const final = JSON.parse(await fs.readFile(dataFile, 'utf-8')).find((s) => s.id === TARGET_ID);
    console.log(`\nCobros reales ejecutados: ${real} de 5`);
    console.log(`Saldo final en la base: $${final.balance.toFixed(2)} USD`);
    console.log('===============================================================');
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
