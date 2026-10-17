const test = require('node:test');
const assert = require('node:assert');
const { TurboRunner, SeededRandom } = require('../Engine/Turbo.js');

// A fake clock that moves on by `costMs` whenever a step runs.
function rig(costMs, drawEvery, sliceMs) {
  const t = { now: 0, steps: 0, draws: 0 };
  t.runner = new TurboRunner(() => { t.steps++; t.now += costMs; }, () => t.draws++, drawEvery, sliceMs);
  t.clock = () => t.now;
  return t;
}

test('TurboRunner runs steps until the time slice is used up', () => {
  const t = rig(1, 60, 12);
  assert.strictEqual(t.runner.RunSlice(t.clock), 12);
  assert.strictEqual(t.steps, 12);
  assert.strictEqual(t.runner.Steps, 12);
});

test('TurboRunner draws every N steps, counting across slices', () => {
  const t = rig(1, 5, 3);
  for (let i = 0; i < 4; ++i) t.runner.RunSlice(t.clock);   // 12 steps
  assert.strictEqual(t.draws, 2);
});

test('TurboRunner always makes progress, even when one step takes longer than a slice', () => {
  const t = rig(50, 60, 12);
  assert.strictEqual(t.runner.RunSlice(t.clock), 1);
});

test('SeededRandom repeats for a seed, stays in [0, 1) and differs between seeds', () => {
  const a = SeededRandom(7), b = SeededRandom(7), c = SeededRandom(8);
  const xs = Array.from({ length: 1000 }, () => a());
  assert.deepStrictEqual(xs.slice(0, 5), Array.from({ length: 5 }, () => b()));
  assert.ok(xs.every(x => x >= 0 && x < 1));
  assert.notStrictEqual(c(), xs[0]);
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(mean > 0.45 && mean < 0.55, 'mean ' + mean);
});
