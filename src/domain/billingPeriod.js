'use strict';

/**
 * Clave del período de facturación (UTC): "2026-10" para MONTHLY, "2026" para ANNUAL.
 * Dos cobros con la misma clave pertenecen al mismo período => el segundo es duplicado.
 */
function periodKey(billingCycle, date) {
  const year = date.getUTCFullYear();
  if (billingCycle === 'ANNUAL') {
    return String(year);
  }
  return `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

module.exports = { periodKey };
