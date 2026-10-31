'use strict';

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const BASIS_POINTS_SCALE = 10000;

/** División entera con redondeo "half away from zero" (sin coma flotante en el resultado). */
function divideRounded(numerator, denominator) {
  const half = Math.trunc(denominator / 2);
  const adjusted = numerator >= 0 ? numerator + half : numerator - half;
  return Math.trunc(adjusted / denominator) + 0; // "+ 0" normaliza -0
}

/**
 * Value Object monetario inmutable. Guarda CENTAVOS ENTEROS: elimina el bug de
 * coma flotante (Primitive Obsession) del motor legado.
 */
class Money {
  #cents;
  #currency;

  constructor(cents, currency = 'USD') {
    if (!Number.isSafeInteger(cents)) {
      throw new RangeError(`Money requiere centavos enteros, recibido: ${cents}`);
    }
    if (!CURRENCY_PATTERN.test(currency)) {
      throw new RangeError(`Moneda invalida: ${currency}`);
    }
    this.#cents = cents;
    this.#currency = currency;
    Object.freeze(this);
  }

  static fromCents(cents, currency = 'USD') {
    return new Money(cents, currency);
  }

  /** Convierte importes decimales de 2 cifras (p. ej. los del JSON) a centavos. */
  static fromDecimal(amount, currency = 'USD') {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new TypeError(`Importe invalido: ${amount}`);
    }
    return new Money(Math.round(amount * 100), currency);
  }

  static zero(currency = 'USD') {
    return new Money(0, currency);
  }

  get cents() {
    return this.#cents;
  }

  get currency() {
    return this.#currency;
  }

  add(other) {
    this.#assertSameCurrency(other);
    return new Money(this.#cents + other.cents, this.#currency);
  }

  subtract(other) {
    this.#assertSameCurrency(other);
    return new Money(this.#cents - other.cents, this.#currency);
  }

  /** Porcentaje en puntos básicos (1900 = 19%), redondeado al centavo. */
  percentage(basisPoints) {
    if (!Number.isInteger(basisPoints)) {
      throw new RangeError(`Los puntos basicos deben ser enteros: ${basisPoints}`);
    }
    return new Money(divideRounded(this.#cents * basisPoints, BASIS_POINTS_SCALE), this.#currency);
  }

  isGreaterThan(other) {
    this.#assertSameCurrency(other);
    return this.#cents > other.cents;
  }

  equals(other) {
    return other instanceof Money && other.cents === this.#cents && other.currency === this.#currency;
  }

  toNumber() {
    return this.#cents / 100;
  }

  toString() {
    return `${this.toNumber().toFixed(2)} ${this.#currency}`;
  }

  #assertSameCurrency(other) {
    if (!(other instanceof Money) || other.currency !== this.#currency) {
      throw new TypeError('Operacion entre monedas incompatibles o valor no monetario');
    }
  }
}

module.exports = { Money };
