'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Money } = require('../../src/domain/Money');

describe('Money (Value Object)', () => {
  it('evita el error de coma flotante usando centavos enteros', () => {
    assert.notEqual(0.1 + 0.2, 0.3);
    assert.equal(Money.fromDecimal(0.1).add(Money.fromDecimal(0.2)).cents, 30);
    assert.equal(Money.fromDecimal(299.99).cents, 29999);
  });

  it('rechaza centavos no enteros y monedas inválidas', () => {
    assert.throws(() => new Money(1.5), RangeError);
    assert.throws(() => new Money(100, 'usd'), RangeError);
    assert.throws(() => Money.fromCents(Number.NaN), RangeError);
  });

  it('fromDecimal rechaza valores no numéricos o infinitos', () => {
    assert.throws(() => Money.fromDecimal('10'), TypeError);
    assert.throws(() => Money.fromDecimal(Infinity), TypeError);
  });

  it('suma y resta en la misma moneda', () => {
    const a = Money.fromCents(1000);
    const b = Money.fromCents(250);
    assert.equal(a.add(b).cents, 1250);
    assert.equal(a.subtract(b).cents, 750);
  });

  it('falla al operar monedas distintas o valores no monetarios', () => {
    const usd = Money.fromCents(100);
    assert.throws(() => usd.add(Money.fromCents(1, 'COP')), TypeError);
    assert.throws(() => usd.subtract(5), TypeError);
    assert.throws(() => usd.isGreaterThan(Money.fromCents(1, 'MXN')), TypeError);
  });

  it('percentage redondea half-up al centavo', () => {
    assert.equal(Money.fromCents(59950).percentage(1500).cents, 8993);
    assert.equal(Money.fromCents(10000).percentage(825).cents, 825);
    assert.equal(Money.fromCents(1).percentage(5000).cents, 1);
    assert.equal(Money.fromCents(29999).percentage(1900).cents, 5700);
  });

  it('percentage con negativos redondea alejándose de cero y normaliza -0', () => {
    assert.equal(Money.fromCents(-59950).percentage(1500).cents, -8993);
    assert.equal(Money.fromCents(-1).percentage(100).cents, 0);
  });

  it('percentage exige puntos básicos enteros', () => {
    assert.throws(() => Money.fromCents(100).percentage(0.5), RangeError);
  });

  it('compara importes e igualdad por valor', () => {
    const a = Money.fromCents(100);
    assert.equal(a.isGreaterThan(Money.fromCents(99)), true);
    assert.equal(a.isGreaterThan(Money.fromCents(100)), false);
    assert.equal(a.equals(Money.fromCents(100)), true);
    assert.equal(a.equals(Money.fromCents(100, 'COP')), false);
    assert.equal(a.equals(100), false);
  });

  it('expone toNumber y toString', () => {
    const total = Money.fromCents(36149);
    assert.equal(total.toNumber(), 361.49);
    assert.equal(total.toString(), '361.49 USD');
    assert.equal(total.currency, 'USD');
  });

  it('es inmutable', () => {
    const money = Money.fromCents(100);
    assert.throws(() => {
      money.extra = 1;
    }, TypeError);
    assert.equal(money.add(Money.fromCents(1)).cents, 101);
    assert.equal(money.cents, 100);
  });

  it('zero crea importe nulo en la moneda indicada', () => {
    assert.equal(Money.zero().cents, 0);
    assert.equal(Money.zero('COP').currency, 'COP');
  });
});
