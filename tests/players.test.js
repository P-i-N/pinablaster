const test = require('node:test');
const assert = require('node:assert');
const { NearestPlayer, NeediestPlayer, ComputeSpawns, ClearSpawnPockets, DefaultRoster, AllOut, HumanPlayers, PlayerLabel } = require('../Game/Players.js');

function pl(x, y, dead, bombs, power) {
  return { X: x, Y: y, Width: 17, Height: 17, IsDead: !!dead, TotalBombs: bombs || 1, Power: power || 1 };
}

test('NearestPlayer prefers the nearest living player', () => {
  const a = pl(0, 0), b = pl(100, 0);
  assert.strictEqual(NearestPlayer([a, b], 90, 0), b);
  b.IsDead = true;
  assert.strictEqual(NearestPlayer([a, b], 90, 0), a);
});

test('NearestPlayer falls back to dead players, then null', () => {
  const a = pl(0, 0, true), b = pl(100, 0, true);
  assert.strictEqual(NearestPlayer([a, b], 90, 0), b);
  assert.strictEqual(NearestPlayer([], 0, 0), null);
});

test('NeediestPlayer picks the weakest living player', () => {
  const a = pl(0, 0, false, 3, 3), b = pl(0, 0, false, 1, 2), c = pl(0, 0, true, 1, 1);
  assert.strictEqual(NeediestPlayer([a, b, c]), b);
  assert.strictEqual(NeediestPlayer([c]), c);
  assert.strictEqual(NeediestPlayer([]), null);
});

function grid(n, blocked) {
  blocked = blocked || [];
  return (x, y) => x >= 0 && y >= 0 && x < n && y < n && !blocked.some(b => b[0] == x && b[1] == y);
}

test('ComputeSpawns mirrors the base tile into the other corners', () => {
  assert.deepStrictEqual(ComputeSpawns(grid(5), 5, 5, 1, 1, 4),
    [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 1, y: 3 }, { x: 3, y: 3 }]);
});

test('ComputeSpawns only returns as many spawns as requested', () => {
  assert.strictEqual(ComputeSpawns(grid(5), 5, 5, 1, 1, 2).length, 2);
});

test('ComputeSpawns moves a blocked mirror to the nearest free tile', () => {
  assert.deepStrictEqual(ComputeSpawns(grid(5, [[3, 1]]), 5, 5, 1, 1, 2),
    [{ x: 1, y: 1 }, { x: 3, y: 0 }]);
});

test('ComputeSpawns avoids duplicate tiles when mirrors coincide', () => {
  assert.deepStrictEqual(ComputeSpawns(grid(5), 5, 5, 2, 2, 4),
    [{ x: 2, y: 2 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }]);
});

test('DefaultRoster: one player listens to the keyboard and any pad', () => {
  assert.deepStrictEqual(DefaultRoster(1), [{ Keyboard: 0, Pad: 'any', Touch: true }]);
});

test('DefaultRoster: several players get separate keyboards / pads and clamp to 1-8', () => {
  const r = DefaultRoster(3);
  assert.strictEqual(r.length, 3);
  assert.deepStrictEqual(r[1], { Keyboard: 1, Pad: 1 });
  assert.deepStrictEqual(r[2], { Keyboard: null, Pad: 2 });
  assert.strictEqual(DefaultRoster(9).length, 8);
  assert.deepStrictEqual(DefaultRoster(6)[4], { Keyboard: null, Pad: 4 });
  assert.deepStrictEqual(DefaultRoster(6)[5], { Keyboard: null, Pad: 5 });
  assert.deepStrictEqual(DefaultRoster(8)[7], { Keyboard: null, Pad: 7 });
  assert.strictEqual(DefaultRoster(0).length, 1);
});

test('AllOut: only when everyone is dead with no lives', () => {
  const dead0 = { IsDead: true, Lifes: 0 }, dead1 = { IsDead: true, Lifes: 1 }, alive = { IsDead: false, Lifes: 0 };
  assert.strictEqual(AllOut([dead0, dead0]), true);
  assert.strictEqual(AllOut([dead0, dead1]), false); // can still respawn
  assert.strictEqual(AllOut([dead0, alive]), false);
  assert.strictEqual(AllOut([]), false);
});

test('ComputeSpawns: players 5 and 6 start at the top and bottom centre', () => {
  assert.deepStrictEqual(ComputeSpawns(grid(7), 7, 7, 1, 1, 6),
    [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 1, y: 5 }, { x: 5, y: 5 }, { x: 3, y: 1 }, { x: 3, y: 5 }]);
});

test('ComputeSpawns: players 7 and 8 start at the left and right middle', () => {
  assert.deepStrictEqual(ComputeSpawns(grid(7), 7, 7, 1, 1, 8).slice(6), [{ x: 1, y: 3 }, { x: 5, y: 3 }]);
});

test('ComputeSpawns: a blocked centre spawn falls back to a free neighbour', () => {
  const s = ComputeSpawns(grid(7, [[3, 1]]), 7, 7, 1, 1, 5);
  assert.strictEqual(s.length, 5);
  assert.notDeepStrictEqual(s[4], { x: 3, y: 1 });
  assert.strictEqual(new Set(s.map(c => c.x + ',' + c.y)).size, 5);
});

test('HumanPlayers drops bots, but keeps everyone when there are only bots', () => {
  const a = { Index: 0 }, b = { Index: 1 };
  assert.deepStrictEqual(HumanPlayers([a, b], [{ Keyboard: 0 }, { Bot: 'easy' }]), [a]);
  assert.deepStrictEqual(HumanPlayers([a, b], [{ Bot: 'hard' }, { Bot: 'easy' }]), [a, b]);
});

test('AllOut over humans: a living bot does not keep the campaign going', () => {
  const human = { Index: 0, IsDead: true, Lifes: 0 }, cpu = { Index: 1, IsDead: false, Lifes: 3 };
  assert.strictEqual(AllOut(HumanPlayers([human, cpu], [{ Keyboard: 0 }, { Bot: 'normal' }])), true);
});

test('PlayerLabel names bots CPU', () => {
  assert.strictEqual(PlayerLabel(0, [{ Keyboard: 0 }, { Bot: 'easy' }]), 'P1');
  assert.strictEqual(PlayerLabel(1, [{ Keyboard: 0 }, { Bot: 'easy' }]), 'CPU 2');
});

test('ClearSpawnPockets: only the bricks within two tiles of players 7 and 8 go; the input stays as it was', () => {
  const rows = ['0000000', '0111110', '0111110', '0111110', '0111110', '0111110', '0000000'];
  const out = ClearSpawnPockets(rows, [{ x: 1, y: 1 }, { x: 3, y: 3 }], 1);
  assert.strictEqual(rows[3], '0111110');
  assert.strictEqual(out[1], '011 110');   // two tiles up from the second spawn; the first one (index 0) keeps its surroundings
  assert.strictEqual(out[3], '0     0');   // two tiles each way along the row
  assert.strictEqual(out[2], '01   10');   // |dx| + |dy| <= 2 on the next rows
  assert.strictEqual(out[0], '0000000');   // hard walls stay
});
