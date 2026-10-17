const test = require('node:test');
const assert = require('node:assert');
const W = require('../Game/AiWorld.js');

function view(rows, extra) {
  return Object.assign({ w: rows[0].length, h: rows.length, walls: rows, bombs: [], fire: [], blocked: [], enemies: [],
    powerups: [], keys: [], players: [], keyFlags: 0, mode: 'campaign', ice: [], carpets: [], drains: [], lasers: [], shots: [] }, extra);
}
const at = (v, d, x, y) => d[y * v.w + x];
const pos = b => [b.x, b.y];
const near = (a, b) => Math.abs(a - b) < 1e-9;

const HALL = [
  '000000000',
  '0       0',
  '0 0 0 0 0',
  '0       0',
  '000000000'];
const right = (xs, y) => xs.map(x => ({ x, y, dir: 2 }));

test('AiForecast: a bomb on a magic carpet goes off where the carpet takes it', () => {
  const v = view(HALL, { carpets: right([1, 2, 3], 1), bombs: [{ x: 1, y: 1, power: 1, time: 2 }] });
  const f = W.AiForecast(v);
  assert.deepStrictEqual(pos(f.bombs[0]), [4, 1]);
  assert.strictEqual(at(v, f.danger, 5, 1), 2);
  assert.strictEqual(at(v, f.danger, 1, 2), Infinity);
});

test('AiBombTrack: carpets carry at AI_CARPET_SECONDS per tile, turn corners and stop at obstacles', () => {
  const v = view(HALL, { carpets: [{ x: 1, y: 1, dir: 2 }, { x: 2, y: 1, dir: 2 }, { x: 3, y: 1, dir: 3 }, { x: 3, y: 2, dir: 3 }],
    bombs: [{ x: 1, y: 1, power: 1, time: 2 }] });
  const f = W.AiForecast(v);
  assert.deepStrictEqual(pos(f.bombs[0]), [3, 3]);
  const track = W.AiBombTrack(v, v.bombs[0], {}, { 10: 2, 11: 2 });
  assert.ok(near(track[track.length - 1].t, 2 * W.AI_CARPET_SECONDS));
  v.blocked = [{ x: 3, y: 3 }];
  assert.deepStrictEqual(pos(W.AiForecast(v).bombs[0]), [3, 2]);
});

test('AiForecast: a kicked bomb slides until something stops it (or it goes off on the way)', () => {
  const v = view(HALL, { bombs: [{ x: 1, y: 3, power: 1, time: 2, dir: 2, pushable: true }], blocked: [{ x: 6, y: 3 }] });
  assert.deepStrictEqual(pos(W.AiForecast(v).bombs[0]), [5, 3]);
  v.bombs[0].time = 0.3;
  assert.deepStrictEqual(pos(W.AiForecast(v).bombs[0]), [2, 3]);
});

test('AiForecast: a bomb on a drain also blasts out of the other drains', () => {
  const v = view(HALL, { drains: [{ x: 1, y: 1 }, { x: 7, y: 3 }], bombs: [{ x: 1, y: 1, power: 3, time: 1 }] });
  const d = W.AiForecast(v).danger;
  // the other drain blows with the bomb's own strength (power 3): three tiles along the row
  assert.strictEqual(at(v, d, 6, 3), 1);
  assert.strictEqual(at(v, d, 4, 3), 1);
  assert.strictEqual(at(v, d, 3, 3), Infinity);
  v.bombs[0].superBomb = true;
  assert.strictEqual(at(v, W.AiForecast(v).danger, 4, 3), 1);
});

test('AiForecast: a frozen bomb in ice goes off when a blast reaches it', () => {
  const v = view(HALL, { ice: [{ x: 3, y: 1, frozen: true }, { x: 5, y: 1 }], bombs: [{ x: 1, y: 1, power: 2, time: 1.5 }] });
  const d = W.AiForecast(v).danger;
  assert.strictEqual(at(v, d, 4, 1), 1.5);
  assert.strictEqual(at(v, d, 3, 2), 1.5);
  assert.strictEqual(at(v, d, 6, 1), Infinity);
});

test('AiForecast: a charging laser burns its whole line when it fires', () => {
  const rows = ['0000000', '0   1 0', '0000000'];
  const v = view(rows, { lasers: [{ x: 1, y: 1, dir: 2, time: 1.2 }] });
  const d = W.AiForecast(v).danger;
  assert.deepStrictEqual([2, 3, 4, 5].map(x => at(v, d, x, 1)), [1.2, 1.2, 1.2, Infinity]);
  assert.strictEqual(at(v, d, 1, 1), Infinity);
});

test('AiForecast: a fire shot bursts (radius 1) where it stops', () => {
  const v = view(HALL, { shots: [{ x: 1, y: 3, dir: 2 }], blocked: [{ x: 5, y: 3 }] });
  const d = W.AiForecast(v).danger;
  assert.ok(near(at(v, d, 4, 3), 3 * W.AI_TILE_SECONDS));
  assert.ok(at(v, d, 3, 3) < Infinity);
  assert.strictEqual(at(v, d, 2, 3), Infinity);
});

test('AiForecast: a blinking skull burns a cross of reach 5 when its time is up, unless a blast gets it first', () => {
  const ROW = ['0000000000000', '0           0', '0 0 0 0 0 0 0', '0           0', '0000000000000'];
  const v = view(ROW, { skulls: [{ x: 2, y: 1, time: 3 }] });
  const d = W.AiForecast(v).danger;
  assert.strictEqual(at(v, d, 2, 1), 3);
  assert.strictEqual(at(v, d, 7, 1), 3);
  assert.strictEqual(at(v, d, 8, 1), Infinity);
  assert.strictEqual(at(v, d, 3, 3), Infinity);
  const v2 = view(ROW, { skulls: [{ x: 2, y: 1, time: 3 }], bombs: [{ x: 3, y: 1, power: 1, time: 1 }] });
  assert.strictEqual(at(v2, W.AiForecast(v2).danger, 8, 1), Infinity);
  assert.strictEqual(at(v2, W.AiForecast(v2).danger, 7, 1), Infinity);
});

test('AiForecast: a closing arena cell burns whatever is on it when it shuts, and sets off a bomb there', () => {
  const v = view(HALL, { closing: [{ x: 2, y: 1, t: 3 }, { x: 3, y: 1, t: 3.12 }], bombs: [{ x: 6, y: 1, power: 1, time: 9 }] });
  const d = W.AiForecast(v).danger;
  assert.strictEqual(at(v, d, 2, 1), 3);
  assert.strictEqual(at(v, d, 3, 1), 3.12);
  assert.strictEqual(at(v, d, 4, 1), Infinity);
  assert.strictEqual(W.AiClosingMap(v)[1 * v.w + 2], 3);
  const onBomb = view(HALL, { closing: [{ x: 6, y: 1, t: 2 }], bombs: [{ x: 6, y: 1, power: 1, time: 9 }] });
  assert.strictEqual(at(onBomb, W.AiForecast(onBomb).danger, 7, 1), 2, 'the bomb goes off when its cell closes');
});

test('AiForecast: a kicked bomb that slides into a tile while it is still burning goes off there', () => {
  const v = view(HALL, { bombs: [{ x: 1, y: 1, power: 1, time: 2.0, dir: 2, pushable: true }, { x: 5, y: 1, power: 1, time: 0.5 }] });
  const d = W.AiDangerMap(v);
  // it slides to (4,1), arriving at 0.51 s, just as the other blast burns that tile (0.5 - 0.8 s): no waiting for its 2 s
  assert.ok(at(v, d, 3, 1) < 0.6, 'danger at (3,1): ' + at(v, d, 3, 1));
  // a bomb that arrives after the fire is out is not affected
  const late = view(HALL, { bombs: [{ x: 1, y: 1, power: 1, time: 2.0, dir: 2, pushable: true }, { x: 5, y: 1, power: 1, time: 0.1 }] });
  assert.ok(at(late, W.AiDangerMap(late), 3, 1) > 1.9);
});

test('AiForecast: a tile that burns twice remembers both times (AiBurnClear)', () => {
  const v = view(HALL, { bombs: [{ x: 3, y: 1, power: 1, time: 0.5 }, { x: 5, y: 1, power: 1, time: 1.5 }] });
  const d = W.AiDangerMap(v);
  assert.deepStrictEqual(d.burns[1 * v.w + 4], [0.5, 1.5]);
  assert.strictEqual(W.AiBurnClear(d, 1 * v.w + 4, 0.9, 1.2), true);   // between the two
  assert.strictEqual(W.AiBurnClear(d, 1 * v.w + 4, 1.4, 1.6), false);
  assert.strictEqual(W.AiBurnClear(d, 1 * v.w + 4, 0.0, 0.6), false);
  assert.strictEqual(W.AiBurnsAfter(d, 1 * v.w + 4, 1.0), true);
  assert.strictEqual(W.AiBurnsAfter(d, 1 * v.w + 4, 2.0), false);
});

test('AiForecast: a brick one blast has destroyed is no wall for the blasts that come later', () => {
  const rows = ['000000000', '0   1   0', '000000000'];
  const v = view(rows, { bombs: [{ x: 5, y: 1, power: 1, time: 0.5 }, { x: 7, y: 1, power: 5, time: 2.0 }] });
  const d = W.AiDangerMap(v);
  assert.strictEqual(at(v, d, 3, 1), 2.0);   // behind the brick: reached by the second bomb through the gap
  const alone = view(rows, { bombs: [{ x: 7, y: 1, power: 5, time: 2.0 }] });
  assert.strictEqual(at(alone, W.AiDangerMap(alone), 3, 1), Infinity);   // the brick still stops it
});

test('AiWastedBricks: a brick blasted twice, the second time 0.5 s or more later, loses the power-up it uncovered', () => {
  const rows = ['000000000', '0   1   0', '000000000'];
  const first = { x: 5, y: 1, power: 1, time: 0.5 };
  const late = view(rows, { bombs: [first, { x: 7, y: 1, power: 5, time: 2.0 }] });
  assert.strictEqual(W.AiWastedBricks(late, W.AiForecast(late).danger.burns), 1);
  const soon = view(rows, { bombs: [first, { x: 7, y: 1, power: 5, time: 0.8 }] });   // 0.3 s later: the power-up is still safe
  assert.strictEqual(W.AiWastedBricks(soon, W.AiForecast(soon).danger.burns), 0);
  const once = view(rows, { bombs: [first] });
  assert.strictEqual(W.AiWastedBricks(once, W.AiForecast(once).danger.burns), 0);
});

test('AiEnemyForecast: an enemy runs straight on until it is blocked, then turns to one of the sides', () => {
  const rows = ['00000000', '0      0', '0 0000 0', '0      0', '00000000'];
  const v = view(rows, { enemies: [{ x: 1, y: 1, dir: 2, speed: 1 }] });
  const f = W.AiEnemyForecast(v, v.enemies[0], 2);
  const at = (k, x, y) => f.layers[k][y * v.w + x] || 0;
  assert.ok(near(f.tt, W.AI_TILE_SECONDS));
  assert.strictEqual(at(0, 1, 1), 1);
  assert.strictEqual(at(3, 4, 1), 1);          // three tiles on
  assert.strictEqual(at(5, 6, 1), 1);          // at the end of the corridor ...
  assert.strictEqual(at(6, 6, 2), 1);          // ... and round the corner (the only side open is down)
  assert.strictEqual(at(7, 6, 3), 1);
  assert.strictEqual(at(8, 5, 3), 1);          // then left along the bottom
});

test('AiEnemyForecast: it takes the side that is open, turns back in a dead end, and a bomb is a wall to it', () => {
  const v = view(['0000000', '0     0', '0 000 0', '0     0', '0000000'], { enemies: [{ x: 5, y: 1, dir: 2, speed: 1 }] });
  const f = W.AiEnemyForecast(v, v.enemies[0], 1);
  assert.strictEqual(f.layers[1][2 * v.w + 5], 1);   // blocked at once; only down is open
  const dead = view(['00000', '0   0', '00000'], { enemies: [{ x: 1, y: 1, dir: 4, speed: 1 }] });
  const g = W.AiEnemyForecast(dead, dead.enemies[0], 1);
  assert.strictEqual(g.layers[1][1 * dead.w + 2], 1);   // turns back
  const blocked = view(['00000', '0   0', '00000'], { enemies: [{ x: 1, y: 1, dir: 2, speed: 1 }], bombs: [{ x: 3, y: 1, power: 1, time: 5 }] });
  const h = W.AiEnemyForecast(blocked, blocked.enemies[0], 1);
  assert.ok(h.layers.every(l => !l[1 * blocked.w + 3]));   // never on the bomb's tile
  assert.strictEqual(h.layers[2][1 * blocked.w + 1], 1);    // turned back at the bomb
  // two enemies in a row: the one behind is stopped by the one in front
  const two = view(['000000', '0    0', '000000'], { enemies: [{ x: 1, y: 1, dir: 2, speed: 1 }, { x: 3, y: 1, dir: 0, speed: 1 }] });
  const k = W.AiEnemyForecast(two, two.enemies[0], 1);
  assert.ok(k.layers.every(l => !l[1 * two.w + 3]));
});
