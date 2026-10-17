const test = require('node:test');
const assert = require('node:assert');
const { ClientToVirtual } = require('../Engine/Mouse.js');

test('ClientToVirtual maps a point over the scaled canvas to virtual pixels', () => {
  const rect = { left: 100, top: 50, width: 1152, height: 648 };   // the 576x324 canvas at 2x
  assert.deepStrictEqual(ClientToVirtual(100, 50, rect, 576, 324), { x: 0, y: 0, inside: true });
  assert.deepStrictEqual(ClientToVirtual(676, 374, rect, 576, 324), { x: 288, y: 162, inside: true });
});

test('ClientToVirtual: outside the canvas, or a canvas with no size, is not inside', () => {
  const rect = { left: 0, top: 0, width: 576, height: 324 };
  assert.strictEqual(ClientToVirtual(-1, 10, rect, 576, 324).inside, false);
  assert.strictEqual(ClientToVirtual(576, 10, rect, 576, 324).inside, false);
  assert.strictEqual(ClientToVirtual(10, 10, { left: 0, top: 0, width: 0, height: 0 }, 576, 324).inside, false);
});
