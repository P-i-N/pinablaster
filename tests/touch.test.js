const test = require('node:test');
const assert = require('node:assert');
const { DetectTouch, ResolveTouchMode, DpadDirection, NextTouchMode } = require('../Engine/TouchControls.js');

test('DetectTouch: primary coarse pointer with touch points, or an actual touch seen', () => {
  assert.strictEqual(DetectTouch({ maxTouchPoints: 5, coarse: true, sawTouch: false }), true);
  assert.strictEqual(DetectTouch({ maxTouchPoints: 0, coarse: false, sawTouch: false }), false);
  assert.strictEqual(DetectTouch({ maxTouchPoints: 10, coarse: false, sawTouch: false }), false); // touch laptop, mouse primary
  assert.strictEqual(DetectTouch({ maxTouchPoints: 10, coarse: false, sawTouch: true }), true);
  assert.strictEqual(DetectTouch({}), false);
});

test('ResolveTouchMode: on / off override detection, auto follows it', () => {
  assert.strictEqual(ResolveTouchMode('on', false), true);
  assert.strictEqual(ResolveTouchMode('off', true), false);
  assert.strictEqual(ResolveTouchMode('auto', true), true);
  assert.strictEqual(ResolveTouchMode('auto', false), false);
  assert.strictEqual(ResolveTouchMode('bogus', true), true);
});

test('NextTouchMode cycles auto -> on -> off', () => {
  assert.strictEqual(NextTouchMode('auto', 1), 'on');
  assert.strictEqual(NextTouchMode('on', 1), 'off');
  assert.strictEqual(NextTouchMode('off', 1), 'auto');
  assert.strictEqual(NextTouchMode('auto', -1), 'off');
});

test('DpadDirection: dead zone in the middle, dominant axis outside', () => {
  assert.strictEqual(DpadDirection(0, 0, 50), 0);
  assert.strictEqual(DpadDirection(5, -5, 50), 0);
  assert.strictEqual(DpadDirection(30, 5, 50), 2);
  assert.strictEqual(DpadDirection(-30, 5, 50), 4);
  assert.strictEqual(DpadDirection(5, -30, 50), 1);
  assert.strictEqual(DpadDirection(5, 30, 50), 3);
  assert.strictEqual(DpadDirection(200, 0, 50), 2); // dragging far outside still works
});
