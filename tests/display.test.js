const test = require('node:test');
const assert = require('node:assert');
const { ComputeLayout } = require('../Engine/Display.js');

test('fills a 16:9 window exactly', () => {
  const l = ComputeLayout(1920, 1080, 1, false);
  assert.ok(Math.abs(l.scale - 1920 / 576) < 1e-9);
  assert.strictEqual(l.cssW, 1920);
  assert.strictEqual(l.cssH, 1080);
});

test('integer snap works in device pixels (dpr 1)', () => {
  const l = ComputeLayout(1920, 1080, 1, true);
  assert.strictEqual(l.scale, 3);
  assert.strictEqual(l.cssW, 1728);
  assert.strictEqual(l.cssH, 972);
});

test('integer snap works in device pixels (dpr 2)', () => {
  const l = ComputeLayout(1920, 1080, 2, true);
  assert.strictEqual(l.scale, 3); // 6 device px per virtual px
  assert.strictEqual(l.cssW, 1728);
});

test('letterboxes on a squarer window (width-limited)', () => {
  const l = ComputeLayout(1000, 1000, 1, false);
  assert.strictEqual(l.cssW, 1000);
  assert.strictEqual(l.cssH, 563);
});

test('ultrawide is height-limited', () => {
  const l = ComputeLayout(3440, 1440, 1, false);
  assert.strictEqual(l.cssH, 1440);
  assert.strictEqual(l.cssW, 2560);
});

test('never snaps below 1x, never returns zero', () => {
  const l = ComputeLayout(400, 300, 1, true);
  assert.ok(l.scale > 0 && l.scale < 1);
  assert.strictEqual(l.cssW, 400);
  const z = ComputeLayout(0, 0, 1, false);
  assert.ok(z.cssW >= 1 && z.cssH >= 1);
});
