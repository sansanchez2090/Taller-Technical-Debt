/**
 * FASTPAY GLOBAL - API SERVER (LEGACY)
 * Microservicio acoplado directamente al motor de facturación.
 */

const express = require('express');
const billingEngine = require('./legacy_billing_engine');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// Endpoint de diagnóstico rápido
app.get('/health', (req, res) => {
  res.json({
    service: "fastpay-billing-service",
    version: "1.0.0-legacy",
    status: "DEGRADED",
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime()
  });
});

// Endpoint de consulta de suscripciones
app.get('/api/subscriptions', (req, res) => {
  try {
    const data = billingEngine.getAllSubscriptions();
    res.json({ count: data.length, data });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Endpoint crítico: Procesar cobro recurrente
// Sin rate limiting, sin bloqueo transaccional, susceptible a condiciones de carrera
app.post('/api/subscriptions/:id/bill', (req, res) => {
  const subId = req.params.id;
  const options = req.body || {};

  try {
    const result = billingEngine.processSubscriptionBilling(subId, options);
    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err) {
    // Fuga de información en error 500 (Deuda de Seguridad)
    return res.status(500).json({
      error: "INTERNAL_BILLING_FAILURE",
      message: err.message,
      stack: err.stack
    });
  }
});

// Simulación de batch de facturación nocturna masiva
app.post('/api/subscriptions/batch-run', (req, res) => {
  try {
    const all = billingEngine.getAllSubscriptions();
    const results = [];

    // Bucle síncrono bloqueante (bloquea todo el servidor)
    for (const sub of all) {
      if (sub.status === "ACTIVE") {
        const outcome = billingEngine.processSubscriptionBilling(sub.id, {});
        results.push(outcome);
      }
    }

    res.json({
      processedCount: results.length,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚨 [FASTPAY LEGACY] Servidor ejecutándose en http://localhost:${PORT}`);
    console.log(`⚠️  ATENCIÓN: Servicio con alta deuda técnica acumulada.`);
    console.log(`- GET  /health`);
    console.log(`- GET  /api/subscriptions`);
    console.log(`- POST /api/subscriptions/:id/bill`);
    console.log(`- POST /api/subscriptions/batch-run`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
