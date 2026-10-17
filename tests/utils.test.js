const test = require('node:test');
const assert = require('node:assert');

test('Utils helpers work and do not pollute for..in', () => {
  const nativeIndexOf = Array.prototype.indexOf;
  require('../Library/Utils.js');

  assert.strictEqual(Array.prototype.indexOf, nativeIndexOf, 'native indexOf must stay');

  const a = [1, 2, 3];
  assert.strictEqual(a.contains(2), true);
  assert.strictEqual(a.contains(9), false);
  assert.strictEqual(a.remove(2), true);
  assert.strictEqual(a.remove(2), false);
  assert.deepStrictEqual(a, [1, 3]);
  assert.strictEqual('abc'.setCharAt(1, 'X'), 'aXc');
  assert.strictEqual('abc'.setCharAt(9, 'X'), 'abc');

  const keys = [];
  for (const k in [5, 6]) keys.push(k);
  assert.deepStrictEqual(keys, ['0', '1']);
});

test('remove uses strict equality (no "1" == 1 surprises)', () => {
  require('../Library/Utils.js');
  const a = [1, '1'];
  a.remove('1');
  assert.deepStrictEqual(a, [1]);
});
