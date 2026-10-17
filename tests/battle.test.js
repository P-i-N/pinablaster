const test = require('node:test');
const assert = require('node:assert');
const { BuildBattleArena, BuildDemoArena, DemoClickAction, BATTLE_LEVELS, BuildBattleLevel, SpiralOrder, RoundOutcome, BattleRules } = require('../Game/Battle.js');

test('arena is 27x19 and symmetric on both axes', () => {
  const a = BuildBattleArena();
  assert.strictEqual(a.length, 19);
  a.forEach(r => assert.strictEqual(r.length, 27));
  for (let y = 0; y < 19; y++)
    for (let x = 0; x < 27; x++) {
      assert.strictEqual(a[y][x], a[y][26 - x], 'x mirror ' + x + ',' + y);
      assert.strictEqual(a[y][x], a[18 - y][x], 'y mirror ' + x + ',' + y);
    }
});

test('arena border, pillars, bricks and corner safe zones', () => {
  const a = BuildBattleArena();
  assert.strictEqual(a[0][0], '2');
  assert.strictEqual(a[0][5], '0');
  assert.strictEqual(a[2][2], '0');   // pillar (even, even)
  assert.strictEqual(a[1][3], '1');   // brick
  assert.strictEqual(a[9][13], '1');  // centre is a brick
  [[1, 1, 1, 1], [25, 1, -1, 1], [1, 17, 1, -1], [25, 17, -1, -1]].forEach(([cx, cy, dx, dy]) => {
    assert.strictEqual(a[cy][cx], ' ');
    assert.strictEqual(a[cy][cx + dx], ' ');
    assert.strictEqual(a[cy + dy][cx], ' ');
  });
  assert.ok(a.join('').indexOf('P') < 0);
});

test('SpiralOrder walks the interior ring by ring', () => {
  const s = SpiralOrder(5, 5);
  assert.strictEqual(s.length, 9);
  assert.deepStrictEqual(s.slice(0, 9).map(c => c.x + ',' + c.y),
    ['1,1', '2,1', '3,1', '3,2', '3,3', '2,3', '1,3', '1,2', '2,2']);
});

test('SpiralOrder covers every interior tile of the real arena once', () => {
  const s = SpiralOrder(27, 19);
  assert.strictEqual(s.length, 25 * 17);
  assert.strictEqual(new Set(s.map(c => c.x + ',' + c.y)).size, 25 * 17);
});

test('RoundOutcome', () => {
  const P = (i, d) => ({ Index: i, IsDead: d });
  assert.strictEqual(RoundOutcome([P(0, false), P(1, false), P(2, true)]), null);
  assert.deepStrictEqual(RoundOutcome([P(0, true), P(1, false), P(2, true)]), { winner: 1 });
  assert.deepStrictEqual(RoundOutcome([P(0, true), P(1, true)]), { winner: -1 });
});

test('BattleRules: first to 3 wins, draws award nothing', () => {
  const b = new BattleRules(3, 3);
  assert.strictEqual(b.Round, 1);
  assert.strictEqual(b.RecordRound(1), -1);
  assert.strictEqual(b.Round, 2);
  assert.strictEqual(b.RecordRound(-1), -1);
  assert.deepStrictEqual(b.Wins, [0, 1, 0]);
  assert.strictEqual(b.Round, 3);
  b.RecordRound(1);
  assert.strictEqual(b.RecordRound(1), 1);
  assert.deepStrictEqual(b.Wins, [0, 3, 0]);
  assert.strictEqual(b.Round, 4); // not advanced once the match is won
});

test('arena has safe starting spots for players 5 and 6 (top and bottom centre)', () => {
  const a = BuildBattleArena();
  [[13, 1], [12, 1], [14, 1], [13, 2], [13, 17], [12, 17], [14, 17], [13, 16]].forEach(([x, y]) => {
    assert.strictEqual(a[y][x], ' ', x + ',' + y);
  });
  assert.strictEqual(a[1][11], '1'); // the rest of the row is still bricks
});

test('arena has safe starting spots for players 7 and 8 (left and right middle)', () => {
  const a = BuildBattleArena();
  [[1, 8], [1, 9], [1, 10], [2, 9], [25, 8], [25, 9], [25, 10], [24, 9]].forEach(([x, y]) => {
    assert.strictEqual(a[y][x], ' ', x + ',' + y);
  });
  assert.strictEqual(a[9][4], '1'); // the rest of the row is still bricks
});

test('CrushedPlayers: the living players whose centre is on a closing cell', () => {
  const B = require('../Game/Battle.js');
  const pl = (i, x, y, dead) => ({ Index: i, X: x, Y: y, Width: 17, Height: 17, IsDead: !!dead });
  const players = [pl(0, 34, 17), pl(1, 42, 17), pl(2, 51, 17), pl(3, 34, 17, true)];
  // cell (2,1) spans x 34..50: player 1 at x 42 has its centre at 50.5 -> tile 2
  assert.deepStrictEqual(B.CrushedPlayers(players, 2, 1, 17, 17).map(p => p.Index), [0, 1]);
});

test('BattlePowerUpAllowed: no hearts and no extra lives in battle (one-hit kills)', () => {
  const B = require('../Game/Battle.js');
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7].filter(B.BattlePowerUpAllowed), [0, 1, 2, 3, 5, 7]);
});

test('the demo arena: the battle arena with fewer bricks, a carpet loop round an ice pen, four drains, all eight pockets kept', () => {
  const demo = BuildDemoArena(), base = BuildBattleArena();
  assert.strictEqual(demo.length, 19);
  assert.ok(demo.every(r => r.length == 27));
  assert.ok(demo[0] == base[0] && demo[18] == base[18], 'the border is the same');
  // every starting pocket of the battle arena is still open floor
  [[1, 1], [2, 1], [1, 2], [25, 1], [24, 1], [25, 2], [1, 17], [2, 17], [1, 16], [25, 17], [24, 17], [25, 16],
    [12, 1], [13, 1], [14, 1], [13, 2], [12, 17], [13, 17], [14, 17], [13, 16], [1, 8], [1, 9], [1, 10], [2, 9], [25, 8], [25, 9], [25, 10], [24, 9]]
    .forEach(([x, y]) => assert.strictEqual(demo[y][x], ' ', x + ',' + y));
  const count = ch => demo.join('').split(ch).length - 1;
  assert.ok(count('1') < base.join('').split('1').length - 1, 'fewer bricks');
  assert.strictEqual(count('#'), 4);
  assert.strictEqual(count('I'), 1);
  assert.strictEqual(count('i'), 4);
  assert.ok(/^[0-3 1iI#^>,<]*$/.test(demo.join('')), 'only known tiles');
  // the carpets lead one into the next, round the whole loop
  const dirs = { '>': [1, 0], ',': [0, 1], '<': [-1, 0], '^': [0, -1] };
  let x = 9, y = 6, seen = 0;
  do {
    const d = dirs[demo[y][x]];
    assert.ok(d, 'carpet at ' + x + ',' + y);
    x += d[0]; y += d[1]; ++seen;
  } while (!(x == 9 && y == 6) && seen < 100);
  assert.strictEqual(seen, 28, 'a loop of 28 carpets');
  // left-right and top-bottom mirrored apart from the carpet direction
  const plain = r => r.replace(/[>,<^]/g, 'c');
  demo.forEach((r, i) => assert.strictEqual(plain(r), plain(r).split('').reverse().join(''), 'row ' + i));
});

test('DemoClickAction: a dead player is revived, a bomb explodes, a skull times out, another power-up is picked up, an empty tile gets a bomb', () => {
  const box = (type, x, y, extra) => Object.assign({ Type: type, X: x * 17, Y: y * 17, Width: 17, Height: 17, Health: 1 }, extra);
  const dead = box('Player', 1, 1, { IsDead: true }), alive = box('Player', 3, 1, { IsDead: false });
  const bomb = box('Bomb', 5, 1), skull = box('PowerUp', 7, 1, { PowerUpType: 5 }), heart = box('PowerUp', 9, 1, { PowerUpType: 4 });
  const ents = [dead, alive, bomb, skull, heart];
  const free = (tx, ty) => !(tx == 0 || ty == 0);
  const click = (tx, ty) => DemoClickAction(ents, tx * 17 + 8, ty * 17 + 8, 17, 17, free, 5);
  assert.deepStrictEqual(click(1, 1), { action: 'revive', entity: dead });
  assert.deepStrictEqual(click(5, 1), { action: 'explode', entity: bomb });
  assert.deepStrictEqual(click(7, 1), { action: 'timeout', entity: skull });
  assert.deepStrictEqual(click(9, 1), { action: 'pickup', entity: heart });
  assert.deepStrictEqual(click(11, 4), { action: 'bomb', tx: 11, ty: 4 });
  assert.strictEqual(click(3, 1) && click(3, 1).action, 'bomb', 'a living player is not a target (the tile is not free in the game, which says so through tileFree)');
  assert.strictEqual(click(0, 4), null, 'not on a tile that cannot take a bomb');
  assert.strictEqual(DemoClickAction([box('Bomb', 5, 1, { Health: 0 })], 5 * 17 + 8, 17 + 8, 17, 17, () => false, 5), null, 'a bomb already gone is ignored');
  assert.deepStrictEqual(DemoClickAction([bomb, dead], 5 * 17 + 8, 17 + 8, 17, 17, free, 5), { action: 'explode', entity: bomb }, 'whatever is under the pointer; a dead player first');
  assert.strictEqual(DemoClickAction([dead, bomb], 1 * 17 + 8, 17 + 8, 17, 17, free, 5).action, 'revive');
});

test('the battle levels: each is a 27x19 arena with the classic border and all eight starting pockets open, mirrored left-right and top-bottom', () => {
  const base = BuildBattleArena();
  const pockets = [[1, 1], [2, 1], [1, 2], [25, 1], [24, 1], [25, 2], [1, 17], [2, 17], [1, 16], [25, 17], [24, 17], [25, 16],
    [12, 1], [13, 1], [14, 1], [13, 2], [12, 17], [13, 17], [14, 17], [13, 16], [1, 8], [1, 9], [1, 10], [2, 9], [25, 8], [25, 9], [25, 10], [24, 9]];
  assert.ok(BATTLE_LEVELS.length >= 6);
  assert.strictEqual(new Set(BATTLE_LEVELS.map(l => l.Name)).size, BATTLE_LEVELS.length, 'names differ');
  assert.strictEqual(BATTLE_LEVELS[0].Name, 'Classic');
  const plain = r => r.replace(/[>,<^]/g, 'c');
  BATTLE_LEVELS.forEach((lv, i) => {
    const a = lv.Build();
    assert.strictEqual(a.length, 19, lv.Name);
    assert.ok(a.every(r => r.length == 27), lv.Name);
    assert.ok(a[0] == base[0] && a[18] == base[18], lv.Name + ' border');
    assert.ok(a.every(r => r[0] == base[1][0] || '02'.includes(r[0])), lv.Name + ' side walls');
    pockets.forEach(([x, y]) => assert.strictEqual(a[y][x], ' ', lv.Name + ' pocket ' + x + ',' + y));
    assert.ok(/^[0-3 1iI#^>,<]*$/.test(a.join('')), lv.Name + ' tiles');
    a.forEach((r, y) => assert.strictEqual(plain(r), plain(r).split('').reverse().join(''), lv.Name + ' row ' + y + ' mirrored'));
    assert.deepStrictEqual(plain(a.join('\n')).split('\n'), plain(a.join('\n')).split('\n').reverse(), lv.Name + ' top-bottom');
    assert.deepStrictEqual(BuildBattleLevel(i), a, 'BuildBattleLevel');
  });
  assert.deepStrictEqual(BuildBattleLevel(BATTLE_LEVELS.length), BuildBattleLevel(0), 'wraps');
  assert.deepStrictEqual(BuildBattleLevel(-1), BuildBattleLevel(BATTLE_LEVELS.length - 1), 'wraps backwards');
  const count = (lv, ch) => BATTLE_LEVELS.find(l => l.Name == lv).Build().join('').split(ch).length - 1;
  assert.ok(count('Open Field', '1') < count('Classic', '1') / 2, 'open field: far fewer bricks');
  assert.ok(count('Ice Rink', 'i') > 20 && count('Ice Rink', 'I') == 4, 'ice rink');
  assert.ok(count('Conveyor', '>') >= 20 && count('Conveyor', '<') >= 20, 'conveyor belts');
  assert.strictEqual(count('Sewers', '#'), 5, 'sewers');
});

test('SuddenSchedule: which cells close when, from before sudden death starts and from the middle of it', () => {
  const { SuddenSchedule, SpiralOrder } = require('../Game/Battle.js');
  const order = SpiralOrder(9, 7);
  // 5 s before it starts: the first cell shuts one step after the start
  const early = SuddenSchedule(115, 0, 0, order, 6);
  assert.deepStrictEqual(early[0], { x: order[0].x, y: order[0].y, t: 5.12 });
  assert.ok(early.every((c, i) => i == 0 || c.t > early[i - 1].t) && early.every(c => c.t <= 6));
  assert.ok(Math.abs(early[1].t - early[0].t - 0.12) < 1e-9);
  // nothing within a 2 s horizon yet
  assert.deepStrictEqual(SuddenSchedule(100, 0, 0, order, 2), []);
  // already started: 0.05 s into a step, cell 10 is next, in 0.07 s
  const late = SuddenSchedule(130, 0.05, 10, order, 1);
  assert.deepStrictEqual([late[0].x, late[0].y], [order[10].x, order[10].y]);
  assert.ok(Math.abs(late[0].t - 0.07) < 1e-9);
  assert.strictEqual(late.length, 8, 'about one cell per 0.12 s within the horizon');
  // the last cells run out
  assert.strictEqual(SuddenSchedule(130, 0, order.length - 2, order, 100).length, 2);
});
