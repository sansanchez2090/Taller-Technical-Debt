'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { periodKey } = require('../../src/domain/billingPeriod');

describe('periodKey', () => {
  it('MONTHLY usa año-mes con cero a la izquierda (UTC)', () => {
    assert.equal(periodKey('MONTHLY', new Date('2026-01-15T00:00:00Z')), '2026-01');
    assert.equal(periodKey('MONTHLY', new Date('2026-12-31T23:59:59Z')), '2026-12');
  });

  it('ANNUAL usa solo el año', () => {
    assert.equal(periodKey('ANNUAL', new Date('2026-10-29T12:00:00Z')), '2026');
  });
});
