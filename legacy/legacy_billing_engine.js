/**
 * FASTPAY GLOBAL - BILLING ENGINE (LEGACY)
 * ADVERTENCIA: Código heredado con alta acumulación de deuda técnica.
 * No modificar sin pruebas de caracterización previas.
 */

const fs = require('fs');
const path = require('path');

// CONFIGURACIÓN HARDCODEADA (Deuda de Seguridad / Configuración)
const API_SECRET_GATEWAY = "sk_live_fastpay_998877_insecure_key_never_commit";
const DB_FILE = path.join(__dirname, '../data/subscriptions.json');

// Estado global mutable (Deuda de Concurrencia y Testeabilidad)
let LAST_BATCH_ID = 0;
let TOTAL_PROCESSED_TODAY = 0;

/**
 * GOD METHOD: Procesa el cobro de una suscripción
 * Acopla reglas de negocio, persistencia en archivo, llamadas a pasarela e impuestos.
 * Complejidad Ciclomática > 16 | Complejidad Cognitiva > 25
 */
function processSubscriptionBilling(subId, options) {
  // 1. Lectura síncrona bloqueante del archivo (Deuda de Desempeño)
  const rawData = fs.readFileSync(DB_FILE, 'utf-8');
  const subs = JSON.parse(rawData);

  // Búsqueda lineal
  let target = null;
  let targetIndex = -1;
  for (let i = 0; i < subs.length; i++) {
    if (subs[i].id === subId) {
      target = subs[i];
      targetIndex = i;
      break;
    }
  }

  if (!target) {
    return { success: false, code: "ERR_SUB_NOT_FOUND", msg: "Suscripcion no existe" };
  }

  // Validación de estado con código muerto o anidación excesiva
  if (target.status !== "ACTIVE") {
    if (target.status === "SUSPENDED") {
      if (options && options.forceRetry === true) {
        // Atajo deliberado: reactivar a la fuerza sin validar saldo
        target.status = "ACTIVE";
      } else {
        return { success: false, code: "ERR_SUSPENDED", msg: "Cuenta suspendida por mora" };
      }
    } else {
      return { success: false, code: "ERR_INACTIVE", msg: "Suscripcion inactiva" };
    }
  }

  // 2. Cálculo de Impuestos y Recargos (Números mágicos y Primitive Obsession)
  let baseAmount = target.amount;
  let taxRate = 0.0;
  let surcharge = 0.0;

  if (target.country === "CO") {
    taxRate = 0.19; // IVA Colombia
    if (baseAmount > 200) {
      surcharge = 4.5; // Recargo bancario nacional
    }
  } else if (target.country === "MX") {
    taxRate = 0.16; // IVA México
    if (target.paymentMethod === "WIRE_TRANSFER") {
      surcharge = 8.0;
    }
  } else if (target.country === "AR") {
    // Caso tributario caótico: retención acumulada
    taxRate = 0.21 + 0.35; // 56% de carga impositiva
    surcharge = 12.5;
  } else if (target.country === "US") {
    taxRate = 0.0825; // Tax estándar
  } else {
    taxRate = 0.10; // Default internacional no documentado
  }

  // Regla especial de planes VIP / Descuentos
  let discount = 0;
  if (target.plan === "ENTERPRISE_PLUS") {
    if (target.billingCycle === "ANNUAL") {
      discount = baseAmount * 0.15; // 15% descuento anual
    } else {
      discount = 25.0; // Descuento plano
    }
  } else if (target.plan === "ENTERPRISE") {
    if (options && options.promoCode === "FAST2026") {
      discount = 30.0;
    }
  }

  // Bug de cálculo con coma flotante (IEEE 754)
  const taxableAmount = baseAmount - discount;
  const taxes = taxableAmount * taxRate;
  const finalTotal = taxableAmount + taxes + surcharge;

  // 3. Simulación de llamada a Pasarela Externa (Acoplada e insegura)
  LAST_BATCH_ID++;
  const transactionReference = "TX_" + Date.now() + "_" + LAST_BATCH_ID;

  // Simulación de latencia de red y riesgo de fallo de pasarela
  const isGatewayDown = (target.cardLast4 === "9999");
  if (isGatewayDown) {
    // Incrementar reintentos sin backoff
    target.retryCount = (target.retryCount || 0) + 1;
    if (target.retryCount >= 3) {
      target.status = "SUSPENDED";
    }
    // Escribir archivo en caso de fallo
    subs[targetIndex] = target;
    fs.writeFileSync(DB_FILE, JSON.stringify(subs, null, 2));

    console.log("[GATEWAY_ERROR] Fallo cobro para " + target.customerEmail + " con key: " + API_SECRET_GATEWAY);
    return {
      success: false,
      code: "GATEWAY_TIMEOUT",
      ref: transactionReference,
      retryCount: target.retryCount
    };
  }

  // 4. Mutación directa y persistencia (Riesgo de condición de carrera)
  target.balance = target.balance + finalTotal; // Posible acumulación errónea
  target.lastBilledAt = new Date().toISOString();
  target.lastTransactionRef = transactionReference;
  TOTAL_PROCESSED_TODAY++;

  subs[targetIndex] = target;

  // Escritura bloqueante síncrona
  fs.writeFileSync(DB_FILE, JSON.stringify(subs, null, 2));

  return {
    success: true,
    code: "BILLING_PROCESSED",
    subId: target.id,
    customer: target.customerEmail,
    breakdown: {
      baseAmount: baseAmount,
      discount: discount,
      taxes: taxes,
      surcharge: surcharge,
      finalTotal: finalTotal
    },
    transactionReference: transactionReference,
    processedAt: target.lastBilledAt
  };
}

/**
 * Función auxiliar para obtener todas las suscripciones
 */
function getAllSubscriptions() {
  const rawData = fs.readFileSync(DB_FILE, 'utf-8');
  return JSON.parse(rawData);
}

/**
 * Función para resetear datos (útil para pruebas o reinicio de simulación)
 */
function resetSubscriptions(initialData) {
  fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

module.exports = {
  processSubscriptionBilling,
  getAllSubscriptions,
  resetSubscriptions,
  DB_FILE
};
