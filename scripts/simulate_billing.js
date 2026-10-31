/**
 * SIMULADOR DE TRÁFICO Y CONCURRENCIA - FASTPAY GLOBAL
 * Este script evidencia los efectos de la deuda técnica:
 * 1. Condición de carrera por persistencia no atómica (Cobro duplicado).
 * 2. Bloqueo de concurrencia e inconsistencia de saldos.
 * 3. Errores de cálculo en coma flotante.
 */

const billingEngine = require('../src/legacy_billing_engine');
const fs = require('fs');
const path = require('path');

const BACKUP_FILE = path.join(__dirname, '../data/subscriptions_backup.json');

async function runSimulation() {
  console.log('===============================================================');
  console.log('⚡ INICIANDO SIMULACIÓN DE FACTURACIÓN CONCURRENTE (FASTPAY)');
  console.log('===============================================================');

  // Respaldar estado original para poder restaurarlo
  const originalData = billingEngine.getAllSubscriptions();
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(originalData, null, 2));

  const targetSubId = "sub_101"; // Carlos Mendoza - ENTERPRISE ($299.99 USD)
  console.log(`\n🎯 Objetivo: Procesar cobro para la suscripción [${targetSubId}]`);
  console.log(`👤 Cliente: ${originalData.find(s => s.id === targetSubId).customerEmail}`);
  console.log(`💰 Saldo inicial: $${originalData.find(s => s.id === targetSubId).balance.toFixed(2)} USD`);

  console.log('\n🚀 Disparando 5 solicitudes de cobro casi simultáneas...');
  console.log('   (Simulando reintentos del webhook de Stripe + clic impaciente del usuario)\n');

  // Disparar llamadas asíncronas concurrentes sobre la misma función síncrona/bloqueante
  const promises = [];
  for (let i = 1; i <= 5; i++) {
    promises.push(
      new Promise((resolve) => {
        // Ligero jitter de milisegundos para forzar entrelazado de lectura/escritura
        const delay = Math.floor(Math.random() * 15);
        setTimeout(() => {
          const startTime = Date.now();
          const result = billingEngine.processSubscriptionBilling(targetSubId, {
            promoCode: (i === 1 ? "FAST2026" : undefined)
          });
          const duration = Date.now() - startTime;
          resolve({ attempt: i, result, duration });
        }, delay);
      })
    );
  }

  const results = await Promise.all(promises);

  console.log('📊 RESULTADOS DE LAS 5 PETICIONES:');
  console.log('---------------------------------------------------------------');
  let successfulCharges = 0;
  results.forEach(res => {
    if (res.result.success) {
      successfulCharges++;
      console.log(`✅ [Intento #${res.attempt}] COBRO EXITOSO: $${res.result.breakdown.finalTotal.toFixed(4)} USD | Ref: ${res.result.transactionReference} (${res.duration}ms)`);
    } else {
      console.log(`❌ [Intento #${res.attempt}] RECHAZADO: ${res.result.code} - ${res.result.msg}`);
    }
  });

  // Verificar estado en el archivo plano
  const updatedData = billingEngine.getAllSubscriptions();
  const targetUpdated = updatedData.find(s => s.id === targetSubId);

  console.log('\n===============================================================');
  console.log('🔍 EVIDENCIA FORENSE DE DEUDA TÉCNICA:');
  console.log('===============================================================');
  console.log(`📌 Cobros procesados exitosamente: ${successfulCharges} de 5.`);
  console.log(`💳 Saldo registrado en base de datos: $${targetUpdated.balance} USD`);
  console.log(`⚠️  Fecha última facturación: ${targetUpdated.lastBilledAt}`);

  if (successfulCharges > 1) {
    console.log(`\n🚨 ALERTA CRÍTICA: ¡INCIDENCIA DE COBRO DUPLICADO/MÚLTIPLE DETECTADA!`);
    console.log(`   Se realizaron ${successfulCharges} cobros al cliente por falta de idempotencia y control de transacciones.`);
    console.log(`   Costo para la empresa: Soporte al cliente, devolución bancaria ($15 fee) y reputación.`);
  }

  // Restaurar datos originales
  billingEngine.resetSubscriptions(originalData);
  if (fs.existsSync(BACKUP_FILE)) {
    fs.unlinkSync(BACKUP_FILE);
  }
  console.log('\n[INFO] Archivo subscriptions.json restaurado al estado base inicial.');
  console.log('===============================================================\n');
}

runSimulation();
