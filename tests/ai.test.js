const test = require('node:test');
const assert = require('node:assert');
const A = require('../Game/AiBrain.js');

function view(rows, extra) {
  return Object.assign({ w: rows[0].length, h: rows.length, walls: rows, bombs: [], fire: [], blocked: [], enemies: [],
    powerups: [], keys: [], players: [], keyFlags: 0, mode: 'battle' }, extra);
}
const key = c => c.x + ',' + c.y;
const sorted = cells => cells.map(key).sort();
const OPTS = { step: A.AI_TILE_SECONDS, margin: 0.25, avoid: null };

const ROOM = [
  '0000000',
  '0   1 0',
  '0 0 0 0',
  '0     0',
  '0000000'];

test('AiBlastCells stops before hard walls and on soft walls', () => {
  const v = view(ROOM);
  assert.deepStrictEqual(sorted(A.AiBlastCells(v, { x: 1, y: 1, power: 4, superBomb: false })),
    ['1,1', '1,2', '1,3', '2,1', '3,1', '4,1'].sort());
});

test('AiBlastCells: super bombs burn through soft walls', () => {
  const v = view(ROOM);
  assert.ok(sorted(A.AiBlastCells(v, { x: 1, y: 1, power: 4, superBomb: true })).includes('5,1'));
});

test('AiDangerMap: chained bombs go off with the earliest one, fire is 0', () => {
  const v = view(ROOM, { bombs: [{ x: 1, y: 1, power: 2, time: 0.5 }, { x: 3, y: 1, power: 1, time: 1.8 }], fire: [{ x: 5, y: 3 }] });
  const d = A.AiDangerMap(v);
  const at = (x, y) => d[y * v.w + x];
  assert.strictEqual(at(1, 3), 0.5);
  assert.strictEqual(at(3, 2), 0.5);   // only bomb 2 reaches it, but bomb 1 sets bomb 2 off
  assert.strictEqual(at(5, 3), 0);
  assert.strictEqual(at(4, 3), Infinity);
});

test('AiFindPath returns the tiles to walk, [] at the goal, null when unreachable', () => {
  const v = view(ROOM);
  const d = A.AiDangerMap(v);
  assert.deepStrictEqual(A.AiFindPath(v, { x: 1, y: 1 }, (x, y) => x == 1 && y == 3, d, OPTS), [{ x: 1, y: 2 }, { x: 1, y: 3 }]);
  assert.deepStrictEqual(A.AiFindPath(v, { x: 1, y: 1 }, (x, y) => x == 1 && y == 1, d, OPTS), []);
  assert.strictEqual(A.AiFindPath(v, { x: 1, y: 1 }, (x, y) => x == 4 && y == 1, d, OPTS), null); // soft wall
});

test('AiFindPath does not cross a tile that burns before the bot is through', () => {
  // from (1,3) to (5,3) the only way leads through (3,3), which the bomb at (3,2) burns
  const goal = (x, y) => x == 5 && y == 3;
  const soon = view(ROOM, { bombs: [{ x: 3, y: 2, power: 1, time: 0.1 }] });
  assert.strictEqual(A.AiFindPath(soon, { x: 1, y: 3 }, goal, A.AiDangerMap(soon), OPTS), null);
  const late = view(ROOM, { bombs: [{ x: 3, y: 2, power: 1, time: 3.0 }] });
  assert.strictEqual(A.AiFindPath(late, { x: 1, y: 3 }, goal, A.AiDangerMap(late), OPTS).length, 4);
});

test('AiSafeAfterBomb: no bomb in a dead end, fine with a way out', () => {
  const dead = view(['00000', '0 110', '0 000', '00000']);
  assert.strictEqual(A.AiSafeAfterBomb(dead, { x: 1, y: 1, power: 2, superBomb: false }, OPTS), false);
  const open = view(['000000', '0 1110', '0    0', '000000']);
  assert.strictEqual(A.AiSafeAfterBomb(open, { x: 1, y: 1, power: 1, superBomb: false }, OPTS), true);
});

test('AiHitsTeammate: only a living teammate in the blast counts', () => {
  const v = view(ROOM, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }, { x: 1, y: 3, index: 1 }] });
  const me = { x: 1, y: 1, index: 0, power: 2, superBomb: false };
  assert.strictEqual(A.AiHitsTeammate(v, me, A.AiDangerMap(v)), true);
  v.players[1].dead = true;
  assert.strictEqual(A.AiHitsTeammate(v, me, A.AiDangerMap(v)), false);
  const aside = view(ROOM, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }, { x: 2, y: 3, index: 1 }] });
  assert.strictEqual(A.AiHitsTeammate(aside, me, A.AiDangerMap(aside)), false);
});

const ARENA = [
  '000000000',
  '0       0',
  '0 0 0 0 0',
  '0       0',
  '000000000'];
const ME = { x: 1, y: 1, index: 0, speed: 1, power: 2, bombs: 1, superBomb: false };
const never = () => 1;

test('AiDecide flees from a bomb to a safe tile', () => {
  const v = view(ARENA, { bombs: [{ x: 1, y: 1, power: 2, time: 1.5 }], players: [{ x: 1, y: 1, index: 0 }] });
  const plan = A.AiDecide(v, ME, A.AI_LEVELS.normal, never);
  assert.strictEqual(plan.reason, 'flee');
  assert.strictEqual(plan.bomb, false);
  const end = plan.path[plan.path.length - 1];
  assert.strictEqual(A.AiDangerMap(v)[end.y * v.w + end.x], Infinity);
});

test('AiDecide bombs an opponent in line in battle, never a teammate in campaign', () => {
  const players = [{ x: 1, y: 1, index: 0 }, { x: 3, y: 1, index: 1 }];
  const battle = A.AiDecide(view(ARENA, { players }), ME, A.AI_LEVELS.normal, never);
  assert.deepStrictEqual([battle.reason, battle.bomb], ['attack', true]);
  const coop = A.AiDecide(view(ARENA, { players, mode: 'campaign', enemies: [{ x: 1, y: 3 }] }), ME, A.AI_LEVELS.normal, never);
  assert.strictEqual(coop.bomb, false);
});

test('AiDecide bombs an enemy in line in campaign', () => {
  const v = view(ARENA, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }], enemies: [{ x: 4, y: 1 }] });
  const plan = A.AiDecide(v, Object.assign({}, ME, { power: 3 }), A.AI_LEVELS.normal, never);
  assert.deepStrictEqual([plan.reason, plan.bomb], ['attack', true]);
});

test('AiDecide: Hard walks to a power-up, Easy ignores it, Normal skips bad luck', () => {
  const players = [{ x: 1, y: 1, index: 0 }];
  const hard = A.AiDecide(view(ARENA, { players, powerups: [{ x: 5, y: 3, type: 0 }] }), ME, A.AI_LEVELS.hard, never);
  assert.strictEqual(hard.reason, 'item');
  assert.deepStrictEqual(hard.path[hard.path.length - 1], { x: 5, y: 3 });
  const easy = A.AiDecide(view(ARENA, { players, powerups: [{ x: 5, y: 3, type: 0 }] }), ME, A.AI_LEVELS.easy, never);
  assert.notStrictEqual(easy.reason, 'item');
  const normal = A.AiDecide(view(ARENA, { players, powerups: [{ x: 2, y: 1, type: 5 }] }), ME, A.AI_LEVELS.normal, never);
  assert.notStrictEqual(normal.reason, 'item');
});

test('AiDecide walks next to a soft wall and bombs it once there', () => {
  const rows = ['0000000', '0    10', '0 000 0', '0     0', '0000000'];
  const players = [{ x: 1, y: 1, index: 0 }];
  const go = A.AiDecide(view(rows, { players }), ME, A.AI_LEVELS.normal, never);
  assert.strictEqual(go.reason, 'wall');
  const at = A.AiDecide(view(rows, { players: [{ x: 4, y: 1, index: 0 }] }), Object.assign({}, ME, { x: 4 }), A.AI_LEVELS.normal, never);
  assert.deepStrictEqual([at.reason, at.bomb], ['wall', true]);
});

test('AiDecide with no bombs left does not go for walls or targets', () => {
  const rows = ['0000000', '0    10', '0 000 0', '0     0', '0000000'];
  const plan = A.AiDecide(view(rows, { players: [{ x: 1, y: 1, index: 0 }] }), Object.assign({}, ME, { bombs: 0 }), A.AI_LEVELS.hard, never);
  assert.strictEqual(plan.reason, 'idle');
});

test('AiDecide: Easy sometimes misses a slow danger, never a close one', () => {
  const players = [{ x: 1, y: 1, index: 0 }];
  const always = () => 0;
  const slow = A.AiDecide(view(ARENA, { players, bombs: [{ x: 1, y: 3, power: 2, time: 1.5 }] }), ME, A.AI_LEVELS.easy, always);
  assert.notStrictEqual(slow.reason, 'flee');
  const close = A.AiDecide(view(ARENA, { players, bombs: [{ x: 1, y: 3, power: 2, time: 0.4 }] }), ME, A.AI_LEVELS.easy, always);
  assert.strictEqual(close.reason, 'flee');
});

test('AiSteer lines up on the cross axis first and stops within the tolerance', () => {
  assert.strictEqual(A.AiSteer(20, 0, 34, 0, 1), 2);
  assert.strictEqual(A.AiSteer(17, 3, 34, 0, 1), 1);
  assert.strictEqual(A.AiSteer(34, 1, 34, 0, 1), 0);
  assert.strictEqual(A.AiSteer(5, 17, 0, 34, 1), 4);
});

function bot(x, y, extra) {
  return Object.assign({ X: x, Y: y, Width: 17, Height: 17, Index: 0, IsDead: false, Lifes: 0, Speed: 1, Power: 2,
    Bombs: 1, SuperBombsTime: 0, BadLuckFlags: 0 }, extra);
}

test('AiController respawns a dead bot that has lives after a second', () => {
  const c = new A.AiController('normal', never);
  const p = bot(17, 17, { IsDead: true, Lifes: 1 });
  const env = { View: () => view(ARENA), BombCount: () => 0 };
  let pressed = false;
  for (let t = 0; t < 200 && !pressed; ++t) pressed = c.Update(0.01, p, env).BombPressed;
  assert.strictEqual(pressed, true);
});

test('AiController presses bomb on its tile when an opponent is in line', () => {
  const c = new A.AiController('hard', never);
  const p = bot(17, 17);
  const env = { View: () => view(ARENA, { players: [{ x: 1, y: 1, index: 0 }, { x: 3, y: 1, index: 1 }] }), BombCount: () => 0 };
  assert.strictEqual(c.Update(0.01, p, env).BombPressed, true);
});

test('AiController walks along its path', () => {
  const c = new A.AiController('hard', never);
  const p = bot(17, 17);
  const env = { View: () => view(ARENA, { players: [{ x: 1, y: 1, index: 0 }], powerups: [{ x: 1, y: 3, type: 1 }] }), BombCount: () => 0 };
  assert.strictEqual(c.Update(0.01, p, env).Dir, 3);
});

test('AiController settles onto the centre of its tile when it has nowhere to go', () => {
  // centre already in tile (2,1) but the body still overlaps tile (1,1)
  const c = new A.AiController('normal', never);
  const env = { View: () => view(ARENA, { players: [{ x: 2, y: 1, index: 0 }] }), BombCount: () => 0 };
  assert.strictEqual(c.Update(0.01, bot(26, 17, { Bombs: 0 }), env).Dir, 2);
});

test('AiDecide: Normal / Hard never walk over a bad-luck power-up, Easy does', () => {
  const rows = ['0000000', '0    10', '0000000'];
  const v = () => view(rows, { players: [{ x: 1, y: 1, index: 0 }], powerups: [{ x: 2, y: 1, type: 5 }] });
  assert.strictEqual(A.AiDecide(v(), ME, A.AI_LEVELS.hard, never).reason, 'idle');
  // the only wall spot (6,1) is in the Flamie's line: Normal hunts it instead, Easy goes for the wall
  assert.notStrictEqual(A.AiDecide(v(), ME, A.AI_LEVELS.normal, never).reason, 'wall');
  assert.strictEqual(A.AiDecide(v(), ME, A.AI_LEVELS.easy, never).reason, 'wall');
});

test('AiDecide: a safe bot waits instead of walking through a tile about to burn', () => {
  // the only way to the soft wall at (7,1) crosses (4,1), which the bomb at (4,3) burns in 1 s
  const rows = ['000000000', '0      10', '0000 0000', '0       0', '000000000'];
  const v = view(rows, { players: [{ x: 1, y: 1, index: 0 }], bombs: [{ x: 4, y: 3, power: 2, time: 1.0 }] });
  const plan = A.AiDecide(v, ME, A.AI_LEVELS.normal, never);
  assert.deepStrictEqual([plan.reason, plan.path], ['idle', []]);
});

test('AiDecide plans straight through another player (players walk through each other), but not through an enemy', () => {
  const rows = ['000000', '0    0', '000000'];
  const bombs = [{ x: 1, y: 1, power: 1, time: 1.5 }];
  const v = view(rows, { players: [{ x: 1, y: 1, index: 0 }, { x: 2, y: 1, index: 1 }], bombs });
  const plan = A.AiDecide(v, ME, A.AI_LEVELS.normal, never);
  assert.strictEqual(plan.reason, 'flee');
  assert.ok(plan.path.some(c => c.x == 2 && c.y == 1) && plan.path[plan.path.length - 1].x >= 3, JSON.stringify(plan.path));
  const blocked = view(rows, { players: [{ x: 1, y: 1, index: 0 }], enemies: [{ x: 2, y: 1, type: 0, cover: [{ x: 2, y: 1 }] }], bombs });
  const stuck = A.AiDecide(blocked, ME, A.AI_LEVELS.normal, never);
  assert.ok(!stuck.path.some(c => c.x >= 3), 'an enemy still blocks the way: ' + JSON.stringify(stuck.path));
});

test('AiDecide does not drop a bomb on a tile another player stands on (the game would refuse)', () => {
  const rows = ['0000000', '0     0', '0 000 0', '0     0', '0000000'];
  const mine = Object.assign({}, ME, { x: 1, y: 1, bombs: 1 });
  const alone = view(rows, { players: [{ x: 1, y: 1, index: 0 }], enemies: [{ x: 3, y: 1, type: 0, cover: [{ x: 3, y: 1 }] }], mode: 'campaign' });
  const shared = view(rows, { players: [{ x: 1, y: 1, index: 0 }, { x: 1, y: 1, index: 1 }], enemies: [{ x: 3, y: 1, type: 0, cover: [{ x: 3, y: 1 }] }], mode: 'campaign' });
  assert.strictEqual(A.AiDecide(alone, mine, A.AI_LEVELS.hard, never).bomb, true, 'it would bomb alone');
  assert.strictEqual(A.AiDecide(shared, mine, A.AI_LEVELS.hard, never).bomb, false, 'but not with somebody standing on its tile');
});

test('AiDecide still runs when the only escape is tighter than its safety margin', () => {
  // (2,1) burns in 0.35 s: crossing takes ~0.26 s, inside the blast time but not with Normal's 0.25 s margin
  const v = view(['000000', '0    0', '000000'], { players: [{ x: 1, y: 1, index: 0 }], bombs: [{ x: 1, y: 1, power: 1, time: 0.35 }] });
  const plan = A.AiDecide(v, ME, A.AI_LEVELS.normal, never);
  assert.strictEqual(plan.reason, 'flee');
  assert.deepStrictEqual(plan.path, [{ x: 2, y: 1 }, { x: 3, y: 1 }]);
});

test('AiDecide never plans through an enemy (enemies are solid)', () => {
  // enemies at both corridor ends: no escape keeps clear of them, so the fallback runs
  const rows = ['0000000', '0     0', '0000000'];
  const v = view(rows, { mode: 'campaign', players: [{ x: 3, y: 1, index: 0 }], enemies: [{ x: 1, y: 1 }, { x: 5, y: 1 }], bombs: [{ x: 3, y: 1, power: 1, time: 1.5 }] });
  const plan = A.AiDecide(v, Object.assign({}, ME, { x: 3, y: 1 }), A.AI_LEVELS.normal, never);
  assert.strictEqual(plan.reason, 'flee');
  assert.ok(!plan.path.some(c => (c.x == 5 || c.x == 1) && c.y == 1), JSON.stringify(plan.path));
});

test('AiDecide: campaign bots hunt from a distance, never from next to an enemy', () => {
  const v = () => view(ARENA, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }], enemies: [{ x: 5, y: 1 }] });
  const close = A.AiDecide(v(), Object.assign({}, ME, { power: 1 }), A.AI_LEVELS.hard, never);
  assert.notStrictEqual(close.reason, 'hunt');
  const far = A.AiDecide(v(), Object.assign({}, ME, { power: 2 }), A.AI_LEVELS.hard, never);
  assert.strictEqual(far.reason, 'hunt');
  assert.deepStrictEqual(far.path[far.path.length - 1], { x: 3, y: 1 });
});

test('AiDecide keeps out of every tile a moving player overlaps', () => {
  // player 1 walks from (4,1) to (3,1): its body covers both tiles
  const rows = ['0000000', '0     0', '0 0 000', '0     0', '0000000'];
  const v = view(rows, { players: [{ x: 2, y: 1, index: 0 }, { x: 4, y: 1, index: 1, cover: [{ x: 3, y: 1 }, { x: 4, y: 1 }] }],
    bombs: [{ x: 2, y: 1, power: 1, time: 1.5 }] });
  const plan = A.AiDecide(v, Object.assign({}, ME, { x: 2, y: 1 }), A.AI_LEVELS.normal, never);
  assert.strictEqual(plan.reason, 'flee');
  assert.deepStrictEqual(plan.path, [{ x: 1, y: 1 }, { x: 1, y: 2 }]);
});

test('AiDecide: cornered by an enemy in a dead end, a campaign bot bombs it', () => {
  // the bot at (3,1) is in a pocket; the enemy at (2,1) blocks the only way out
  const rows = ['00000', '0   0', '00000'];
  const v = view(rows, { mode: 'campaign', players: [{ x: 3, y: 1, index: 0 }], enemies: [{ x: 2, y: 1 }] });
  const plan = A.AiDecide(v, Object.assign({}, ME, { x: 3, y: 1, power: 1 }), A.AI_LEVELS.normal, never);
  assert.deepStrictEqual([plan.reason, plan.bomb], ['cornered', true]);
});

test('AiDecide: no bomb while an enemy stands on the bot (the game refuses it): get away', () => {
  const v = view(ARENA, { mode: 'campaign', players: [{ x: 3, y: 1, index: 0 }], enemies: [{ x: 3, y: 1, cover: [{ x: 3, y: 1 }] }] });
  const plan = A.AiDecide(v, Object.assign({}, ME, { x: 3, y: 1 }), A.AI_LEVELS.normal, never);
  assert.strictEqual(plan.bomb, false);
  assert.strictEqual(plan.reason, 'evade');
});

test('AiFindPath pushes an ice block when the tile behind it is free', () => {
  const rows = ['0000000', '0     0', '0000000'];
  const v = view(rows, { ice: [{ x: 2, y: 1 }] });
  assert.deepStrictEqual(A.AiFindPath(v, { x: 1, y: 1 }, (x, y) => x == 3 && y == 1, A.AiDangerMap(v), OPTS), [{ x: 2, y: 1 }, { x: 3, y: 1 }]);
  v.ice.push({ x: 3, y: 1 });
  assert.strictEqual(A.AiFindPath(v, { x: 1, y: 1 }, (x, y) => x == 4 && y == 1, A.AiDangerMap(v), OPTS), null);
});

test('AiDecide sees a bomb a carpet carries towards it and gets out of the way', () => {
  const carpets = [1, 2, 3].map(x => ({ x, y: 1, dir: 2 }));
  const v = view(ARENA, { carpets, bombs: [{ x: 1, y: 1, power: 1, time: 2 }], players: [{ x: 5, y: 1, index: 0 }] });
  assert.strictEqual(A.AiDecide(v, Object.assign({}, ME, { x: 5 }), A.AI_LEVELS.normal, never).reason, 'flee');
});

test('AiDecide: Normal uses a drain to bomb an enemy it cannot reach, Easy does not', () => {
  const rows = ['000000000', '0   0   0', '000000000'];
  const v = x => view(rows, { mode: 'campaign', players: [{ x, y: 1, index: 0 }], enemies: [{ x: 6, y: 1 }], drains: [{ x: 3, y: 1 }, { x: 5, y: 1 }] });
  const me = Object.assign({}, ME, { power: 1 });
  const go = A.AiDecide(v(1), me, A.AI_LEVELS.normal, never);
  assert.strictEqual(go.reason, 'remote');
  assert.deepStrictEqual(go.path[go.path.length - 1], { x: 3, y: 1 });
  const there = A.AiDecide(v(3), Object.assign({}, me, { x: 3 }), A.AI_LEVELS.normal, never);
  assert.deepStrictEqual([there.reason, there.bomb], ['attack', true]);
  // Easy never uses the drain (it just closes in on the enemy it cannot reach)
  const easy = A.AiDecide(v(1), me, A.AI_LEVELS.easy, never);
  assert.deepStrictEqual([easy.reason, easy.bomb], ['approach', false]);
});

test('AiDecide: Normal and Hard kick a threatening bomb into an opponent, Easy runs', () => {
  const v = () => view(ARENA, { players: [{ x: 1, y: 1, index: 0 }, { x: 6, y: 1, index: 1 }], bombs: [{ x: 2, y: 1, power: 1, time: 1.8, pushable: true }] });
  const me = Object.assign({}, ME, { kick: true, bombs: 0 });
  [A.AI_LEVELS.hard, A.AI_LEVELS.normal].forEach(level => {
    const plan = A.AiDecide(v(), me, level, never);
    assert.deepStrictEqual([plan.reason, plan.kick], ['kick', 2], level.Name);
  });
  assert.strictEqual(A.AiDecide(v(), me, A.AI_LEVELS.easy, never).reason, 'flee');
});

test('AiDecide: a bot that can kick bombs goes a long way for the push power-up; Easy does not', () => {
  const rows = ['000000000000000', '0             0', '000000000000000'];
  const v = type => view(rows, { players: [{ x: 1, y: 1, index: 0 }], powerups: [{ x: 11, y: 1, type }] });
  const me = Object.assign({}, ME, { x: 1, y: 1, bombs: 0 });
  assert.strictEqual(A.AiDecide(v(3), me, A.AI_LEVELS.normal, never).reason, 'item', 'push: ten tiles is nothing');
  assert.notStrictEqual(A.AiDecide(v(0), me, A.AI_LEVELS.normal, never).reason, 'item', 'a fire power-up that far (Normal looks 5 tiles) is not worth it');
});

test('AiDecide: Hard walks behind a bomb to kick it at an opponent', () => {
  // bomb at (3,1), opponent at (7,1): stand at (2,1) and kick right
  const v = view(ARENA, { players: [{ x: 1, y: 3, index: 0 }, { x: 7, y: 1, index: 1 }], bombs: [{ x: 3, y: 1, power: 1, time: 1.9, pushable: true }] });
  const plan = A.AiDecide(v, Object.assign({}, ME, { x: 1, y: 3, kick: true, bombs: 0 }), A.AI_LEVELS.hard, never);
  assert.strictEqual(plan.reason, 'kick');
  assert.deepStrictEqual(plan.path[plan.path.length - 1], { x: 2, y: 1 });
});

test('AiDecide: Normal sets a trap in battle, Easy does not', () => {
  // the opponent at (1,1) stands on its own bomb, which burns its whole corridor; its only way out is down through (3,2),
  // where our bomb would stand. (With a power 1 bomb it could wait at (3,1) for its blast to pass: no trap.)
  const rows = ['0000000', '0   000', '000   0', '000 000', '0000000'];
  const v = () => view(rows, { players: [{ x: 3, y: 2, index: 0 }, { x: 1, y: 1, index: 1 }], bombs: [{ x: 1, y: 1, power: 2, time: 1.0 }] });
  const me = Object.assign({}, ME, { x: 3, y: 2, power: 1 });
  const plan = A.AiDecide(v(), me, A.AI_LEVELS.normal, never);
  assert.deepStrictEqual([plan.reason, plan.bomb], ['trap', true]);
  assert.strictEqual(A.AiDecide(v(), me, A.AI_LEVELS.easy, never).bomb, false);
});

test('AiDecide: Normal will not wait in the line of a fire-spitter, Easy will', () => {
  const rows = ['000000000', '0      10', '000000 00', '000000 00', '000000 00', '000000000'];
  const v = () => view(rows, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }], enemies: [{ x: 6, y: 4, type: 4 }] });
  // the only wall spot (6,1) is in the Flamie's line: Normal hunts it instead, Easy goes for the wall
  assert.notStrictEqual(A.AiDecide(v(), ME, A.AI_LEVELS.normal, never).reason, 'wall');
  assert.strictEqual(A.AiDecide(v(), ME, A.AI_LEVELS.easy, never).reason, 'wall');
});

test('AiDecide runs from a laser about to fire', () => {
  const v = view(ARENA, { mode: 'campaign', players: [{ x: 4, y: 1, index: 0 }], lasers: [{ x: 7, y: 1, dir: 4, time: 1.5 }] });
  const plan = A.AiDecide(v, Object.assign({}, ME, { x: 4 }), A.AI_LEVELS.easy, () => 1);
  assert.strictEqual(plan.reason, 'flee');
});

test('AiController walks into the bomb it wants to kick', () => {
  const c = new A.AiController('hard', never);
  const env = { View: () => view(ARENA, { players: [{ x: 1, y: 1, index: 0 }, { x: 6, y: 1, index: 1 }], bombs: [{ x: 2, y: 1, power: 1, time: 1.8, pushable: true }] }), BombCount: () => 1 };
  assert.strictEqual(c.Update(0.01, bot(17, 17, { PushableBombsTime: 5, Bombs: 0 }), env).Dir, 2);
});

test('AiDecide: the line of fire never stops a bot from hunting the shooter itself', () => {
  const rows = ['000000000', '0       0', '000000000'];
  const v = view(rows, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }], enemies: [{ x: 7, y: 1, type: 2 }] });
  const plan = A.AiDecide(v, Object.assign({}, ME, { power: 3 }), A.AI_LEVELS.normal, never);
  assert.strictEqual(plan.reason, 'hunt');
});

test('AiDecide: a laser enemy\'s line is fine to wait in (the forecast sees its charge), a fire-spitter\'s is not', () => {
  const rows = ['000000000', '0      10', '000000 00', '000000 00', '000000 00', '000000000'];
  const v = type => view(rows, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }], enemies: [{ x: 6, y: 4, type }] });
  const me = Object.assign({}, ME, { power: 1 });   // power 1: no hunt spot outside the enemy's reach
  assert.strictEqual(A.AiDecide(v(2), me, A.AI_LEVELS.normal, never).reason, 'wall');
  const spit = A.AiDecide(v(4), me, A.AI_LEVELS.normal, never);
  assert.notStrictEqual(spit.reason, 'wall');
  assert.ok(!spit.path.some(c => c.x == 6), JSON.stringify(spit.path));   // keeps out of the fire-spitter's column
});

// An enemy riding a long carpet (row 1, moving right) and two side pockets at (10,2) and (26,2).
const BELT = ['0'.repeat(30), '0' + ' '.repeat(28) + '0', '0'.repeat(10) + ' ' + '0'.repeat(15) + ' ' + '0'.repeat(3), '0'.repeat(30)];
const beltView = (x, y) => view(BELT, { mode: 'campaign', players: [{ x, y, index: 0 }], enemies: [{ x: 1, y: 1, type: 5 }],
  carpets: Array.from({ length: 27 }, (_, i) => ({ x: 1 + i, y: 1, dir: 2 })) });

test('AiDecide bombs ahead of an enemy riding a carpet, timed for when it arrives', () => {
  // from (26,2) a bomb burns (26,1) in 2 s - just when the enemy gets there
  const plan = A.AiDecide(beltView(26, 2), Object.assign({}, ME, { x: 26, y: 2, power: 1 }), A.AI_LEVELS.normal, never);
  assert.deepStrictEqual([plan.reason, plan.bomb], ['attack', true]);
  // from (10,2) the enemy would long be past: no bomb, wait there in ambush. (Remote off: a bomb ridden to the end of
  // the belt, with the enemy queued behind it, would be a fine plan too.)
  const noRemote = Object.assign({}, A.AI_LEVELS.normal, { Remote: false });
  const wait = A.AiDecide(beltView(10, 2), Object.assign({}, ME, { x: 10, y: 2, power: 1 }), noRemote, never);
  assert.deepStrictEqual([wait.reason, wait.bomb], ['ambush', false]);
  assert.notStrictEqual(A.AiDecide(beltView(10, 2), Object.assign({}, ME, { x: 10, y: 2, power: 1 }), A.AI_LEVELS.easy, never).reason, 'ambush');
});

test('AiDecide walks to an ambush spot beside a carpet an enemy rides, never onto it', () => {
  // as BELT, plus a corridor (row 3) below the pockets: the bot starts there, out of the enemy's way
  const rows = BELT.slice(0, 3).concat(['0' + ' '.repeat(28) + '0', '0'.repeat(30)]);
  const v = view(rows, { mode: 'campaign', players: [{ x: 20, y: 3, index: 0 }], enemies: [{ x: 1, y: 1, type: 5 }],
    carpets: Array.from({ length: 27 }, (_, i) => ({ x: 1 + i, y: 1, dir: 2 })) });
  const plan = A.AiDecide(v, Object.assign({}, ME, { x: 20, y: 3, power: 1 }), Object.assign({}, A.AI_LEVELS.hard, { Remote: false }), never);
  assert.strictEqual(plan.reason, 'ambush');
  const end = plan.path[plan.path.length - 1];
  assert.ok(end.y == 2 && (end.x == 10 || end.x == 26), JSON.stringify(end));
});

test('AiDecide: with nothing else to do, a campaign bot closes in on an enemy it cannot reach', () => {
  const rows = ['00000000000', '0    0    0', '00000000000'];
  const v = view(rows, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }], enemies: [{ x: 7, y: 1 }] });
  const plan = A.AiDecide(v, ME, A.AI_LEVELS.easy, never);
  assert.strictEqual(plan.reason, 'approach');
  assert.deepStrictEqual(plan.path[plan.path.length - 1], { x: 4, y: 1 });
  const there = view(rows, { mode: 'campaign', players: [{ x: 4, y: 1, index: 0 }], enemies: [{ x: 7, y: 1 }] });
  assert.strictEqual(A.AiDecide(there, Object.assign({}, ME, { x: 4 }), A.AI_LEVELS.easy, never).reason, 'idle');
});

test('AiTargetTracks: a riding enemy stops in front of the planning bot (bots are solid too)', () => {
  const v = beltView(6, 1);
  const [e] = A.AiTargetTracks(v, v.enemies, { x: 6, y: 1, index: 0 });
  const end = e.track[e.track.length - 1];
  assert.deepStrictEqual([end.x, end.y], [5, 1]);
});

test('AiDecide: a restless bot pokes at a target close by, or wanders off - instead of waiting forever', () => {
  const v = () => view(ARENA, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }], enemies: [{ x: 2, y: 3 }] });
  // power 1: every spot in line with the enemy touches it - nothing productive to do
  const weak = Object.assign({}, ME, { power: 1 });
  const calm = A.AiDecide(v(), weak, A.AI_LEVELS.normal, never);
  assert.strictEqual(calm.bomb, false);
  const poke = A.AiDecide(v(), Object.assign({}, weak, { restless: true }), A.AI_LEVELS.normal, never);
  assert.deepStrictEqual([poke.reason, poke.bomb], ['poke', true]);
  const far = view(ARENA, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }], enemies: [{ x: 7, y: 3 }] });
  const wander = A.AiDecide(far, Object.assign({}, ME, { restless: true, bombs: 0 }), A.AI_LEVELS.normal, never);
  assert.strictEqual(wander.reason, 'wander');
  assert.ok(wander.path.length >= 3);
});

test('AiController gets restless after 8 s without dropping a bomb', () => {
  const c = new A.AiController('normal', never);
  const seen = [];
  const env = { View: () => view(ARENA, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }], enemies: [{ x: 2, y: 3 }] }), BombCount: () => 0 };
  const p = bot(17, 17, { Bombs: 1, Power: 1 });
  let pressedAt = -1;
  for (let i = 0; i < 1000 && pressedAt < 0; ++i)
    if (c.Update(0.01, p, env).BombPressed) pressedAt = i;
  assert.ok(pressedAt >= 800, 'pressed at step ' + pressedAt);
});

test('AiController sticks to a wander path instead of re-rolling it every plan', () => {
  let calls = 0;
  const c = new A.AiController('hard', () => 0.5);
  const env = { View: () => { calls++; return view(ARENA, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }], enemies: [{ x: 7, y: 3 }] }); }, BombCount: () => 0 };
  const p = bot(17, 17, { Bombs: 0, Power: 1 });
  for (let i = 0; i < 810; ++i) c.Update(0.01, p, env);   // restless after 8 s
  const before = calls;
  for (let i = 0; i < 100; ++i) { p.X += (i % 2); c.Update(0.01, p, env); }   // keeps moving, path not done
  assert.ok(calls - before <= 1, 'replanned ' + (calls - before) + ' times');
});

test('AiDecide bombs its way out past an ice block it cannot push', () => {
  // the ice block at (5,1) has a wall behind it: no push, but a blast breaks it (from (4,1), with (1,1) to hide on;
  // from (3,1) the blast would reach every tile)
  const rows = ['00000000', '0     00', '00000000'];
  const v = view(rows, { players: [{ x: 1, y: 1, index: 0 }], ice: [{ x: 5, y: 1 }] });
  const plan = A.AiDecide(v, ME, A.AI_LEVELS.normal, never);
  assert.strictEqual(plan.reason, 'wall');
  assert.deepStrictEqual(plan.path[plan.path.length - 1], { x: 4, y: 1 });
});

test('AiDecide: an ice block stuck between tiles takes both - no bomb where it pokes in', () => {
  // (1,2) is a way out, so bombing next to the ice is fine - unless the ice pokes into the bot's tile
  const rows = ['000000', '0   00', '0 0000', '000000'];
  const me = Object.assign({}, ME, { x: 2, power: 1 });
  const aligned = view(rows, { players: [{ x: 2, y: 1, index: 0 }], ice: [{ x: 3, y: 1 }] });
  assert.deepStrictEqual([A.AiDecide(aligned, me, A.AI_LEVELS.normal, never).reason, A.AiDecide(aligned, me, A.AI_LEVELS.normal, never).bomb], ['wall', true]);
  const stuck = view(rows, { players: [{ x: 2, y: 1, index: 0 }], ice: [{ x: 3, y: 1, cover: [{ x: 2, y: 1 }, { x: 3, y: 1 }] }] });
  assert.strictEqual(A.AiDecide(stuck, me, A.AI_LEVELS.normal, never).bomb, false);
});

test('AiDecide: a bomb dropped on a carpet blocks the way it rides - no escape through it', () => {
  // soft wall at (1,1); the bot at (2,1) bombs it; a carpet at (2,1) would carry the bomb into (3,1), the only way out
  const rows = ['0000000', '01    0', '0000000'];
  const me = Object.assign({}, ME, { x: 2, power: 1 });
  const plain = view(rows, { players: [{ x: 2, y: 1, index: 0 }] });
  assert.strictEqual(A.AiDecide(plain, me, A.AI_LEVELS.normal, never).bomb, true);
  const belt = view(rows, { players: [{ x: 2, y: 1, index: 0 }], carpets: [{ x: 2, y: 1, dir: 2 }] });
  assert.strictEqual(A.AiDecide(belt, me, A.AI_LEVELS.normal, never).bomb, false);
});

test('AiDecide (battle) flees away from an opponent, not past it', () => {
  // on its own bomb at (6,1): (7,2) and (4,1) are both 2 steps away, but (7,2) is next to the opponent at (7,3)
  const rows = ['000000000', '0       0', '0000000 0', '0000000 0', '000000000'];
  const v = view(rows, { players: [{ x: 6, y: 1, index: 0 }, { x: 7, y: 3, index: 1 }], bombs: [{ x: 6, y: 1, power: 1, time: 1.8 }] });
  const plan = A.AiDecide(v, Object.assign({}, ME, { x: 6, y: 1, power: 1 }), A.AI_LEVELS.normal, never);
  assert.strictEqual(plan.reason, 'flee');
  assert.deepStrictEqual(plan.path[plan.path.length - 1], { x: 4, y: 1 });
  // Easy is not that careful
  const easy = A.AiDecide(v, Object.assign({}, ME, { x: 6, y: 1, power: 1 }), A.AI_LEVELS.easy, () => 1);
  assert.deepStrictEqual(easy.path[easy.path.length - 1], { x: 7, y: 2 });
});

test('AiContested / AiBombEffect: a way out that runs past an opponent does not count as safe', () => {
  // bot at (2,1), power 2: the only safe tile is (5,1) - one step from the opponent's corridor at (5,2)
  const rows = ['0000000', '01    0', '00000 0', '0     0', '0000000'];
  const v = view(rows, { players: [{ x: 2, y: 1, index: 0 }, { x: 5, y: 3, index: 1 }] });
  const me = Object.assign({}, ME, { x: 2, power: 2 });
  const contested = A.AiContested(v, me, 2);
  assert.deepStrictEqual(Object.keys(contested).map(Number).sort((a, b) => a - b).map(i => [i % 7, Math.floor(i / 7)].join(',')),
    ['5,1', '5,2', '3,3', '4,3', '5,3']);
  const d = A.AiDangerMap(v);
  assert.strictEqual(A.AiBombEffect(v, me, me, d, OPTS).safe, true);
  assert.strictEqual(A.AiBombEffect(v, me, me, d, OPTS, contested).safe, false);
});

// ---- skulls ----
const CORRIDOR = [
  '00000000000000',
  '0            0',
  '0 0 0 0 0 0 00',
  '0            0',
  '00000000000000'];
const player = (index, x, y) => ({ index, x, y, dead: false, cover: [{ x, y }] });
const me = (x, y) => ({ x, y, index: 0, speed: 1, power: 2, bombs: 1, superBomb: false, kick: false });
const rng = () => 0.5;

test('careful bots lurk just outside a blinking skull\'s reach, by the exits of an opponent inside it', () => {
  // the skull is at x 3, reach 5: the opponent at x 5 stands inside; the bot is far to the right
  // (2 s left: too little to blow it up, so the bot lurks instead)
  const v = view(CORRIDOR, { skulls: [{ x: 3, y: 1, time: 2 }], players: [player(0, 12, 1), player(1, 5, 1)] });
  const d = A.AiDecide(v, me(12, 1), A.AI_LEVELS.hard, rng);
  assert.strictEqual(d.reason, 'skull');
  assert.ok(d.path.length > 0 && !d.bomb);
  const end = d.path[d.path.length - 1];
  const reach = A.AiBlastCells(v, { x: 3, y: 1, power: 5 }).map(key);
  assert.ok(!reach.includes(key(end)), 'waits outside the reach: ' + key(end));
  assert.ok(Math.abs(end.x - 5) + Math.abs(end.y - 1) <= 3, 'by an exit of the opponent: ' + key(end));
});

test('Easy bots ignore the skull, and nobody lurks when the skull is out of time or nobody is inside', () => {
  const inside = { skulls: [{ x: 3, y: 1, time: 2 }], players: [player(0, 12, 1), player(1, 5, 1)] };
  assert.notStrictEqual(A.AiDecide(view(CORRIDOR, inside), me(12, 1), A.AI_LEVELS.easy, rng).reason, 'skull');
  assert.notStrictEqual(A.AiDecide(view(CORRIDOR, { skulls: [{ x: 3, y: 1, time: 0.5 }], players: inside.players }), me(12, 1), A.AI_LEVELS.hard, rng).reason, 'skull');
  assert.notStrictEqual(A.AiDecide(view(CORRIDOR, { skulls: inside.skulls, players: [player(0, 12, 1), player(1, 12, 3)] }), me(12, 1), A.AI_LEVELS.hard, rng).reason, 'skull');
});

test('an enemy a skull let out in battle is something to bomb and to stay away from', () => {
  const v = view(CORRIDOR, { players: [player(0, 5, 1)], enemies: [{ x: 7, y: 1, type: 0, cover: [{ x: 7, y: 1 }] }] });
  const d = A.AiDecide(v, me(5, 1), A.AI_LEVELS.hard, rng);
  assert.ok(d.bomb || d.reason == 'evade' || d.reason == 'flee', 'reacts: ' + d.reason);
});

// ---- power-ups a human has first pick of ----
test('campaign bots leave a locked power-up alone: no goal, no walking over it, no bomb that burns it', () => {
  const HALL = ['000000000', '0       0', '0 0 0 0 0', '0       0', '000000000'];
  const mine = { x: 1, y: 1, index: 0, speed: 1, power: 2, bombs: 1, superBomb: false, kick: false };
  const campaign = extra => view(HALL, Object.assign({ mode: 'campaign', players: [{ index: 0, x: 1, y: 1, dead: false, cover: [{ x: 1, y: 1 }] }],
    enemies: [{ x: 7, y: 3, type: 0, cover: [{ x: 7, y: 3 }] }] }, extra));
  const free = campaign({ powerups: [{ x: 4, y: 1, type: 0, locked: false }] });
  assert.strictEqual(A.AiDecide(free, mine, A.AI_LEVELS.hard, rng).reason, 'item');
  const locked = campaign({ powerups: [{ x: 4, y: 1, type: 0, locked: true }] });
  const d = A.AiDecide(locked, mine, A.AI_LEVELS.hard, rng);
  assert.notStrictEqual(d.reason, 'item');
  assert.ok(!d.path.some(t => t.x == 4 && t.y == 1), 'does not step on it');
  // a bomb at the bot's own tile would burn x 2-3 only; one next to the pickup would burn it
  const near = campaign({ powerups: [{ x: 2, y: 1, type: 0, locked: true }] });
  assert.strictEqual(A.AiDecide(near, mine, A.AI_LEVELS.hard, rng).bomb, false);
});

// ---- players keeping apart ----
const OPEN = ['000000000', '0       0', '0       0', '0       0', '000000000'];
const pl = (index, x, y) => ({ index, x, y, dead: false, cover: [{ x, y }] });

test('a bot standing on another player steps off to a free tile, away from them', () => {
  const v = view(OPEN, { players: [pl(0, 4, 2), pl(1, 4, 2)] });
  const plan = A.AiDecide(v, Object.assign({}, ME, { x: 4, y: 2, index: 0 }), A.AI_LEVELS.normal, () => 0.5);
  assert.strictEqual(plan.reason, 'separate');
  assert.ok(plan.path.length >= 1 && plan.path.length <= 2);
  const end = plan.path[plan.path.length - 1];
  assert.ok(Math.abs(end.x - 4) + Math.abs(end.y - 2) >= 1, 'a different tile: ' + JSON.stringify(end));
});

test('two bots on the same tile do not pick the same way off it (the random rolls decide)', () => {
  const v = view(OPEN, { players: [pl(0, 4, 2), pl(1, 4, 2)] });
  const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const ends = new Set();
  for (let r = 1; r <= 40; ++r) {
    const p = A.AiDecide(v, Object.assign({}, ME, { x: 4, y: 2, index: 0 }), A.AI_LEVELS.normal, seeded(r * 7919)).path;
    ends.add(p[p.length - 1].x + ',' + p[p.length - 1].y);
  }
  assert.ok(ends.size >= 4, 'varied: ' + [...ends].join(' '));
});

test('bots walk around other players when there is room, and through them when there is not', () => {
  const rows = ['0000000', '0     0', '0 000 0', '0     0', '0000000'];
  const mine = Object.assign({}, ME, { x: 1, y: 1, index: 0, bombs: 0 });
  const roomy = view(rows, { players: [pl(0, 1, 1), pl(1, 3, 1)], powerups: [{ x: 5, y: 1, type: 0 }] });
  const around = A.AiDecide(roomy, mine, A.AI_LEVELS.hard, never);
  assert.strictEqual(around.reason, 'item');
  assert.ok(!around.path.some(c => c.x == 3 && c.y == 1), 'goes round: ' + JSON.stringify(around.path));
  const corridor = view(['000000', '0    0', '000000'], { players: [pl(0, 1, 1), pl(1, 2, 1)], powerups: [{ x: 4, y: 1, type: 0 }] });
  const through = A.AiDecide(corridor, mine, A.AI_LEVELS.hard, never);
  assert.strictEqual(through.reason, 'item');
  assert.ok(through.path.some(c => c.x == 2 && c.y == 1), 'there is no other way: ' + JSON.stringify(through.path));
});

// ---- aggression in battle ----
test('battle: Normal and Hard bots bomb an opponent that is close, even when the blast would not reach it; Easy does not', () => {
  // two rooms side by side, a wall between them: the opponent is 3 tiles away but out of reach of the blast
  const rows = ['00000000', '0   0  0', '0 0 0 00', '0   0  0', '00000000'];
  const mine = Object.assign({}, ME, { x: 3, y: 1, index: 0, bombs: 1, power: 1 });
  const v = view(rows, { players: [pl(0, 3, 1), pl(1, 5, 1)] });
  const normal = A.AiDecide(v, mine, A.AI_LEVELS.normal, never);
  assert.strictEqual(normal.reason, 'pressure');
  assert.strictEqual(normal.bomb, true);
  assert.notStrictEqual(A.AiDecide(v, mine, A.AI_LEVELS.easy, never).reason, 'pressure');
  // not in the campaign (an opponent is not a target there)
  const campaign = view(rows, { mode: 'campaign', players: [pl(0, 3, 1), pl(1, 5, 1)] });
  assert.notStrictEqual(A.AiDecide(campaign, mine, A.AI_LEVELS.normal, never).reason, 'pressure');
});

test('battle: with nothing else to do a bot closes in on the nearest opponent', () => {
  const rows = ['000000000', '0       0', '000000000'];
  const none = Object.assign({}, ME, { x: 1, y: 1, index: 0, bombs: 0 });
  const v = view(rows, { players: [pl(0, 1, 1), pl(1, 7, 1)] });
  const plan = A.AiDecide(v, none, A.AI_LEVELS.hard, never);
  assert.strictEqual(plan.reason, 'approach');
  assert.ok(plan.path.length > 0 && plan.path[plan.path.length - 1].x > 1, JSON.stringify(plan.path));
});

test('the aggressive tuning is only for battles: the same bot in the campaign keeps its old goals', () => {
  const rows = ['0000000000', '0        0', '0 1      0', '0000000000'];
  const mine = Object.assign({}, ME, { x: 8, y: 1, index: 0, bombs: 1 });
  const lvl = A.AI_LEVELS.normal;
  const campaign = A.AiDecide(view(rows, { mode: 'campaign', players: [pl(0, 8, 1)], enemies: [] }), mine, lvl, never);
  const battle = A.AiDecide(view(rows, { mode: 'battle', players: [pl(0, 8, 1), pl(1, 1, 3)] }), mine, lvl, never);
  assert.ok(campaign.reason == 'wall' || campaign.reason == 'idle');
  assert.ok(['wall', 'approach', 'hunt'].includes(battle.reason), battle.reason);
});

// ---- sudden death ----
test('a bot standing where the arena is about to close runs inward, and never plans a way through a cell that shuts first', () => {
  const rows = ['000000000000', '0          0', '0          0', '000000000000'];
  const mine = Object.assign({}, ME, { x: 1, y: 1, index: 0, bombs: 0 });
  // columns 1, 2 and 3 close within a few seconds (the schedule runs from the outside in)
  const closing = [];
  [1, 2, 3].forEach((x, k) => [1, 2].forEach((y, j) => closing.push({ x, y, t: 1 + k * 1.0 + j * 0.12 })));
  const v = view(rows, { players: [pl(0, 1, 1)], closing });
  const plan = A.AiDecide(v, mine, A.AI_LEVELS.normal, never);
  assert.strictEqual(plan.reason, 'flee');
  assert.ok(plan.path.length > 0 && plan.path[plan.path.length - 1].x >= 4, 'to a tile that is not closing: ' + JSON.stringify(plan.path));
  // a route that crosses a cell too late is refused
  const reach = A.AiReach(v, { x: 5, y: 1 }, A.AiDangerMap(v), { step: A.AI_TILE_SECONDS, margin: 0.25, avoid: null });
  assert.strictEqual(reach.steps[1 * v.w + 1], undefined, 'column 1 shuts in 1 s: four steps away is too far to get there in time');
  assert.notStrictEqual(reach.steps[1 * v.w + 3], undefined, 'column 3 shuts in 3 s: two steps is plenty');
});

test('the arena schedule only matters in a battle: an empty schedule changes nothing', () => {
  const rows = ['000000000', '0       0', '000000000'];
  const mine = Object.assign({}, ME, { x: 1, y: 1, index: 0, bombs: 0 });
  const a = A.AiDecide(view(rows, { players: [pl(0, 1, 1)] }), mine, A.AI_LEVELS.normal, never);
  const b = A.AiDecide(view(rows, { players: [pl(0, 1, 1)], closing: [] }), mine, A.AI_LEVELS.normal, never);
  assert.deepStrictEqual(a, b);
});

// ---- blowing up blinking skulls ----
test('a bot walks to a spot from which its bomb reaches a blinking skull, and bombs it there', () => {
  const v = x => view(CORRIDOR, { skulls: [{ x: 3, y: 1, time: 4.5 }], players: [player(0, x, 1)] });
  const far = A.AiDecide(v(9), me(9, 1), A.AI_LEVELS.normal, rng);
  assert.strictEqual(far.reason, 'skullpop');
  assert.ok(far.path.length > 0 && far.path[far.path.length - 1].x <= 5, 'to within its blast of the skull: ' + JSON.stringify(far.path));
  const there = A.AiDecide(v(4), me(4, 1), A.AI_LEVELS.normal, rng);
  assert.strictEqual(there.reason, 'skullpop');
  assert.strictEqual(there.bomb, true);
});

test('a skull with too little time left, one a bomb is already about to blow up, or a bot with no bombs or on Easy: no popping', () => {
  const at4 = Object.assign({}, me(4, 1));
  assert.notStrictEqual(A.AiDecide(view(CORRIDOR, { skulls: [{ x: 3, y: 1, time: 2.2 }], players: [player(0, 4, 1)] }), at4, A.AI_LEVELS.normal, rng).reason, 'skullpop');
  const bombed = view(CORRIDOR, { skulls: [{ x: 3, y: 1, time: 4.5 }], players: [player(0, 6, 1)], bombs: [{ x: 4, y: 1, power: 2, time: 1.5 }] });
  assert.notStrictEqual(A.AiDecide(bombed, me(6, 1), A.AI_LEVELS.normal, rng).reason, 'skullpop');
  const none = view(CORRIDOR, { skulls: [{ x: 3, y: 1, time: 4.5 }], players: [player(0, 4, 1)] });
  assert.notStrictEqual(A.AiDecide(none, Object.assign({}, me(4, 1), { bombs: 0 }), A.AI_LEVELS.normal, rng).reason, 'skullpop');
  assert.notStrictEqual(A.AiDecide(none, me(4, 1), A.AI_LEVELS.easy, rng).reason, 'skullpop');
});

test('AiForecast says which skulls a blast reaches before their time is up', () => {
  const W2 = require('../Game/AiWorld.js');
  const rows = ['00000000000', '0         0', '00000000000'];
  const v = Object.assign(view(rows), { skulls: [{ x: 3, y: 1, time: 4 }, { x: 9, y: 1, time: 4 }], bombs: [{ x: 4, y: 1, power: 1, time: 1.5 }] });
  assert.deepStrictEqual(W2.AiForecast(v).popped, [true, false]);
  assert.deepStrictEqual(W2.AiForecast(Object.assign({}, v, { bombs: [] })).popped, [false, false]);
});

const HALL = ['000000000', '0       0', '0 0 0 0 0', '0       0', '000000000'];

test('AiDecide: with the push power-up a bot kicks a threatening bomb only when the kick also hits somebody - else it runs', () => {
  const me = Object.assign({}, ME, { x: 1, y: 1, kick: true });
  const bomb = { x: 2, y: 1, power: 2, time: 1.0, pushable: true };
  const alone = view(HALL, { players: [{ x: 1, y: 1, index: 0 }], bombs: [bomb] });
  assert.strictEqual(A.AiDecide(alone, me, A.AI_LEVELS.hard, never).reason, 'flee');
  // an opponent at the far end of the row: the kicked bomb slides at it
  const aimed = view(HALL, { players: [{ x: 1, y: 1, index: 0 }, { x: 7, y: 1, index: 1 }], bombs: [bomb] });
  const plan = A.AiDecide(aimed, me, A.AI_LEVELS.hard, never);
  assert.deepStrictEqual([plan.reason, plan.kick], ['kick', 2]);
});

test('AiDecide keeps the goal of its last plan when another is about as good (no taking turns)', () => {
  const v = () => view(HALL, { players: [{ x: 1, y: 1, index: 0 }], powerups: [{ x: 3, y: 1, type: 1 }, { x: 1, y: 3, type: 1 }] });
  const me = (goal) => Object.assign({}, ME, { x: 1, y: 1, memory: { goal: { i: goal }, reason: 'item', now: 0, kicks: [] } });
  const end = plan => plan.path[plan.path.length - 1];
  assert.deepStrictEqual(end(A.AiDecide(v(), me(1 * 9 + 3), A.AI_LEVELS.hard, never)), { x: 3, y: 1 });
  assert.deepStrictEqual(end(A.AiDecide(v(), me(3 * 9 + 1), A.AI_LEVELS.hard, never)), { x: 1, y: 3 });
});

test('AiDecide waits for a blast to pass when that is the safe way: a way out may include standing still', () => {
  // a bot at (1,1) in a one-tile-wide dead end; the blast of a bomb at (3,1) (power 1) burns (2,1) for 0.5 - 0.8 s only,
  // and (1,1) never burns: the way out (no further) is to stay
  const v = view(['000000', '0    0', '000000'], { players: [{ x: 1, y: 1, index: 0 }], bombs: [{ x: 3, y: 1, power: 1, time: 0.5 }] });
  const d = A.AiDangerMap(v);
  assert.deepStrictEqual(A.AiEscape(v, { x: 1, y: 1 }, d, { step: A.AI_TILE_SECONDS, margin: 0.25, avoid: null }), []);
});

test('AiEscape: a way out that is only safe if the bot is quick enough counts as a last resort, but the bomb check wants a tile that never burns', () => {
  const rows = ['0000000', '0     0', '0000000'];
  // (1,1) is in a power 1 blast of the bomb at (2,1)... (3,1) .. (5,1) are out of it
  const v = view(rows, { players: [{ x: 1, y: 1, index: 0 }], bombs: [{ x: 2, y: 1, power: 1, time: 0.5 }, { x: 3, y: 1, power: 1, time: 3 }] });
  const d = A.AiDangerMap(v);
  const strict = A.AiEscape(v, { x: 1, y: 1 }, d, { step: A.AI_TILE_SECONDS, margin: 0, avoid: null, strict: true });
  assert.strictEqual(strict, null);   // every tile of the corridor burns sooner or later
});

test('AiDecide: no digging bomb that would burn the power-up another bomb is about to uncover - it digs elsewhere or waits', () => {
  // the brick at (4,1) is already going to be blasted by the bomb at (5,1) in 0.5 s; our bomb (power 5) at (7,1) would blast it
  // again after the power-up shows. Bricks at (2,3) / (3,3)... elsewhere are fine.
  const rows = ['000000000', '0   1   0', '0 0 0 0 00', '0 11    00', '000000000'];
  const me = Object.assign({}, ME, { x: 7, y: 1, power: 5 });
  const bomb = { x: 5, y: 1, power: 1, time: 0.5 };
  const v = () => view(rows, { players: [{ x: 7, y: 1, index: 0 }], bombs: [bomb] });
  const plan = A.AiDecide(v(), me, A.AI_LEVELS.hard, never);
  assert.ok(!(plan.bomb && plan.reason == 'wall'), JSON.stringify(plan));
  // with the careful rule off, it would bomb right there
  const eff = A.AiBombEffect(v(), me, { x: 7, y: 1 }, A.AiDangerMap(v()), { step: A.AI_TILE_SECONDS, margin: 0.25, avoid: null });
  assert.strictEqual(eff.wasted, true);
});

test('AiDecide: the same brick, no other bomb about to break it: a bot digs it as usual', () => {
  const rows = ['000000000', '0   1   0', '000000000'];
  const me = Object.assign({}, ME, { x: 6, y: 1, power: 2 });
  const v = view(rows, { players: [{ x: 6, y: 1, index: 0 }] });
  const eff = A.AiBombEffect(v, me, { x: 6, y: 1 }, A.AiDangerMap(v), { step: A.AI_TILE_SECONDS, margin: 0.25, avoid: null });
  assert.strictEqual(eff.wasted, false);
});

test('campaign cooperation: a bot does not go for the brick a nearer teammate has claimed', () => {
  // bricks at (2,1) and (6,1); we stand at (4,1): the spots (3,1) and (5,1) are one step away. The teammate at (7,1) is on
  // its way to (5,1).
  const rows = ['000000000', '0 1   1 0', '000000000'];
  const plain = () => view(rows, { mode: 'campaign', players: [{ x: 4, y: 1, index: 0 }, { x: 7, y: 1, index: 1, bot: true }] });
  const me = Object.assign({}, ME, { x: 4, y: 1, power: 1 });
  const end = plan => plan.path[plan.path.length - 1];
  assert.deepStrictEqual(end(A.AiDecide(plain(), me, A.AI_LEVELS.hard, never)), { x: 5, y: 1 });
  const claimed = () => Object.assign(plain(), { mates: [{ index: 1, x: 5, y: 1, reason: 'wall' }] });
  assert.deepStrictEqual(end(A.AiDecide(claimed(), me, A.AI_LEVELS.hard, never)), { x: 3, y: 1 });
  // a teammate who is further from the spot than we are has no claim on it
  const far = Object.assign(plain(), { mates: [{ index: 1, x: 5, y: 1, reason: 'wall' }], players: [{ x: 4, y: 1, index: 0 }, { x: 8, y: 1, index: 1, bot: true }] });
  assert.deepStrictEqual(end(A.AiDecide(far, me, A.AI_LEVELS.hard, never)), { x: 5, y: 1 });
});

test('campaign cooperation: a power-up a human is clearly nearer to is left to them; one a CPU player is nearer to is not', () => {
  const rows = ['000000000', '0       0', '000000000'];
  const make = bot => view(rows, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }, { x: 6, y: 1, index: 1, bot }], powerups: [{ x: 7, y: 1, type: 1 }] });
  const me = Object.assign({}, ME, { x: 1, y: 1, power: 1, bombs: 0 });
  assert.notStrictEqual(A.AiDecide(make(false), me, A.AI_LEVELS.hard, never).reason, 'item');
  assert.strictEqual(A.AiDecide(make(true), me, A.AI_LEVELS.hard, never).reason, 'item');
});

test('campaign: a bot bombs where a walking enemy will be when the bomb goes off, not only where it is now', () => {
  // the enemy walks left along row 1 and is in the bot's blast (tiles 10 - 14) when the bomb goes off 2 s later; it stands now at (24,1)
  const rows = ['0'.repeat(30), '0' + ' '.repeat(28) + '0', '0'.repeat(30)];
  const enemy = Object.assign({ x: 24, y: 1, type: 0, dir: 4, speed: 1, moving: true });
  const v = (e) => view(rows, { mode: 'campaign', players: [{ x: 12, y: 1, index: 0 }], enemies: [e] });
  const me = Object.assign({}, ME, { x: 12, y: 1, power: 2 });
  const hardPlan = A.AiDecide(v(enemy), me, A.AI_LEVELS.hard, never);
  assert.deepStrictEqual([hardPlan.reason, hardPlan.bomb], ['stalk', true]);
  // an enemy walking away (a long way from the end of the corridor) does not get a bomb on the spot; neither does one marked
  // as not moving; Easy does not stalk
  assert.notStrictEqual(A.AiDecide(v(Object.assign({}, enemy, { dir: 2 })), me, A.AI_LEVELS.hard, never).reason, 'stalk');
  assert.notStrictEqual(A.AiDecide(v(Object.assign({}, enemy, { moving: false })), me, A.AI_LEVELS.hard, never).reason, 'stalk');
  assert.notStrictEqual(A.AiDecide(v(enemy), me, A.AI_LEVELS.easy, never).reason, 'stalk');
});

test('AiDecide labels its plan with a word for the HUD: fleeing, digging, searching, guarding the human ...', () => {
  const word = (v, me, level) => A.AiDecide(v, me, level || A.AI_LEVELS.hard, never).intent;
  // a bomb about to go off right here
  const flee = view(HALL, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }], bombs: [{ x: 1, y: 1, power: 2, time: 1 }] });
  assert.strictEqual(word(flee, Object.assign({}, ME, { x: 1, y: 1 })), 'FLEEING');
  // a brick to dig
  const dig = view(['0000000', '0 1   0', '0000000'], { mode: 'campaign', players: [{ x: 5, y: 1, index: 0 }] });
  assert.strictEqual(word(dig, Object.assign({}, ME, { x: 5, y: 1, power: 1 })), 'DIGGING');
  // nothing to do and no bombs left: waiting; with bombs and nothing to do: searching
  const empty = view(['00000', '0   0', '00000'], { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }] });
  assert.strictEqual(word(empty, Object.assign({}, ME, { x: 1, y: 1, bombs: 0 })), 'WAITING');
  assert.strictEqual(word(empty, Object.assign({}, ME, { x: 1, y: 1 })), 'SEARCHING');
  // an enemy in line: killing; the same enemy close to a human: guarding them
  const fight = bot => view(HALL, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }, { x: 7, y: 3, index: 1, bot }], enemies: [{ x: 4, y: 1 }] });
  assert.strictEqual(word(fight(true), Object.assign({}, ME, { x: 1, y: 1, power: 3 })), 'KILLING');
  assert.strictEqual(word(fight(false), Object.assign({}, ME, { x: 1, y: 1, power: 3 })), 'GUARDING');
  // battle: opponents are attacked, not killed
  const duel = view(HALL, { players: [{ x: 1, y: 1, index: 0 }, { x: 4, y: 1, index: 1 }] });
  assert.strictEqual(word(duel, Object.assign({}, ME, { x: 1, y: 1, power: 3 })), 'ATTACK');
});

test('AiDecide (campaign): Normal and Hard dig out a power-up that shows through a chipped brick before a nearer plain brick; Easy does not', () => {
  // bricks at (1,1) (two steps away) and (7,1) (four steps away)
  const rows = ['000000000', '01     10', '0       0', '000000000'];
  const me = Object.assign({}, ME, { x: 3, y: 2, power: 1 });
  const v = shown => view(rows, { players: [{ x: 3, y: 2, index: 0, bot: true }], shown, mode: 'campaign' });
  const side = (shown, level) => {
    const plan = A.AiDecide(v(shown), me, A.AI_LEVELS[level], never);
    assert.strictEqual(plan.reason, 'wall');
    return plan.path[plan.path.length - 1].x > 4 ? 'right' : 'left';
  };
  assert.strictEqual(side([], 'normal'), 'left');
  assert.strictEqual(side([{ x: 7, y: 1, type: 1 }], 'normal'), 'right');
  assert.strictEqual(side([{ x: 7, y: 1, type: 1 }], 'hard'), 'right');
  assert.strictEqual(side([{ x: 7, y: 1, type: 1 }], 'easy'), 'left');
  assert.strictEqual(side([{ x: 7, y: 1, type: 5 }], 'normal'), 'left', 'not for a skull');
});
