# AI Players Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Computer-controlled players ("CPU", Easy / Normal / Hard) that the host adds in the local lobby or a LAN room. They cooperate in Campaign and fight in Battle.

**Architecture:** `Game/AiBrain.js` holds a pure planner (`AiDecide`) that works on a tile "view" of the world (blast cells, danger timings, BFS paths, escape and friendly-fire checks). It also holds an `AiController` that turns plans into the `{Dir, Bomb, BombPressed}` actions `Input.Player()` returns. `PiNaBlaster.GameTick` asks the controller for bot slots. The lobbies gain an Up/Down cursor with Left/Right bot controls. The LAN server gets host-only `bot` / `unbot` messages.

**Tech Stack:** Plain browser JavaScript (global functions, `module.exports` guard for Node tests), `node --test` (Node 22), Python 3 `unittest`.

## Global Constraints

- No dependencies. Browser files use globals; pure helpers end with `if (typeof module !== 'undefined') module.exports = {...}`.
- Tabs for indentation, Allman braces, `var`, as in the existing JS files.
- Bot roster entry: `{ Bot: "easy" | "normal" | "hard" }`. Local lobby id: `"ai:<level>"`. LAN bot slot: `{client: <host id>, name: "CPU", src: "ai", label: "AI - <Level>", bot: "<level>"}`.
- Bot label: `"CPU " + (index + 1)`; humans keep `"P" + (index + 1)`.
- Bots count toward `MAX_PLAYERS` (6) and the mode minimum (Battle 2).
- Campaign game over when all *humans* are out. Campaign bots never place a bomb that burns a teammate.
- Run tests: `node --test tests/*.test.js` and `python -m unittest discover -s server_tests`.
- The project folder is not a git repository: skip the commit steps.

---

### Task 1: Brain core (blast, danger, paths, safety checks)

**Files:**
- Create: `Game/AiBrain.js`
- Test: `tests/ai.test.js`

**Interfaces:**
- Produces: `AiBlastCells(view, bomb) -> [{x,y}]`, `AiDangerMap(view) -> number[]` (index `y*w+x`, seconds, `Infinity` = safe), `AiReach(view, from, danger, opts) -> {order, steps, prev, start}`, `AiFindPath(view, from, isGoal, danger, opts) -> [{x,y}] | null`, `AiEscape(view, from, danger, opts)`, `AiSafeAfterBomb(view, me, opts) -> bool`, `AiHitsTeammate(view, me, danger) -> bool`, constants `AI_TILE_SECONDS`, `AI_BOMB_SECONDS`, `AI_FIRE_SECONDS`, `AI_DIRS`.
- `view = { w, h, walls:[string], bombs:[{x,y,power,time,superBomb}], fire:[{x,y}], blocked:[{x,y}], enemies:[{x,y}], powerups:[{x,y,type}], keys:[{x,y}], players:[{x,y,index,dead,bot}], keyFlags, mode }`
- `opts = { step: seconds per tile, margin: seconds, avoid: {index:true} | null }`
- `me = { x, y, index, speed, power, bombs, superBomb }`

- [ ] **Step 1: Write the failing tests** (`tests/ai.test.js`)

```js
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/ai.test.js`
Expected: FAIL, `Cannot find module '../Game/AiBrain.js'`

- [ ] **Step 3: Implement** (`Game/AiBrain.js`, first part)

```js
// Computer players (CPU). AiDecide and its helpers are pure: they plan on a tile "view" of the world
// (built by AiBuildView). AiController turns the plans into the actions Input.Player() returns.

var AI_TILE_SECONDS = 0.17;   // one tile at speed 1 (17 px, one pixel per 10 ms step)
var AI_BOMB_SECONDS = 2.0;    // Bomb.ExplosionTime
var AI_FIRE_SECONDS = 0.3;    // how long a blast keeps burning a tile

// index = game direction: 1 up, 2 right, 3 down, 4 left
var AI_DIRS = [null, [0, -1], [1, 0], [0, 1], [-1, 0]];

function AiInside(view, x, y)
{
	return x >= 0 && y >= 0 && x < view.w && y < view.h;
}

function AiWall(view, x, y)
{
	return AiInside(view, x, y) ? view.walls[y][x] : "0";
}

function AiIndex(view, x, y)
{
	return y * view.w + x;
}

// Can a player stand here (ignoring entities)? Doors open for a team holding their key.
function AiFloor(view, x, y)
{
	var ch = AiWall(view, x, y);
	var door = "ABCD".indexOf(ch);

	return ch == " " || (door >= 0 && !!(view.keyFlags & (1 << door)));
}

// Tiles taken by a bomb or a solid obstacle (ice block, hot wall): index -> true
function AiObstacles(view)
{
	var map = {};

	view.bombs.concat(view.blocked).forEach(function(b) { map[AiIndex(view, b.x, b.y)] = true; });

	return map;
}

function AiCellSet(view, cells)
{
	var set = {};

	cells.forEach(function(c) { set[AiIndex(view, c.x, c.y)] = true; });

	return set;
}

// Tiles a bomb burns, like CreateExplosionLine: `power` tiles each way, stopping before hard walls
// and on soft walls ("1"), which super bombs burn through.
function AiBlastCells(view, bomb)
{
	var cells = [{ x: bomb.x, y: bomb.y }];

	for (var d = 1; d <= 4; ++d)
	{
		for (var i = 1; i <= bomb.power; ++i)
		{
			var x = bomb.x + AI_DIRS[d][0] * i, y = bomb.y + AI_DIRS[d][1] * i;
			var ch = AiWall(view, x, y);

			if (ch != " " && ch != "1")
				break;

			cells.push({ x: x, y: y });

			if (ch == "1" && !bomb.superBomb)
				break;
		}
	}

	return cells;
}

// Seconds until each tile burns (Infinity = no bomb reaches it). Bombs caught in a blast go off with it.
function AiDangerMap(view)
{
	var map = [], i, j;

	for (i = 0; i < view.w * view.h; ++i)
		map.push(Infinity);

	var times = view.bombs.map(function(b) { return b.time; });
	var cells = view.bombs.map(function(b) { return AiBlastCells(view, b); });
	var bombAt = {};

	view.bombs.forEach(function(b, k) { bombAt[AiIndex(view, b.x, b.y)] = k; });

	for (var changed = true; changed; )
	{
		changed = false;

		for (i = 0; i < cells.length; ++i)
		{
			for (j = 0; j < cells[i].length; ++j)
			{
				var k = bombAt[AiIndex(view, cells[i][j].x, cells[i][j].y)];

				if (k !== undefined && times[k] > times[i])
				{
					times[k] = times[i];
					changed = true;
				}
			}
		}
	}

	for (i = 0; i < cells.length; ++i)
	{
		for (j = 0; j < cells[i].length; ++j)
		{
			var c = AiIndex(view, cells[i][j].x, cells[i][j].y);

			if (times[i] < map[c])
				map[c] = times[i];
		}
	}

	view.fire.forEach(function(f)
	{
		if (AiInside(view, f.x, f.y))
			map[AiIndex(view, f.x, f.y)] = 0;
	});

	return map;
}

// Breadth-first search over standable tiles. A tile can be crossed when the bot is out of it `margin`
// seconds before it burns, or after the blast is over. `avoid` tiles are reached but not walked through.
function AiReach(view, from, danger, opts)
{
	var obstacles = AiObstacles(view);
	var start = AiIndex(view, from.x, from.y);
	var steps = {}, prev = {}, order = [start];

	steps[start] = 0;
	prev[start] = -1;

	for (var q = 0; q < order.length; ++q)
	{
		var cur = order[q];
		var cx = cur % view.w, cy = Math.floor(cur / view.w);

		if (cur != start && opts.avoid && opts.avoid[cur])
			continue;

		for (var d = 1; d <= 4; ++d)
		{
			var nx = cx + AI_DIRS[d][0], ny = cy + AI_DIRS[d][1];

			if (!AiFloor(view, nx, ny))
				continue;

			var ni = AiIndex(view, nx, ny);

			if (steps[ni] !== undefined || obstacles[ni])
				continue;

			var s = steps[cur] + 1;
			var burn = danger[ni];

			if (burn != Infinity && !((s + 0.5) * opts.step + opts.margin < burn || (s - 0.5) * opts.step > burn + AI_FIRE_SECONDS))
				continue;

			steps[ni] = s;
			prev[ni] = cur;
			order.push(ni);
		}
	}

	return { order: order, steps: steps, prev: prev, start: start };
}

function AiTrace(view, reach, end)
{
	var path = [];

	for (var i = end; i != reach.start; i = reach.prev[i])
		path.unshift({ x: i % view.w, y: Math.floor(i / view.w) });

	return path;
}

// Tiles to walk (excluding `from`) to the nearest tile where isGoal(x, y) holds; [] when already there, null when none.
function AiFindPath(view, from, isGoal, danger, opts)
{
	var reach = AiReach(view, from, danger, opts);

	for (var n = 0; n < reach.order.length; ++n)
	{
		var i = reach.order[n];

		if (isGoal(i % view.w, Math.floor(i / view.w)))
			return AiTrace(view, reach, i);
	}

	return null;
}

// Path to the nearest tile no blast will touch (and, with opts.avoid, away from enemies).
function AiEscape(view, from, danger, opts)
{
	return AiFindPath(view, from, function(x, y)
	{
		var i = AiIndex(view, x, y);

		return danger[i] == Infinity && !(opts.avoid && opts.avoid[i]);
	}, danger, opts);
}

function AiWithBomb(view, me)
{
	var v = {};

	for (var k in view)
		v[k] = view[k];

	v.bombs = view.bombs.concat([{ x: me.x, y: me.y, power: me.power, time: AI_BOMB_SECONDS, superBomb: !!me.superBomb }]);

	return v;
}

// Is there still a way to safety after dropping a bomb where the bot stands?
function AiSafeAfterBomb(view, me, opts)
{
	var v = AiWithBomb(view, me);

	return AiEscape(v, me, AiDangerMap(v), { step: opts.step, margin: opts.margin, avoid: null }) !== null;
}

// Would a bomb here burn (directly or through a chain) a living teammate's tile sooner than before?
function AiHitsTeammate(view, me, danger)
{
	var after = AiDangerMap(AiWithBomb(view, me));

	return view.players.some(function(p)
	{
		if (p.dead || p.index == me.index)
			return false;

		var i = AiIndex(view, p.x, p.y);

		return after[i] < danger[i];
	});
}
```

Export block (at the end of the file; Task 2 and 3 extend it):

```js
if (typeof module !== 'undefined')
	module.exports = {
		AI_TILE_SECONDS: AI_TILE_SECONDS, AI_BOMB_SECONDS: AI_BOMB_SECONDS, AI_FIRE_SECONDS: AI_FIRE_SECONDS, AI_DIRS: AI_DIRS,
		AiBlastCells: AiBlastCells, AiDangerMap: AiDangerMap, AiReach: AiReach, AiFindPath: AiFindPath, AiEscape: AiEscape,
		AiSafeAfterBomb: AiSafeAfterBomb, AiHitsTeammate: AiHitsTeammate
	};
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/ai.test.js`
Expected: all PASS

---

### Task 2: Decisions and difficulty levels

**Files:**
- Modify: `Game/AiBrain.js` (append before the export block, extend exports)
- Test: `tests/ai.test.js` (append)

**Interfaces:**
- Consumes: Task 1 functions.
- Produces: `AI_LEVELS` (`easy`/`normal`/`hard` -> `{Name, ThinkMs, Margin, SkipDanger, HuntRange, HuntBonus, WallBonus, PowerRange, AvoidBadLuck}`), `AiDecide(view, me, level, rng) -> { path: [{x,y}], bomb: bool, reason: "flee"|"attack"|"evade"|"item"|"key"|"hunt"|"wall"|"idle" }`.

- [ ] **Step 1: Write the failing tests** (append)

```js
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/ai.test.js`
Expected: FAIL, `A.AiDecide is not a function`

- [ ] **Step 3: Implement** (append to `Game/AiBrain.js` before the export block)

```js
var AI_LEVELS =
{
	easy:   { Name: "Easy",   ThinkMs: 400, Margin: 0.35, SkipDanger: 0.2, HuntRange: 4,   HuntBonus: 2, WallBonus: 0, PowerRange: 0,   AvoidBadLuck: false },
	normal: { Name: "Normal", ThinkMs: 150, Margin: 0.25, SkipDanger: 0,   HuntRange: 8,   HuntBonus: 2, WallBonus: 6, PowerRange: 5,   AvoidBadLuck: true },
	hard:   { Name: "Hard",   ThinkMs: 50,  Margin: 0.15, SkipDanger: 0,   HuntRange: 999, HuntBonus: 0, WallBonus: 8, PowerRange: 999, AvoidBadLuck: true }
};

// What a bot attacks: enemies in the campaign, every other living player in battle.
function AiTargets(view, me)
{
	if (view.mode == "campaign")
		return view.enemies;

	return view.players.filter(function(p) { return !p.dead && p.index != me.index; });
}

// Campaign: enemy tiles and their neighbours (touching an enemy hurts). null in battle.
function AiEnemyZone(view)
{
	if (view.mode != "campaign")
		return null;

	var zone = {};

	view.enemies.forEach(function(e)
	{
		zone[AiIndex(view, e.x, e.y)] = true;

		for (var d = 1; d <= 4; ++d)
			if (AiInside(view, e.x + AI_DIRS[d][0], e.y + AI_DIRS[d][1]))
				zone[AiIndex(view, e.x + AI_DIRS[d][0], e.y + AI_DIRS[d][1])] = true;
	});

	return zone;
}

// Cheapest reachable goal (steps + bonus): power-ups, keys, spots with a target in blast line, spots next to
// a soft wall. Goals on the bot's own tile only count when bombing there is fine (hereOk).
function AiChooseGoal(view, me, level, danger, opts, targets, hereOk)
{
	var goals = {};

	function add(x, y, kind, bonus, range)
	{
		if (!AiFloor(view, x, y))
			return;

		var i = AiIndex(view, x, y);

		if (danger[i] != Infinity)
			return;

		if (!goals[i] || goals[i].bonus > bonus)
			goals[i] = { kind: kind, bonus: bonus, range: range };
	}

	view.powerups.forEach(function(p)
	{
		if (level.PowerRange > 0 && !(level.AvoidBadLuck && p.type == 5))
			add(p.x, p.y, "item", -2, level.PowerRange);
	});

	if (view.mode == "campaign")
		view.keys.forEach(function(k) { add(k.x, k.y, "key", -2, 999); });

	if (me.bombs > 0)
	{
		targets.forEach(function(t)
		{
			AiBlastCells(view, { x: t.x, y: t.y, power: me.power, superBomb: me.superBomb }).forEach(function(c)
			{
				add(c.x, c.y, "hunt", level.HuntBonus, level.HuntRange);
			});
		});

		for (var y = 0; y < view.h; ++y)
			for (var x = 0; x < view.w; ++x)
				if (AiWall(view, x, y) == "1")
					for (var d = 1; d <= 4; ++d)
						add(x + AI_DIRS[d][0], y + AI_DIRS[d][1], "wall", level.WallBonus, 999);
	}

	var reach = AiReach(view, me, danger, opts);
	var best = -1, bestCost = Infinity;

	reach.order.forEach(function(i)
	{
		var g = goals[i];
		var s = reach.steps[i];

		if (!g || s > g.range)
			return;

		if (s == 0 && (g.kind == "item" || g.kind == "key" || !hereOk))
			return;

		if (s + g.bonus < bestCost)
		{
			bestCost = s + g.bonus;
			best = i;
		}
	});

	return best < 0 ? null : { kind: goals[best].kind, path: AiTrace(view, reach, best) };
}

// One planning step. me: { x, y, index, speed, power, bombs, superBomb }; level: an AI_LEVELS entry; rng: () -> [0, 1).
function AiDecide(view, me, level, rng)
{
	var danger = AiDangerMap(view);
	var here = AiIndex(view, me.x, me.y);
	var zone = AiEnemyZone(view);
	var opts = { step: AI_TILE_SECONDS / Math.max(0.25, me.speed || 1), margin: level.Margin, avoid: zone };
	var targets = AiTargets(view, me);
	var onBomb = view.bombs.some(function(b) { return b.x == me.x && b.y == me.y; });

	// 1. Out of the way of a blast (Easy sometimes notices a slow one late)
	var threatened = danger[here] != Infinity;

	if (threatened && danger[here] > 0.6 && rng() < level.SkipDanger)
		threatened = false;

	if (threatened)
	{
		var esc = AiEscape(view, me, danger, opts) || AiEscape(view, me, danger, { step: opts.step, margin: opts.margin, avoid: null });

		return { path: esc || [], bomb: false, reason: "flee" };
	}

	var hereOk = me.bombs > 0 && !onBomb && AiSafeAfterBomb(view, me, opts) &&
		!(view.mode == "campaign" && AiHitsTeammate(view, me, danger));

	// 2. A target in the blast line from here
	var line = AiCellSet(view, AiBlastCells(view, { x: me.x, y: me.y, power: me.power, superBomb: me.superBomb }));

	if (hereOk && targets.some(function(t) { return line[AiIndex(view, t.x, t.y)]; }))
		return { path: [], bomb: true, reason: "attack" };

	// 3. Campaign: do not hang around next to enemies
	if (zone && zone[here])
	{
		var away = AiEscape(view, me, danger, opts);

		if (away && away.length)
			return { path: away, bomb: false, reason: "evade" };
	}

	// 4. The cheapest goal (arrived at a hunt / wall spot: bomb)
	var goal = AiChooseGoal(view, me, level, danger, opts, targets, hereOk);

	if (goal)
		return { path: goal.path, bomb: goal.path.length == 0, reason: goal.kind };

	return { path: [], bomb: false, reason: "idle" };
}
```

Extend the export block with `AI_LEVELS: AI_LEVELS, AiDecide: AiDecide`.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/ai.test.js`
Expected: all PASS

---

### Task 3: Controller (steering, respawn, stuck) and the live view

**Files:**
- Modify: `Game/AiBrain.js` (append before the export block, extend exports)
- Modify: `index.html` (load `Game/AiBrain.js` after `Game/Players.js`)
- Test: `tests/ai.test.js` (append)

**Interfaces:**
- Consumes: `AiDecide`, `AI_LEVELS`.
- Produces: `AiSteer(x, y, tx, ty, tol) -> 0..4`, `AiSelf(player) -> me`, `AiBuildView(mode, roster) -> view` (browser only), `AiController(levelName, rng)` with `.Level` and `.Update(delta, player, env) -> {Dir, Bomb, BombPressed}`, where `env = { View: () -> view, BombCount: () -> int }`.

- [ ] **Step 1: Write the failing tests** (append)

```js
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/ai.test.js`
Expected: FAIL, `A.AiSteer is not a function`

- [ ] **Step 3: Implement** (append before the export block)

```js
// Direction from pixel position (x, y) towards (tx, ty): line up on the cross axis first, 0 when within `tol`.
function AiSteer(x, y, tx, ty, tol)
{
	var dx = tx - x, dy = ty - y;
	var adx = Math.abs(dx), ady = Math.abs(dy);

	if (adx <= tol && ady <= tol)
		return 0;

	if (adx >= ady)
	{
		if (ady > tol)
			return dy > 0 ? 3 : 1;

		return dx > 0 ? 2 : 4;
	}

	if (adx > tol)
		return dx > 0 ? 2 : 4;

	return dy > 0 ? 3 : 1;
}

// The planner's view of a Player entity (tiles are the player's size).
function AiSelf(player)
{
	return {
		x: Math.floor((player.X + player.Width / 2) / player.Width),
		y: Math.floor((player.Y + player.Height / 2) / player.Height),
		index: player.Index,
		speed: player.Speed || 1,
		power: (player.BadLuckFlags & 32) ? 1 : player.Power,
		bombs: (player.BadLuckFlags & 16) ? 0 : player.Bombs,
		superBomb: player.SuperBombsTime > 0
	};
}

// Tile view of the running game for AiDecide (browser only: reads GameWorld, GameEntityManager, PlayerManager).
function AiBuildView(mode, roster)
{
	var bw = GameWorld.BlockWidth, bh = GameWorld.BlockHeight;
	var v = { w: GameWorld.WorldWidth, h: GameWorld.WorldHeight, walls: GameWorld.Walls, bombs: [], fire: [], blocked: [],
		enemies: [], powerups: [], keys: [], players: [], keyFlags: PlayerManager.KeyFlags, mode: mode };

	function tile(e)
	{
		return { x: Math.floor((e.X + e.Width / 2) / bw), y: Math.floor((e.Y + e.Height / 2) / bh) };
	}

	GameEntityManager.Entities.forEach(function(e)
	{
		if (e.Health <= 0)
			return;

		var t = tile(e);

		switch (e.Type)
		{
			case "Bomb":
				t.power = e.ExplosionSize;
				t.time = Math.max(0, e.ExplosionTime);
				t.superBomb = !!e.IsSuperBomb;
				v.bombs.push(t);
				break;

			case "Explosion":
			case "Shot":
				v.fire.push(t);
				break;

			case "IceBlock":
			case "HotWall":
				v.blocked.push(t);
				break;

			case "Enemy": v.enemies.push(t); break;
			case "Key": v.keys.push(t); break;

			case "PowerUp":
				t.type = e.PowerUpType;
				v.powerups.push(t);
				break;
		}
	});

	PlayerManager.Players.forEach(function(p)
	{
		var t = tile(p);

		t.index = p.Index;
		t.dead = p.IsDead;
		t.bot = !!(roster[p.Index] && roster[p.Index].Bot);
		v.players.push(t);
	});

	return v;
}

// Drives one Player: plans every level.ThinkMs (and whenever a new bomb appears), then steers tile by tile.
// env: { View: () -> view, BombCount: () -> number of bombs in the world }
function AiController(levelName, rng)
{
	var level = AI_LEVELS[levelName] || AI_LEVELS.normal;
	var random = rng || Math.random;

	var owner = null, path = [], wantBomb = false;
	var thinkIn = 0, lastBombs = 0, deadFor = 0, stuckFor = 0, lastX = null, lastY = null;

	this.Level = levelName;

	this.Update = function(delta, player, env)
	{
		var act = { Dir: 0, Bomb: false, BombPressed: false };

		// A new level creates new Player entities: start over.
		if (player !== owner)
		{
			owner = player;
			path = [];
			wantBomb = false;
			thinkIn = deadFor = stuckFor = 0;
		}

		if (player.IsDead)
		{
			path = [];
			wantBomb = false;
			thinkIn = 0;
			deadFor += delta;

			if (player.Lifes > 0 && deadFor >= 1.0)
			{
				deadFor = 0;
				act.BombPressed = true;
			}

			return act;
		}

		deadFor = 0;

		var bombs = env.BombCount();

		thinkIn -= delta;

		if (thinkIn <= 0 || bombs > lastBombs)
		{
			var plan = AiDecide(env.View(), AiSelf(player), level, random);

			path = plan.path;
			wantBomb = plan.bomb;
			thinkIn = level.ThinkMs / 1000;
		}

		lastBombs = bombs;

		var tw = player.Width, th = player.Height;

		if (wantBomb)
		{
			// bombs land on the tile under the player's centre: line up on it, then press
			var me = AiSelf(player);

			act.Dir = AiSteer(player.X, player.Y, me.x * tw, me.y * th, 1);

			if (act.Dir == 0)
			{
				act.BombPressed = true;
				wantBomb = false;
				thinkIn = 0;
			}
		}
		else
		{
			while (path.length && AiSteer(player.X, player.Y, path[0].x * tw, path[0].y * th, 1) == 0)
				path.shift();

			if (path.length)
				act.Dir = AiSteer(player.X, player.Y, path[0].x * tw, path[0].y * th, 1);
		}

		// Holding a direction without moving (another player or a new bomb in the way): plan again.
		if (act.Dir && player.X === lastX && player.Y === lastY)
		{
			stuckFor += delta;

			if (stuckFor >= 0.3)
			{
				stuckFor = 0;
				path = [];
				thinkIn = 0;
			}
		}
		else
			stuckFor = 0;

		lastX = player.X;
		lastY = player.Y;

		return act;
	}
}
```

Extend the export block with `AiSteer: AiSteer, AiSelf: AiSelf, AiController: AiController`.

In `index.html`, after `<script src="Game/Players.js"></script>` add `<script src="Game/AiBrain.js"></script>`.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/*.test.js`
Expected: all PASS (including `page.test.js`, which checks the scripts index.html loads)

---

### Task 4: Game integration (bots play, human-only game over, CPU labels)

**Files:**
- Modify: `Game/Players.js` (add `HumanPlayers`, `PlayerLabel`, exports)
- Modify: `Game/PiNaBlaster.js` (`Bots`, `ApplyRoster`, `StartGame`, `GameTick`, `WantsPause`, `FinishRound`)
- Test: `tests/players.test.js` (append)

**Interfaces:**
- Consumes: `AiController`, `AiBuildView`.
- Produces: `HumanPlayers(players, roster) -> players`, `PlayerLabel(index, roster) -> "CPU n" | "Pn"`, `game.Bots[]`.

- [ ] **Step 1: Write the failing tests** (append to `tests/players.test.js`; extend its require with `HumanPlayers, PlayerLabel`)

```js
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/players.test.js`
Expected: FAIL, `HumanPlayers is not a function`

- [ ] **Step 3: Implement `Game/Players.js`** (after `AllOut`)

```js
// The players a person controls (everyone when the roster has only bots, so such a game can still end).
function HumanPlayers(players, roster)
{
	var humans = players.filter(function(p) { return !(roster[p.Index] && roster[p.Index].Bot); });

	return humans.length ? humans : players;
}

// "P1".. for people, "CPU 2".. for computer players
function PlayerLabel(index, roster)
{
	return (roster[index] && roster[index].Bot ? "CPU " : "P") + (index + 1);
}
```

Add `HumanPlayers: HumanPlayers, PlayerLabel: PlayerLabel` to its `module.exports`.

- [ ] **Step 4: Implement `Game/PiNaBlaster.js`**

Constructor, after `this.Roster = DefaultRoster(1);`:

```js
	// One AiController per bot slot (null for people)
	this.Bots = [];
```

`ApplyRoster` becomes:

```js
	this.ApplyRoster = function()
	{
		for (var i = 0; i < MAX_PLAYERS; ++i)
			Input.Unbind(i);

		for (var i = 0; i < this.Roster.length; ++i)
			if (!this.Roster[i].Bot)
				Input.Bind(i, this.Roster[i]);

		this.Bots = this.Roster.map(function(r) { return r.Bot ? new AiController(r.Bot) : null; });
	}
```

`StartGame`, right after `this.ApplyRoster();`:

```js
		// Local games label HUD cards P1..; with bots present they need names ("CPU 3"). LAN games bring their own.
		if (!Net.Role)
			this.PlayerNames = this.Bots.some(Boolean) ? roster.map(function(r, i) { return PlayerLabel(i, roster); }) : [];
```

`WantsPause` loop: replace the `Net` skip with

```js
			// Remote players and bots never open a menu on this machine.
			if (this.Roster[idx] && (this.Roster[idx].Net != null || this.Roster[idx].Bot))
				continue;
```

`GameTick` top of the player loop:

```js
		var game = this;
		var env =
		{
			View: function() { return AiBuildView(game.Mode, game.Roster); },
			BombCount: function() { return GameEntityManager.GetNumEntitiesByType("Bomb"); }
		};

		for (var i = 0; i < players.length; ++i)
		{
			var p = players[i];
			var bot = this.Bots[p.Index];
			var act = bot ? bot.Update(delta, p, env) : Input.Player(p.Index);

			// In a LAN game the simulation keeps running under menus: keep this machine's players still.
			if (!bot && Net.Role && Screens.Current() && this.Roster[p.Index] && this.Roster[p.Index].Net == null)
				act = { Dir: 0, Bomb: false, BombPressed: false };
```

Campaign game over: `if (AllOut(HumanPlayers(players, this.Roster)))`.

`FinishRound` labels:

```js
		var roster = this.Roster;
		var score = this.Battle.Wins.map(function(w, i) { return PlayerLabel(i, roster) + ": " + w; }).join("    ");
```

and the titles `PlayerLabel(matchWinner, roster) + " WINS THE MATCH!"` and `PlayerLabel(winner, roster) + " WINS THE ROUND"`.

- [ ] **Step 5: Run the tests**

Run: `node --test tests/*.test.js`
Expected: all PASS

---

### Task 5: Local lobby bot controls

**Files:**
- Modify: `Game/Lobby.js`
- Test: `tests/lobby.test.js` (append)

**Interfaces:**
- Produces: `IsBotId(id)`, `NextBotLevel(level, delta) -> level | null`, `LobbyRows(count, max)`, `LobbyAdjust(joined, row, delta, max) -> joined`, `BotLabel(level) -> "AI - Normal"`. `RosterFromSources(["ai:hard"])` -> `[{ Bot: "hard" }]`, `SourceLabel("ai:hard")` -> `"AI - Hard"`.

- [ ] **Step 1: Write the failing tests** (append; extend the require)

```js
test('bot ids map to bot roster entries and labels', () => {
  assert.deepStrictEqual(RosterFromSources(['kb0', 'ai:hard']), [{ Keyboard: 0, Pad: null }, { Bot: 'hard' }]);
  assert.strictEqual(SourceLabel('ai:easy'), 'AI - Easy');
  assert.strictEqual(IsBotId('ai:normal'), true);
  assert.strictEqual(IsBotId('kb0'), false);
});

test('NextBotLevel cycles easy-normal-hard; left of easy removes the bot', () => {
  assert.strictEqual(NextBotLevel('normal', 1), 'hard');
  assert.strictEqual(NextBotLevel('hard', 1), 'hard');
  assert.strictEqual(NextBotLevel('normal', -1), 'easy');
  assert.strictEqual(NextBotLevel('easy', -1), null);
});

test('LobbyRows: the taken seats plus the first free one', () => {
  assert.strictEqual(LobbyRows(0, 6), 1);
  assert.strictEqual(LobbyRows(3, 6), 4);
  assert.strictEqual(LobbyRows(6, 6), 6);
});

test('LobbyAdjust adds, changes and removes bots, never touches people', () => {
  assert.deepStrictEqual(LobbyAdjust(['kb0'], 1, 1, 6), ['kb0', 'ai:normal']);
  assert.deepStrictEqual(LobbyAdjust(['kb0', 'ai:normal'], 1, 1, 6), ['kb0', 'ai:hard']);
  assert.deepStrictEqual(LobbyAdjust(['kb0', 'ai:easy', 'pad0'], 1, -1, 6), ['kb0', 'pad0']);
  assert.deepStrictEqual(LobbyAdjust(['kb0'], 0, 1, 6), ['kb0']);
  assert.deepStrictEqual(LobbyAdjust(['a', 'b'], 2, 1, 2), ['a', 'b']);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/lobby.test.js`
Expected: FAIL, `IsBotId is not a function`

- [ ] **Step 3: Implement the helpers** (top of `Game/Lobby.js`)

```js
var BOT_LEVELS = ["easy", "normal", "hard"];

function IsBotId(id)
{
	return id.indexOf("ai:") == 0;
}

function BotLabel(level)
{
	return "AI - " + level.charAt(0).toUpperCase() + level.substr(1);
}

// The bot level after Left (-1) / Right (+1); null = remove the bot.
function NextBotLevel(level, delta)
{
	var i = BOT_LEVELS.indexOf(level) + delta;

	return i < 0 ? null : BOT_LEVELS[Math.min(i, BOT_LEVELS.length - 1)];
}

// Rows the lobby cursor can visit: every taken seat plus the first free one.
function LobbyRows(count, max)
{
	return Math.min(count + 1, max);
}

// Left / Right on cursor row `row`: the free row adds a Normal bot, a bot row changes level (or removes the bot).
function LobbyAdjust(joined, row, delta, max)
{
	var list = joined.slice();

	if (row == list.length)
	{
		if (list.length < max)
			list.push("ai:normal");

		return list;
	}

	if (!list[row] || !IsBotId(list[row]))
		return list;

	var next = NextBotLevel(list[row].substr(3), delta);

	if (next)
		list[row] = "ai:" + next;
	else
		list.splice(row, 1);

	return list;
}
```

In `RosterFromSources`, first line of the map callback: `if (IsBotId(id)) return { Bot: id.substr(3) };`
In `SourceLabel`, first line: `if (IsBotId(id)) return BotLabel(id.substr(3));`
Export `IsBotId, BotLabel, NextBotLevel, LobbyRows, LobbyAdjust` as well.

- [ ] **Step 4: Implement the screen** (`LobbyScreen`)

State: `var cursor = 0;`

`Update` (start of the function, replacing the `joined = joined.filter(...)` line):

```js
		joined = joined.filter(function(id) { return live[id] || IsBotId(id); });

		// The cursor (any local device) manages bots: Up / Down pick a row, Left / Right add / change / remove.
		if (m.Up)
			cursor = Math.max(0, cursor - 1);
		else if (m.Down)
			cursor = Math.min(LobbyRows(joined.length, MAX_PLAYERS) - 1, cursor + 1);
		else if (m.Left || m.Right)
			joined = LobbyAdjust(joined, cursor, m.Right ? 1 : -1, MAX_PLAYERS);

		cursor = Math.min(cursor, LobbyRows(joined.length, MAX_PLAYERS) - 1);
```

`Draw`, per row: when `i == cursor` draw a yellow frame first (`ctx.fillStyle = "#FFD040"; ctx.fillRect(cx - 152, y - 15, 304, 31);`). Bot rows show `i == cursor ? "<  " + label + "  >" : label` as the label text. The free cursor row says `"Press Fire to join   < > add a CPU player"`; other free rows keep `"Press Fire to join"`. Hint line: `"Fire join   Arrows: CPU players   Start begin   Esc back"`.

- [ ] **Step 5: Run the tests**

Run: `node --test tests/*.test.js`
Expected: all PASS

---

### Task 6: Server: host-only `bot` / `unbot`

**Files:**
- Modify: `lan/rooms.py`
- Test: `server_tests/test_rooms.py` (append to `RoomsTest`)

- [ ] **Step 1: Write the failing tests**

```python
    def test_host_adds_changes_and_removes_bots(self):
        self.h.send(self.host, {"t": "bot", "slot": 2, "level": "easy"})
        s = self.h.last(self.guest, "room")["room"]["slots"][2]
        self.assertEqual((s["bot"], s["src"], s["name"], s["label"], s["client"]), ("easy", "ai", "CPU", "AI - Easy", self.host))
        self.h.send(self.host, {"t": "bot", "slot": 2, "level": "hard"})
        self.assertEqual(self.h.last(self.host, "room")["room"]["slots"][2]["bot"], "hard")
        self.h.send(self.host, {"t": "unbot", "slot": 2})
        self.assertIsNone(self.h.last(self.host, "room")["room"]["slots"][2])

    def test_bot_rules(self):
        self.h.send(self.guest, {"t": "bot", "slot": 0, "level": "easy"})
        self.assertEqual(self.h.last(self.guest, "err")["msg"], "host only")
        for bad in [{"slot": 0, "level": "godlike"}, {"slot": 0, "level": ["x"]}, {"slot": 9, "level": "easy"}, {"slot": "0", "level": "easy"}]:
            self.h.send(self.host, dict(bad, t="bot"))
            self.assertEqual(self.h.types(self.host)[-1], "err")
        self.h.send(self.guest, {"t": "claim", "src": "kb0", "label": "Keyboard"})
        self.h.send(self.host, {"t": "bot", "slot": 0, "level": "easy"})
        self.assertEqual(self.h.last(self.host, "err")["msg"], "seat is taken")
        self.h.send(self.host, {"t": "unbot", "slot": 0})
        self.assertEqual(self.h.last(self.host, "err")["msg"], "not a bot")

    def test_bots_cannot_be_released_and_count_as_players(self):
        self.h.send(self.host, {"t": "mode", "mode": "battle"})
        self.h.send(self.host, {"t": "claim", "src": "kb0", "label": "Keyboard"})
        self.h.send(self.host, {"t": "bot", "slot": 1, "level": "normal"})
        self.h.send(self.host, {"t": "release", "slot": 1})
        self.assertEqual(self.h.last(self.host, "err")["msg"], "not your slot")
        self.h.send(self.host, {"t": "start"})
        start = self.h.last(self.guest, "start")
        self.assertEqual(start["slots"][1]["bot"], "normal")

    def test_no_bot_changes_while_playing(self):
        self.h.send(self.host, {"t": "claim", "src": "kb0", "label": "Keyboard"})
        self.h.send(self.host, {"t": "start"})
        self.h.send(self.host, {"t": "bot", "slot": 1, "level": "easy"})
        self.assertEqual(self.h.last(self.host, "err")["msg"], "game already running")
```

- [ ] **Step 2: Run them to see them fail**

Run: `python -m unittest server_tests.test_rooms -v`
Expected: the four new tests FAIL (`unknown message`)

- [ ] **Step 3: Implement** (`lan/rooms.py`)

Constant: `BOT_LEVELS = {"easy": "Easy", "normal": "Normal", "hard": "Hard"}`

Methods (after `_on_release`):

```python
    def _host_slot(self, cid, msg):
        """(room, slot, error_output) for host-only slot commands in the lobby."""
        room, err = self._lobby_room(cid)

        if err:
            return None, None, err

        if room["host"] != cid:
            return None, None, self._err(cid, "host only")

        slot = msg.get("slot")

        if not isinstance(slot, int) or not 0 <= slot < MAX_SLOTS:
            return None, None, self._err(cid, "bad slot")

        return room, slot, None

    def _on_bot(self, cid, msg, text):
        room, slot, err = self._host_slot(cid, msg)

        if err:
            return err

        level = msg.get("level")

        if not isinstance(level, str) or level not in BOT_LEVELS:
            return self._err(cid, "bad level")

        s = room["slots"][slot]

        if s is not None and not s.get("bot"):
            return self._err(cid, "seat is taken")

        room["slots"][slot] = {"client": cid, "name": "CPU", "src": "ai", "label": "AI - " + BOT_LEVELS[level], "bot": level}
        return self._broadcast_room(room)

    def _on_unbot(self, cid, msg, text):
        room, slot, err = self._host_slot(cid, msg)

        if err:
            return err

        s = room["slots"][slot]

        if s is None or not s.get("bot"):
            return self._err(cid, "not a bot")

        room["slots"][slot] = None
        return self._broadcast_room(room)
```

`_on_release`: `if s is None or s["client"] != cid or s.get("bot"):` -> `not your slot`.

- [ ] **Step 4: Run the tests**

Run: `python -m unittest discover -s server_tests`
Expected: all PASS

---

### Task 7: LAN client (room cursor, bots in host games)

**Files:**
- Modify: `Game/Lan.js` (`RoomAdjust`, `ClaimedSources`, `RoomScreen`)
- Modify: `Game/NetGame.js` (`StartNetHost`)
- Test: `tests/lan.test.js` (append)

**Interfaces:**
- Consumes: `NextBotLevel` (Lobby.js, global in the browser; the tests set it on `global`).
- Produces: `RoomAdjust(room, row, delta) -> message | null` (row 0 = mode, row n = slot n-1).

- [ ] **Step 1: Write the failing tests** (append)

```js
global.NextBotLevel = require('../Game/Lobby.js').NextBotLevel;

test('RoomAdjust: mode row, free seat, bot seat, human seat', () => {
  const r = room('campaign', [slot(7, 'kb0'), null, { client: 7, name: 'CPU', src: 'ai', label: 'AI - Easy', bot: 'easy' }]);
  assert.deepStrictEqual(L.RoomAdjust(r, 0, 1), { t: 'mode', mode: 'battle' });
  assert.deepStrictEqual(L.RoomAdjust(r, 2, -1), { t: 'bot', slot: 1, level: 'normal' });
  assert.deepStrictEqual(L.RoomAdjust(r, 3, 1), { t: 'bot', slot: 2, level: 'normal' });
  assert.deepStrictEqual(L.RoomAdjust(r, 3, -1), { t: 'unbot', slot: 2 });
  assert.strictEqual(L.RoomAdjust(r, 1, 1), null);
});

test('ClaimedSources ignores bot seats', () => {
  const r = room('campaign', [slot(7, 'kb0'), { client: 7, name: 'CPU', src: 'ai', label: 'AI - Easy', bot: 'easy' }]);
  assert.deepStrictEqual(L.ClaimedSources(r, 7), { kb0: 0 });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/lan.test.js`
Expected: FAIL, `L.RoomAdjust is not a function`

- [ ] **Step 3: Implement the helpers** (`Game/Lan.js`)

`ClaimedSources` condition: `if (room.slots[i] && room.slots[i].client == myId && !room.slots[i].bot)`.

```js
// Host, room lobby: what Left / Right on cursor row `row` asks the server (row 0 = mode, row n = slot n - 1).
function RoomAdjust(room, row, delta)
{
	if (row == 0)
		return { t: "mode", mode: NextMode(room.mode) };

	var slot = row - 1;
	var s = room.slots[slot];

	if (!s)
		return { t: "bot", slot: slot, level: "normal" };

	if (!s.bot)
		return null;

	var next = NextBotLevel(s.bot, delta);

	return next ? { t: "bot", slot: slot, level: next } : { t: "unbot", slot: slot };
}
```

Export `RoomAdjust`.

- [ ] **Step 4: Implement `RoomScreen`**

State: `var cursor = 0;`. In `Update`, replace the `if (isHost && (m.Left || m.Right)) ...` line:

```js
		if (isHost)
		{
			if (m.Up)
				cursor = Math.max(0, cursor - 1);
			else if (m.Down)
				cursor = Math.min(room.slots.length, cursor + 1);
			else if (m.Left || m.Right)
			{
				var cmd = RoomAdjust(room, cursor, m.Right ? 1 : -1);

				if (cmd)
					Net.Send(cmd);
			}
		}
```

In `Draw`: for the host, draw a yellow frame around the cursor row (row 0 = the mode line at y 56: `ctx.fillRect(cx - 80, 46, 160, 21)` drawn before the text as an outline; seat rows as in the local lobby). Bot seats show `s.label` as the name with `<  >` around it on the cursor row. A free seat on the cursor row says `"Press Fire to join   < > add a CPU player"`. The host hint becomes `"Fire join   Arrows: mode / CPU players   Esc leave"`.

- [ ] **Step 5: Implement `StartNetHost`** (`Game/NetGame.js`), the roster loop:

```js
		for (var n = 0; n < occupied.length; ++n)
		{
			var slot = occupied[n];
			var s = msg.slots[slot];

			if (s.bot)
			{
				roster.push({ Bot: s.bot });
				names.push("CPU " + (n + 1));
				continue;
			}

			if (s.client == Net.MyId)
				roster.push(RosterFromSources([s.src])[0]);
			else
			{
				roster.push({ Keyboard: null, Pad: null, Net: slot });
				remote[slot] = new RemoteInput(600, function() { return performance.now(); });
				Input.Virtuals["net" + slot] = remote[slot];
			}

			names.push(s.name);
		}
```

`StartNetGuest` needs no change: bot slots belong to the host's client id.

- [ ] **Step 6: Run the tests**

Run: `node --test tests/*.test.js` and `python -m unittest discover -s server_tests`
Expected: all PASS

---

### Task 8: Docs and browser verification

**Files:**
- Modify: `README.md` (Controls / Modes / LAN sections)

- [ ] **Step 1: README.** Under the lobby paragraph: "CPU players: in the lobby move the highlight with Up / Down and press Left / Right on the free row to add a computer player. On a CPU row, Left / Right switches Easy / Normal / Hard; Left on Easy removes it. In a LAN room only the host can add CPU players. CPU players help in Campaign (they never bomb a teammate, and the game is over once every human is out) and fight everyone in Battle."
- [ ] **Step 2: Local battle.** `preview_start pinablaster`, then Battle -> join with keyboard -> add 3 CPU (Easy / Normal / Hard) -> Start. Watch: bots move, bomb walls, flee their own bombs, and a round ends. No console errors.
- [ ] **Step 3: Local campaign.** 1 human + 2 CPU: bots hunt enemies without hitting the human. Game over appears when the human is out even if bots are alive.
- [ ] **Step 4: LAN.** Host tab: Host a game, add a CPU, switch mode on row 0. Guest tab: join and see the CPU row. Start: the guest sees the CPU playing.
