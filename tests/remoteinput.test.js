const test = require('node:test');
const assert = require('node:assert');
const { RemoteInput, InputSender } = require('../Net/RemoteInput.js');

test('RemoteInput holds the last keys and hands each latch out once', () => {
  let now = 0;
  const r = new RemoteInput(600, () => now);
  r.Receive(['Left', 'Bomb'], ['Bomb']);
  let s = r.Snapshot();
  assert.deepStrictEqual(s.Keys, { Left: true, Bomb: true });
  assert.deepStrictEqual(s.Latch, { Bomb: true });
  s = r.Snapshot();
  assert.deepStrictEqual(s.Keys, { Left: true, Bomb: true });
  assert.deepStrictEqual(s.Latch, {});
});

test('latches from several messages between polls are merged', () => {
  const r = new RemoteInput(600, () => 0);
  r.Receive(['Up'], ['Up']);
  r.Receive([], ['Bomb']);
  assert.deepStrictEqual(r.Snapshot().Latch, { Up: true, Bomb: true });
});

test('silence longer than the timeout releases all keys (no stuck direction)', () => {
  let now = 0;
  const r = new RemoteInput(600, () => now);
  r.Receive(['Right'], []);
  now = 500;
  assert.deepStrictEqual(r.Snapshot().Keys, { Right: true });
  now = 601;
  assert.deepStrictEqual(r.Snapshot().Keys, {});
});

test('a source that never spoke is idle, not null', () => {
  const s = new RemoteInput(600, () => 0).Snapshot();
  assert.deepStrictEqual([s.Keys, s.Latch], [{}, {}]);
});

test('InputSender sends on change, on a latch press, and as a heartbeat', () => {
  const t = new InputSender(250);
  assert.deepStrictEqual(t.Next(0, ['Up'], [], 0), { t: 'input', slot: 0, k: ['Up'], l: [] });
  assert.strictEqual(t.Next(0, ['Up'], [], 100), null);               // unchanged
  assert.deepStrictEqual(t.Next(0, ['Up'], ['Bomb'], 110).l, ['Bomb']); // latch
  assert.strictEqual(t.Next(0, ['Up'], [], 200), null);
  assert.notStrictEqual(t.Next(0, ['Up'], [], 400), null);            // heartbeat after 250 ms
  assert.deepStrictEqual(t.Next(0, [], [], 410).k, []);               // released
});

test('InputSender tracks slots independently and ignores key order', () => {
  const t = new InputSender(250);
  t.Next(0, ['Up', 'Bomb'], [], 0);
  assert.strictEqual(t.Next(0, ['Bomb', 'Up'], [], 10), null);
  assert.notStrictEqual(t.Next(1, ['Up'], [], 10), null);
});

const { ActionToKeys } = require('../Net/RemoteInput.js');

test('ActionToKeys: only movement and bomb travel over the network', () => {
  const act = { Dir: 2, Bomb: true, BombPressed: true, Start: true, StartPressed: true, Back: true, BackPressed: true, DirPressed: true };
  assert.deepStrictEqual(ActionToKeys(act), { held: ['Right', 'Bomb'], pressed: ['Right', 'Bomb'] });
});

test('ActionToKeys: idle and partial input', () => {
  assert.deepStrictEqual(ActionToKeys({ Dir: 0, Bomb: false, BombPressed: false, DirPressed: false }), { held: [], pressed: [] });
  assert.deepStrictEqual(ActionToKeys({ Dir: 3, Bomb: false, BombPressed: false, DirPressed: false }), { held: ['Down'], pressed: [] });
});
