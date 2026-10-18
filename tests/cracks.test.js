const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { NewCracks, CrackBlast, TakeCrack, CrackPixels, CRACK_MAX_DAMAGE } = require('../Game/Cracks.js');
const H = require('./headless.js');

// 7x5: a brick right of the flames' end, one above the middle, one diagonal, one in a wall's shadow
const WALLS = [
  '0000000',
  '0 11  0',
  '0   1 0',
  '0 1 0 0',
  '0000000',
];
const never = () => 1, always = () => 0;

test('the bricks next to a blast take one hit each, from the side of the flames', () => {
  const cr = NewCracks(5);
  // flames along row 2, x = 1..3
  assert.ok(CrackBlast(cr, WALLS, [[1, 2], [2, 2], [3, 2]], never, () => -1));
  const at = (x, y) => cr.tiles[y * 7 + x];
  assert.deepStrictEqual(at(4, 2), { d: 1, ix: 1, iy: 0, chip: 0, pu: -1 });   // past the end: hit from the left
  assert.deepStrictEqual(at(2, 1), { d: 1, ix: 0, iy: -1, chip: 0, pu: -1 });  // above: hit from below
  assert.strictEqual(at(2, 3).d, 1);
  assert.strictEqual(at(3, 1).d, 1);   // above x = 3, one hit even though it is next to only one flame
  assert.strictEqual(Object.keys(cr.tiles).length, 4);
  // a brick that is not next to any flame is left alone, and nothing on a wall or floor
  assert.ok(!CrackBlast(cr, WALLS, [[5, 1]], never, () => -1));
});

test('two flames of one blast next to the same brick still make one hit', () => {
  const cr = NewCracks(1);
  CrackBlast(cr, WALLS, [[1, 1], [1, 2], [2, 2]], never, () => -1);
  assert.strictEqual(cr.tiles[1 * 7 + 2].d, 1);
  assert.strictEqual(cr.tiles[1 * 7 + 2].ix, 1);
  assert.strictEqual(cr.tiles[1 * 7 + 2].iy, -1);
});

test('hits add up to a maximum; a chip comes from the second hit on, once, with its power-up rolled there and then', () => {
  const cr = NewCracks(1), k = 2 * 7 + 4;
  let rolls = 0;
  const roll = () => { ++rolls; return 3; };
  CrackBlast(cr, WALLS, [[5, 2]], always, roll);
  assert.strictEqual(cr.tiles[k].chip, 0, 'no chip on the first hit');
  CrackBlast(cr, WALLS, [[5, 2]], always, roll);
  assert.strictEqual(cr.tiles[k].chip, 1);
  assert.strictEqual(cr.tiles[k].pu, 3);
  for (let i = 0; i < 10; ++i) CrackBlast(cr, WALLS, [[5, 2]], always, roll);
  assert.strictEqual(cr.tiles[k].d, CRACK_MAX_DAMAGE);
  assert.strictEqual(rolls, 1, 'rolled once');
  // the brick breaks: out comes what the chip showed, and the cracks go with it
  assert.strictEqual(TakeCrack(cr, k), 3);
  assert.strictEqual(cr.tiles[k], undefined);
});

test('a cracked brick without a chip breaks like any other (its power-up is rolled then)', () => {
  const cr = NewCracks(1);
  CrackBlast(cr, WALLS, [[3, 2]], never, () => 2);
  assert.strictEqual(TakeCrack(cr, 2 * 7 + 4), undefined);
  assert.strictEqual(TakeCrack(cr, 2 * 7 + 4), undefined);
  assert.strictEqual(TakeCrack(null, 0), undefined);
});

test('more hits show more of the pattern, starting where the blasts hit; a chip makes a hole with a rim', () => {
  const lines = (d) => CrackPixels(7, 3, 2, 17, 17, { d, ix: 1, iy: 0, chip: 0, pu: -1 }).lines;
  const counts = [1, 2, 3, 4].map(d => lines(d).length);
  for (let i = 1; i < counts.length; ++i)
    assert.ok(counts[i] > counts[i - 1], 'counts ' + counts);
  assert.ok(counts[0] > 0);
  // hit from the left: the first lines lie in the left half
  const first = lines(1), left = first.filter(i => i % 17 < 9).length;
  assert.ok(left > first.length * 0.7, left + ' of ' + first.length);

  const chip = CrackPixels(7, 3, 2, 17, 17, { d: 2, ix: 1, iy: 0, chip: 1, pu: 0 });
  const hole = chip.chip.reduce((a, b) => a + b, 0);
  assert.ok(hole >= 15 && hole < 17 * 17 / 2, 'hole ' + hole);
  assert.ok(chip.rim.length > 0);
  assert.ok(chip.rim.every(i => !chip.chip[i]));
  assert.ok(chip.lines.every(i => !chip.chip[i]));
});

test('the pattern runs on from one brick into the next', () => {
  // the cells along the shared edge of two neighbours: a line ending on one side goes on on the other
  const c = { d: CRACK_MAX_DAMAGE, ix: 0, iy: 0, chip: 0, pu: -1 };
  const a = new Set(CrackPixels(9, 3, 2, 17, 17, c).lines.filter(i => i % 17 == 16).map(i => Math.floor(i / 17)));
  const b = new Set(CrackPixels(9, 4, 2, 17, 17, c).lines.filter(i => i % 17 == 0).map(i => Math.floor(i / 17)));
  const shared = [...a].filter(y => b.has(y) || b.has(y - 1) || b.has(y + 1));
  assert.ok(shared.length >= Math.min(a.size, b.size) * 0.5, [...a] + ' / ' + [...b]);
});

test('in the game: a bomb cracks the bricks beside it, a chipped brick gives the power-up it showed, LAN snapshots carry it', () => {
  const ctx = H.CreateGame();
  const game = ctx.Engine.Application;
  game.ShowTitle();
  game.StartGame('campaign', ctx.RosterFromSources(['kb0']));
  ctx.Screens.Clear();
  const r = vm.runInContext(`(function() {
    var W = GameWorld.Walls, bw = GameWorld.BlockWidth;
    // a bomb at (5, 5) with reach 1; bricks at (5, 3) (past the upward flame), (6, 5) (in the fire) and (7, 5) (behind it)
    for (var y = 2; y <= 7; ++y) for (var x = 3; x <= 8; ++x) W[y] = W[y].setCharAt(x, ' ');
    W[3] = W[3].setCharAt(5, '1');
    W[5] = W[5].setCharAt(6, '1').setCharAt(7, '1');
    var v0 = GameWorld.Version, old = Math.random;
    Math.random = function() { return 0; };   // every chance comes up: chips, and the power-up roll gives one
    CreateExplosionCross(null, 5 * bw, 5 * bw, 1, true);
    for (var y = 0; y < W.length; ++y) W[y] = W[y].split('.').join(' ');
    CreateExplosionCross(null, 5 * bw, 5 * bw, 1, true);
    Math.random = old;
    var above = GameWorld.Cracks.tiles[3 * 27 + 5];
    var behind = GameWorld.Cracks.tiles[5 * 27 + 7];
    var snap = BuildSnapshot({ seq: 1, timeMs: 0, level: 1, mode: 'campaign', walls: GameWorld.Walls, cracks: GameWorld.Cracks,
      wallsVersion: GameWorld.Version, lastSentVersion: v0, entities: [], players: [], names: [], hud: {}, sounds: [], overlay: null });
    var sent = !!(snap.cr && snap.cr.tiles[3 * 27 + 5]);
    // break the chipped brick above: its power-up comes out, nothing new is rolled
    GameEntityManager.Entities.filter(function(e) { return e.Type == 'PowerUp'; }).forEach(function(e) { e.Health = 0; });
    var before = GameEntityManager.Entities.length;
    Math.random = function() { return 0.99; };   // a fresh roll would give nothing
    CreateExplosionLine(null, 5 * bw, 4 * bw, 1, 2, true);
    Math.random = old;
    var pus = GameEntityManager.Entities.filter(function(e) { return e.Type == 'PowerUp' && e.Health > 0 && e.Y == 3 * bw; });
    return { above: above && Object.assign({}, above), behind: behind && Object.assign({}, behind), ver: GameWorld.Version > v0,
      snap: sent, pus: pus.map(function(p) { return p.PowerUpType; }), left: GameWorld.Cracks.tiles[3 * 27 + 5] };
  })()`, ctx);
  assert.ok(r.above && r.above.d == 2 && r.above.iy == -2, JSON.stringify(r.above));
  assert.strictEqual(r.above.chip, 1);
  assert.ok(r.above.pu >= 0);
  assert.ok(r.behind && r.behind.d == 2 && r.behind.ix == 2, 'the brick behind the one the blast broke: ' + JSON.stringify(r.behind));
  assert.ok(r.ver, 'the wall image is redrawn');
  assert.ok(r.snap, 'snapshots carry the cracks with the walls');
  assert.strictEqual(JSON.stringify(r.pus), JSON.stringify([r.above.pu]));
  assert.strictEqual(r.left, undefined);
});
