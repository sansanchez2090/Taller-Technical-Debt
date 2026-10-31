'use strict';

function broken(a) {
  if (a === 1) return 1;
  if (a === 2) return 2;
  if (a === 3) return 3;
  if (a === 4) return 4;
  if (a === 5) return 5;
  if (a === 6) return 6;
  if (a === 7) return 7;
  if (a === 8) return 8;
  if (a === 9) return 9;
  return 0;
}

module.exports = { broken };