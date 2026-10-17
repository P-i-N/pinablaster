const test = require('node:test');
const assert = require('node:assert');
const { FixedStepLoop } = require('../Engine/Loop.js');

test('runs whole steps and keeps the remainder', () => {
  const l = new FixedStepLoop(0.01, 10);
  assert.strictEqual(l.Advance(0.025), 2);
  assert.strictEqual(l.Advance(0.005), 1);
  assert.strictEqual(l.Advance(0.004), 0);
});

test('does not lose steps to float error', () => {
  const l = new FixedStepLoop(0.01, 100);
  let total = 0;
  for (let i = 0; i < 100; i++) total += l.Advance(0.016);
  assert.strictEqual(total, 160);
});

test('clamps the catch-up burst and drops the backlog', () => {
  const l = new FixedStepLoop(0.01, 5);
  assert.strictEqual(l.Advance(10), 5);
  assert.strictEqual(l.Advance(0), 0);
});

test('negative dt is treated as zero; Reset clears the remainder', () => {
  const l = new FixedStepLoop(0.01, 5);
  assert.strictEqual(l.Advance(-1), 0);
  l.Advance(0.009);
  l.Reset();
  assert.strictEqual(l.Advance(0.002), 0);
});
