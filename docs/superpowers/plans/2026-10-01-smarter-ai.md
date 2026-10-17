# Smarter AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bots that model drains, magic carpets, ice blocks, frozen bombs, lasers and shots, and use drains / carpets / kicks / traps (see `docs/superpowers/specs/2026-10-01-smarter-ai-design.md`).

**Architecture:** New pure `Game/AiWorld.js` (grid helpers + blast forecast with bomb tracks). `Game/AiBrain.js` keeps planning and browser glue, rebuilt on the forecast. One line in `Game/Enemy.js` exposes the laser direction.

**Tech Stack:** Browser JS globals with `module.exports` guards, `node --test`.

## Global Constraints

- Tabs, Allman braces, `var`, like the existing files. No dependencies.
- Measured: carpets carry bombs at `AI_CARPET_SECONDS = 0.08` per tile; kicked bombs and shots `AI_TILE_SECONDS = 0.17`.
- Levels: Easy has no new tactics; Normal `Remote`, `Traps`, `AvoidSight`; Hard all of these plus `Kicks`.
- Tests: `node --test tests/*.test.js`, `python -m unittest discover -s server_tests`.
- Not a git repository: no commits.

---

### Task 1: `Game/AiWorld.js` - world helpers and the forecast

**Files:** Create `Game/AiWorld.js`, `tests/aiworld.test.js`.

**Interfaces (produced):** `AI_TILE_SECONDS, AI_CARPET_SECONDS, AI_BOMB_SECONDS, AI_FIRE_SECONDS, AI_DIRS, AiInside, AiWall, AiIndex, AiFloor, AiObstacles, AiCellSet, AiCopy, AiLine, AiBlastCells, AiBombTrack, AiTrackAt, AiForecast, AiDangerMap`. `AiForecast(view) -> { danger: number[], bombs: [{x, y, t}] }` (detonation tile and time per `view.bombs` entry).

- [ ] **Step 1: failing tests** (`tests/aiworld.test.js`)

```js
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
  assert.strictEqual(at(v, d, 6, 3), 1);
  assert.strictEqual(at(v, d, 5, 3), Infinity);
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
```

- [ ] **Step 2:** `node --test tests/aiworld.test.js` -> FAIL (module missing).

- [ ] **Step 3: implement** (`Game/AiWorld.js`)

```js
// What computer players know about the world: a tile "view" of it (built by AiBuildView in AiBrain.js) and the
// blast forecast - when each tile will burn, following bombs that ride magic carpets or slide after a kick,
// drains passing blasts on, frozen bombs in ice, chain reactions, enemy lasers and fire shots.
// Pure: no DOM, no game globals.

var AI_TILE_SECONDS = 0.17;     // one tile at speed 1 (17 px, one pixel per 10 ms step): players, kicked bombs, shots
var AI_CARPET_SECONDS = 0.08;   // magic carpets carry a bomb across a tile about twice as fast (measured)
var AI_BOMB_SECONDS = 2.0;      // Bomb.ExplosionTime
var AI_FIRE_SECONDS = 0.3;      // how long a blast keeps burning a tile

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

// Tiles taken by something solid: bombs, ice blocks and other obstacles (`blocked`): index -> true
function AiObstacles(view)
{
	var map = {};

	view.bombs.concat(view.blocked, view.ice || []).forEach(function(b) { map[AiIndex(view, b.x, b.y)] = true; });

	return map;
}

function AiCellSet(view, cells)
{
	var set = {};

	cells.forEach(function(c) { set[AiIndex(view, c.x, c.y)] = true; });

	return set;
}

function AiCopy(view)
{
	var v = {};

	for (var k in view)
		v[k] = view[k];

	return v;
}

// One line of fire from (x, y) towards d, appended to `cells`: up to `len` tiles, stopping before hard walls and
// on soft walls ("1") unless `through`.
function AiLine(view, x, y, d, len, through, cells)
{
	for (var i = 1; i <= len; ++i)
	{
		var cx = x + AI_DIRS[d][0] * i, cy = y + AI_DIRS[d][1] * i;
		var ch = AiWall(view, cx, cy);

		if (ch != " " && ch != "1")
			break;

		cells.push({ x: cx, y: cy });

		if (ch == "1" && !through)
			break;
	}

	return cells;
}

// Tiles a bomb burns, like CreateExplosionLine: `power` tiles each way (super bombs burn through soft walls).
function AiBlastCells(view, bomb)
{
	var cells = [{ x: bomb.x, y: bomb.y }];

	for (var d = 1; d <= 4; ++d)
		AiLine(view, bomb.x, bomb.y, d, bomb.power, bomb.superBomb, cells);

	return cells;
}

// Where a bomb (or a shot) will be over time: [{ x, y, t }]. Magic carpets (`carpets`: index -> direction) carry it;
// otherwise it slides on in `bomb.dir` (after a kick). Floor only, and never into `stops` (solid things).
function AiBombTrack(view, bomb, stops, carpets)
{
	var x = bomb.x, y = bomb.y, t = 0, slide = bomb.dir || 0;
	var start = AiIndex(view, x, y);
	var track = [{ x: x, y: y, t: 0 }];

	for (var n = 0; n < 64 && t < bomb.time; ++n)
	{
		var carpet = carpets[AiIndex(view, x, y)];
		var d = carpet || slide;

		if (!d)
			break;

		var nx = x + AI_DIRS[d][0], ny = y + AI_DIRS[d][1];
		var ni = AiIndex(view, nx, ny);

		if (AiWall(view, nx, ny) != " " || (stops[ni] && ni != start))
			break;

		// a carpet stops a kick: the bomb rests where the carpet leaves it
		if (carpet)
			slide = 0;

		x = nx;
		y = ny;
		t += carpet ? AI_CARPET_SECONDS : AI_TILE_SECONDS;
		track.push({ x: x, y: y, t: t });
	}

	return track;
}

function AiTrackAt(track, t)
{
	var p = track[0];

	for (var i = 1; i < track.length && track[i].t <= t; ++i)
		p = track[i];

	return p;
}

// When each tile will burn: { danger: [seconds from now, by tile index; Infinity = never],
// bombs: [{ x, y, t }] where and when each of view.bombs goes off }.
// Events fire earliest first; a blast sets off every bomb (where its track has taken it) and frozen bomb it reaches.
function AiForecast(view)
{
	var danger = [], i;

	for (i = 0; i < view.w * view.h; ++i)
		danger.push(Infinity);

	var stops = AiObstacles(view);
	var carpets = {};
	var drains = view.drains || [];
	var events = [];

	(view.carpets || []).forEach(function(c) { carpets[AiIndex(view, c.x, c.y)] = c.dir; });

	view.bombs.forEach(function(b)
	{
		var track = AiBombTrack(view, b, stops, carpets);

		events.push(
		{
			t: b.time, bomb: true,
			at: function(t) { return AiTrackAt(track, t); },
			cells: function(t)
			{
				var p = AiTrackAt(track, t);
				var cells = AiBlastCells(view, { x: p.x, y: p.y, power: b.power, superBomb: b.superBomb });

				// a bomb going off on a drain also blasts out of every other drain
				if (drains.some(function(d) { return d.x == p.x && d.y == p.y; }))
				{
					drains.forEach(function(d)
					{
						if (d.x != p.x || d.y != p.y)
							cells = cells.concat(AiBlastCells(view, { x: d.x, y: d.y, power: b.superBomb ? b.power : 1, superBomb: b.superBomb }));
					});
				}

				return cells;
			}
		});
	});

	(view.ice || []).forEach(function(c)
	{
		if (c.frozen)
			events.push({ t: Infinity, at: function() { return c; }, cells: function() { return AiBlastCells(view, { x: c.x, y: c.y, power: 1 }); } });
	});

	view.fire.forEach(function(f)
	{
		events.push({ t: 0, cells: function() { return [f]; } });
	});

	(view.lasers || []).forEach(function(l)
	{
		events.push({ t: l.time, cells: function() { return AiLine(view, l.x, l.y, l.dir, view.w + view.h, false, []); } });
	});

	(view.shots || []).forEach(function(s)
	{
		var track = AiBombTrack(view, { x: s.x, y: s.y, dir: s.dir, time: Infinity }, stops, {});
		var end = track[track.length - 1];

		events.push({ t: end.t, cells: function() { return AiBlastCells(view, { x: end.x, y: end.y, power: 1 }); } });
	});

	for (;;)
	{
		var next = null;

		events.forEach(function(e)
		{
			if (!e.done && e.t != Infinity && (!next || e.t < next.t))
				next = e;
		});

		if (!next)
			break;

		next.done = true;

		var cells = next.cells(next.t);
		var hit = AiCellSet(view, cells);

		cells.forEach(function(c)
		{
			if (AiInside(view, c.x, c.y) && next.t < danger[AiIndex(view, c.x, c.y)])
				danger[AiIndex(view, c.x, c.y)] = next.t;
		});

		events.forEach(function(e)
		{
			if (!e.done && e.at && e.t > next.t)
			{
				var p = e.at(next.t);

				if (hit[AiIndex(view, p.x, p.y)])
					e.t = next.t;
			}
		});
	}

	return {
		danger: danger,
		bombs: events.filter(function(e) { return e.bomb; }).map(function(e) { var p = e.at(e.t); return { x: p.x, y: p.y, t: e.t }; })
	};
}

// Seconds until each tile burns (Infinity = never).
function AiDangerMap(view)
{
	return AiForecast(view).danger;
}

if (typeof module !== 'undefined')
	module.exports = {
		AI_TILE_SECONDS: AI_TILE_SECONDS, AI_CARPET_SECONDS: AI_CARPET_SECONDS, AI_BOMB_SECONDS: AI_BOMB_SECONDS,
		AI_FIRE_SECONDS: AI_FIRE_SECONDS, AI_DIRS: AI_DIRS,
		AiInside: AiInside, AiWall: AiWall, AiIndex: AiIndex, AiFloor: AiFloor, AiObstacles: AiObstacles, AiCellSet: AiCellSet,
		AiCopy: AiCopy, AiLine: AiLine, AiBlastCells: AiBlastCells, AiBombTrack: AiBombTrack, AiTrackAt: AiTrackAt,
		AiForecast: AiForecast, AiDangerMap: AiDangerMap
	};
```

- [ ] **Step 4:** `node --test tests/aiworld.test.js` -> PASS.

---

### Task 2: `Game/AiBrain.js` on the forecast (ice pushing, bomb effects, remote goals, kicks, traps, line of fire)

**Files:** Rewrite `Game/AiBrain.js`; modify `index.html` (load `Game/AiWorld.js` before `Game/AiBrain.js`), `tests/page.test.js` (order), `Game/Enemy.js` (`this.ShoopDir = dir;`). Test: append to `tests/ai.test.js`.

**Interfaces:** consumes all of Task 1. Produces (unchanged names keep working) `AI_LEVELS` (+ `Remote, Traps, Kicks, AvoidSight`), `AiReach, AiFindPath, AiEscape, AiSafeAfterBomb, AiHitsTeammate, AiBombEffect, AiDecide -> { path, bomb, kick?, reason }`, `AiSteer, AiSelf (+ kick), AiBuildView, AiController`.

- [ ] **Step 1: failing tests** (append to `tests/ai.test.js`)

```js
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
  assert.strictEqual(A.AiDecide(v(1), me, A.AI_LEVELS.easy, never).reason, 'idle');
});

test('AiDecide: Hard kicks a threatening bomb into an opponent, Normal runs', () => {
  const v = () => view(ARENA, { players: [{ x: 1, y: 1, index: 0 }, { x: 6, y: 1, index: 1 }], bombs: [{ x: 2, y: 1, power: 1, time: 1.8, pushable: true }] });
  const me = Object.assign({}, ME, { kick: true, bombs: 0 });
  const hard = A.AiDecide(v(), me, A.AI_LEVELS.hard, never);
  assert.deepStrictEqual([hard.reason, hard.kick], ['kick', 2]);
  assert.strictEqual(A.AiDecide(v(), me, A.AI_LEVELS.normal, never).reason, 'flee');
});

test('AiDecide: Hard walks behind a bomb to kick it at an opponent', () => {
  // bomb at (3,1), opponent at (7,1): stand at (2,1) and kick right
  const v = view(ARENA, { players: [{ x: 1, y: 3, index: 0 }, { x: 7, y: 1, index: 1 }], bombs: [{ x: 3, y: 1, power: 1, time: 1.9, pushable: true }] });
  const plan = A.AiDecide(v, Object.assign({}, ME, { x: 1, y: 3, kick: true, bombs: 0 }), A.AI_LEVELS.hard, never);
  assert.strictEqual(plan.reason, 'kick');
  assert.deepStrictEqual(plan.path[plan.path.length - 1], { x: 2, y: 1 });
});

test('AiDecide: Normal sets a trap in battle, Easy does not', () => {
  // the opponent at (1,1) stands on its own bomb; its only way out passes (3,1), which our bomb at (3,2) burns
  const rows = ['0000000', '0   000', '000   0', '000 000', '0000000'];
  const v = () => view(rows, { players: [{ x: 3, y: 2, index: 0 }, { x: 1, y: 1, index: 1 }], bombs: [{ x: 1, y: 1, power: 1, time: 1.0 }] });
  const me = Object.assign({}, ME, { x: 3, y: 2, power: 1 });
  const plan = A.AiDecide(v(), me, A.AI_LEVELS.normal, never);
  assert.deepStrictEqual([plan.reason, plan.bomb], ['trap', true]);
  assert.strictEqual(A.AiDecide(v(), me, A.AI_LEVELS.easy, never).bomb, false);
});

test('AiDecide: Normal will not wait in the line of a fire-spitter, Easy will', () => {
  const rows = ['000000000', '0      10', '000000 00', '000000 00', '000000 00', '000000000'];
  const v = () => view(rows, { mode: 'campaign', players: [{ x: 1, y: 1, index: 0 }], enemies: [{ x: 6, y: 4, type: 4 }] });
  assert.strictEqual(A.AiDecide(v(), ME, A.AI_LEVELS.normal, never).reason, 'idle');
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
```

- [ ] **Step 2:** `node --test tests/ai.test.js` -> the new tests FAIL.

- [ ] **Step 3: implement** - `Game/AiBrain.js` becomes:

```js
// Computer players (CPU). AiDecide plans on the tile view and blast forecast of AiWorld.js; AiController turns
// its plans into the actions Input.Player() returns. AiBuildView builds the view from the running game.

// Node (tests): the world model lives in AiWorld.js (index.html loads it first in the browser)
if (typeof module !== 'undefined')
	Object.assign(global, require('./AiWorld.js'));

var AI_LEVELS =
{
	easy:   { Name: "Easy",   ThinkMs: 400, Margin: 0.35, SkipDanger: 0.2, HuntRange: 4,   HuntBonus: 2, WallBonus: 0, PowerRange: 0,   AvoidBadLuck: false,
	          Remote: false, Traps: false, Kicks: false, AvoidSight: false },
	normal: { Name: "Normal", ThinkMs: 150, Margin: 0.25, SkipDanger: 0,   HuntRange: 8,   HuntBonus: 2, WallBonus: 6, PowerRange: 5,   AvoidBadLuck: true,
	          Remote: true,  Traps: true,  Kicks: false, AvoidSight: true },
	hard:   { Name: "Hard",   ThinkMs: 50,  Margin: 0.15, SkipDanger: 0,   HuntRange: 999, HuntBonus: 0, WallBonus: 8, PowerRange: 999, AvoidBadLuck: true,
	          Remote: true,  Traps: true,  Kicks: true,  AvoidSight: true }
};

// Breadth-first search over standable tiles. A tile can be crossed when the bot is out of it `margin` seconds
// before it burns, or after the blast is over (opts.safeOnly: only tiles no blast touches). `avoid` tiles are
// reached but not walked through. An ice block can be walked into when the tile behind it is free: it slides on.
function AiReach(view, from, danger, opts)
{
	var obstacles = AiObstacles(view);
	var ice = AiCellSet(view, view.ice || []);
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

			if (steps[ni] !== undefined)
				continue;

			if (obstacles[ni])
			{
				var bx = nx + AI_DIRS[d][0], by = ny + AI_DIRS[d][1];

				if (!ice[ni] || AiWall(view, bx, by) != " " || obstacles[AiIndex(view, bx, by)])
					continue;
			}

			var s = steps[cur] + 1;
			var burn = danger[ni];

			if (burn != Infinity && opts.safeOnly)
				continue;

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

// Path to the nearest tile no blast will touch and not in `shun` (default: opts.avoid, the tiles next to enemies).
function AiEscape(view, from, danger, opts, shun)
{
	shun = shun || opts.avoid;

	return AiFindPath(view, from, function(x, y)
	{
		var i = AiIndex(view, x, y);

		return danger[i] == Infinity && !(shun && shun[i]);
	}, danger, opts);
}

// The view as one player sees it: everybody else (and every enemy) is solid, a mover between two tiles blocks both
// (`cover`). Careful bots also never walk over a bad-luck power-up (it makes a player drop bombs by itself).
function AiSolidView(view, selfIndex, avoidCurses)
{
	var extra = [];

	view.players.filter(function(p) { return !p.dead && p.index != selfIndex; }).concat(view.enemies).forEach(function(e)
	{
		extra = extra.concat(e.cover || [e]);
	});

	if (avoidCurses)
		extra = extra.concat(view.powerups.filter(function(p) { return p.type == 5; }));

	var v = AiCopy(view);

	v.blocked = view.blocked.concat(extra);

	return v;
}

function AiWithBomb(view, at, me)
{
	var v = AiCopy(view);

	v.bombs = view.bombs.concat([{ x: at.x, y: at.y, power: me.power, time: AI_BOMB_SECONDS, superBomb: !!me.superBomb, dir: 0, pushable: !!me.kick }]);

	return v;
}

// Tiles that burn sooner in `after` than in `danger`: index -> true
function AiSooner(after, danger)
{
	var sooner = {};

	for (var i = 0; i < after.length; ++i)
		if (after[i] < danger[i])
			sooner[i] = true;

	return sooner;
}

// What dropping a bomb at `at` would do (straight, through chains, drains, on carpets): { view, after, sooner, safe }
// - `safe`: whoever stands at `at` still gets away.
function AiBombEffect(view, me, at, danger, opts)
{
	var v = AiWithBomb(view, at, me);
	var after = AiDangerMap(v);

	return {
		view: v, after: after, sooner: AiSooner(after, danger),
		safe: AiEscape(v, at, after, { step: opts.step, margin: opts.margin, avoid: null }) !== null
	};
}

// Is there still a way to safety after dropping a bomb where the bot stands?
function AiSafeAfterBomb(view, me, opts)
{
	return AiBombEffect(view, me, me, AiDangerMap(view), opts).safe;
}

function AiHurtsTeammate(view, me, sooner)
{
	return view.players.some(function(p) { return !p.dead && p.index != me.index && sooner[AiIndex(view, p.x, p.y)]; });
}

// Would a bomb here burn (directly or through a chain) a living teammate's tile sooner than before?
function AiHitsTeammate(view, me, danger)
{
	return AiHurtsTeammate(view, me, AiSooner(AiDangerMap(AiWithBomb(view, me, me)), danger));
}

function AiHitsAny(view, list, sooner)
{
	return list.some(function(t) { return sooner[AiIndex(view, t.x, t.y)]; });
}

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

// Campaign: tiles in the line of fire (8 tiles) of enemies that shoot - lasers (type 2) and fire (type 4). null if none.
function AiSight(view)
{
	var sight = null;

	view.enemies.forEach(function(e)
	{
		if (e.type != 2 && e.type != 4)
			return;

		sight = sight || {};

		for (var d = 1; d <= 4; ++d)
			AiLine(view, e.x, e.y, d, 8, false, []).forEach(function(c) { sight[AiIndex(view, c.x, c.y)] = true; });
	});

	return sight;
}

// Kicks: walking from the tile behind a still, pushable bomb into it sends it sliding.
// Returns [{ x, y (where to stand), dir, after (danger then), hits, standSafe, hurtsMate }] for bombs within 8 tiles.
function AiKicks(view, me, danger, targets)
{
	var list = [];

	view.bombs.forEach(function(b, k)
	{
		if (!b.pushable || b.dir || Math.abs(b.x - me.x) + Math.abs(b.y - me.y) > 8)
			return;

		for (var d = 1; d <= 4; ++d)
		{
			var sx = b.x - AI_DIRS[d][0], sy = b.y - AI_DIRS[d][1];

			if (!AiFloor(view, sx, sy))
				continue;

			var v = AiCopy(view);
			var kicked = AiCopy(b);

			kicked.dir = d;
			v.bombs = view.bombs.slice();
			v.bombs[k] = kicked;

			var after = AiDangerMap(v);
			var sooner = AiSooner(after, danger);

			list.push({ x: sx, y: sy, dir: d, after: after, hits: AiHitsAny(view, targets, sooner),
				standSafe: after[AiIndex(view, sx, sy)] == Infinity, hurtsMate: view.mode == "campaign" && AiHurtsTeammate(view, me, sooner) });
		}
	});

	return list;
}

// Battle: would this bomb leave an opponent (within 8 tiles) with no way out? They can run now, not after it.
function AiTraps(view, me, danger, effect)
{
	var opts = { step: AI_TILE_SECONDS, margin: 0, avoid: null };

	return view.players.some(function(p)
	{
		if (p.dead || p.index == me.index || Math.abs(p.x - me.x) + Math.abs(p.y - me.y) > 8)
			return false;

		if (effect.after[AiIndex(view, p.x, p.y)] == Infinity)
			return false;

		var theirs = AiSolidView(view, p.index, false);
		var later = AiCopy(theirs);

		later.bombs = effect.view.bombs;

		return AiEscape(theirs, p, danger, opts) !== null && AiEscape(later, p, effect.after, opts) === null;
	});
}

// Cheapest reachable goal (steps + bonus): power-ups, keys, spots with a target in blast line, spots from which a
// bomb reaches a target through a drain or on a carpet, kicks, spots next to a soft wall. Goals on the bot's own
// tile only count when bombing there is fine (hereOk). `shun`: tiles never to wait on (line of fire).
function AiChooseGoal(view, me, level, danger, opts, targets, hereOk, shun)
{
	var campaign = view.mode == "campaign";
	var reach = AiReach(view, me, danger, { step: opts.step, margin: opts.margin, avoid: opts.avoid, safeOnly: true });
	var goals = {};

	function add(x, y, kind, bonus, range)
	{
		if (!AiFloor(view, x, y))
			return;

		var i = AiIndex(view, x, y);

		// never a tile that will burn, one next to an enemy (enemies walk into you) or in a line of fire
		if (danger[i] != Infinity || (opts.avoid && opts.avoid[i]) || (shun && shun[i]))
			return;

		if (!goals[i] || goals[i].bonus > bonus)
			goals[i] = { kind: kind, bonus: bonus, range: range };
	}

	view.powerups.forEach(function(p)
	{
		if (level.PowerRange > 0 && !(level.AvoidBadLuck && p.type == 5))
			add(p.x, p.y, "item", -2, level.PowerRange);
	});

	if (campaign)
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

		// From a drain or a magic carpet the blast lands somewhere else: try the nearest such tiles.
		if (level.Remote && ((view.drains || []).length || (view.carpets || []).length))
		{
			var special = AiCellSet(view, (view.drains || []).concat(view.carpets || []));

			for (var n = 1, tried = 0; n < reach.order.length && tried < 24; ++n)
			{
				var i = reach.order[n];

				if (!special[i])
					continue;

				++tried;

				var spot = { x: i % view.w, y: Math.floor(i / view.w) };
				var fx = AiBombEffect(view, me, spot, danger, opts);

				if (fx.safe && AiHitsAny(view, targets, fx.sooner) && !(campaign && AiHurtsTeammate(view, me, fx.sooner)))
					add(spot.x, spot.y, "remote", level.HuntBonus - 1, 999);
			}
		}
	}

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

	var result = best < 0 ? null : { kind: goals[best].kind, kick: 0, path: AiTrace(view, reach, best), cost: bestCost };

	// Kicks: the stand tile is next to the bomb, so inside its blast for now - the path only has to get there in time.
	if (level.Kicks && me.kick)
	{
		AiKicks(view, me, danger, targets).forEach(function(k)
		{
			if (!k.hits || !k.standSafe || k.hurtsMate)
				return;

			var path = AiFindPath(view, me, function(x, y) { return x == k.x && y == k.y; }, danger, { step: opts.step, margin: opts.margin, avoid: opts.avoid });
			var cost = path ? path.length + level.HuntBonus - 1 : Infinity;

			if (cost < (result ? result.cost : Infinity))
				result = { kind: "kick", kick: k.dir, path: path, cost: cost };
		});
	}

	return result;
}

// One planning step. me: { x, y, index, speed, power, bombs, superBomb, kick }; level: an AI_LEVELS entry; rng: () -> [0, 1).
// Returns { path: [tiles], bomb, kick (direction to walk into a bomb, optional), reason }.
function AiDecide(view, me, level, rng)
{
	var raw = view;

	view = AiSolidView(view, me.index, level.AvoidBadLuck);

	var danger = AiDangerMap(view);
	var here = AiIndex(view, me.x, me.y);
	var campaign = view.mode == "campaign";
	var zone = AiEnemyZone(view);
	var opts = { step: AI_TILE_SECONDS / Math.max(0.25, me.speed || 1), margin: level.Margin, avoid: zone };
	var targets = AiTargets(view, me);

	// The game only drops a bomb on a tile nothing else solid (a bomb, a player, an enemy, ice) is on.
	var tileTaken = !!AiObstacles(view)[here];

	// 1. Out of the way of a blast (Easy sometimes notices a slow one late)
	var threatened = danger[here] != Infinity;

	if (threatened && danger[here] > 0.6 && rng() < level.SkipDanger)
		threatened = false;

	if (threatened)
	{
		// Hard, with the push power-up: kicking the bomb away from here beats running (best if it hits somebody).
		if (level.Kicks && me.kick)
		{
			var kicks = AiKicks(view, me, danger, targets).filter(function(k)
			{
				return k.x == me.x && k.y == me.y && k.after[here] == Infinity && !k.hurtsMate;
			});

			kicks.sort(function(a, b) { return (b.hits ? 1 : 0) - (a.hits ? 1 : 0); });

			if (kicks.length)
				return { path: [], bomb: false, kick: kicks[0].dir, reason: "kick" };
		}

		// Comfortable escape first; then ignore enemies; then drop the safety margin (tight, but it beats standing still).
		var esc = AiEscape(view, me, danger, opts) ||
			AiEscape(view, me, danger, { step: opts.step, margin: opts.margin, avoid: null }) ||
			AiEscape(view, me, danger, { step: opts.step, margin: 0, avoid: null });

		return { path: esc || [], bomb: false, reason: "flee" };
	}

	var effect = me.bombs > 0 && !tileTaken ? AiBombEffect(view, me, me, danger, opts) : null;
	var hereOk = !!effect && effect.safe && !(campaign && AiHurtsTeammate(view, me, effect.sooner));

	// 2. A target our bomb would reach (straight, through a chain, a drain or riding a carpet)
	if (hereOk && AiHitsAny(view, targets, effect.sooner))
		return { path: [], bomb: true, reason: "attack" };

	// 2b. Battle: a bomb that leaves an opponent nowhere to run
	if (hereOk && level.Traps && !campaign && AiTraps(raw, me, danger, effect))
		return { path: [], bomb: true, reason: "trap" };

	// 3. Campaign: do not hang around next to enemies
	if (zone && zone[here])
	{
		// (walking through the enemy's surroundings is the only way out of them)
		var away = AiEscape(view, me, danger, { step: opts.step, margin: opts.margin, avoid: null }, zone);

		if (away && away.length)
			return { path: away, bomb: false, reason: "evade" };

		// Cornered: the enemy hurts anyway, a bomb at least takes it along.
		if (effect && AiHitsAny(view, view.enemies, effect.sooner) && !AiHurtsTeammate(view, me, effect.sooner))
			return { path: [], bomb: true, reason: "cornered" };
	}

	// 4. The cheapest goal (arrived at a hunt / wall / remote spot: bomb; at a kick spot: kick)
	var goal = AiChooseGoal(view, me, level, danger, opts, targets, hereOk, level.AvoidSight && campaign ? AiSight(view) : null);

	if (goal)
	{
		if (goal.path.length == 0 && goal.kick)
			return { path: [], bomb: false, kick: goal.kick, reason: "kick" };

		return { path: goal.path, bomb: goal.path.length == 0, reason: goal.kind };
	}

	return { path: [], bomb: false, reason: "idle" };
}

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
		superBomb: player.SuperBombsTime > 0,
		kick: player.PushableBombsTime > 0
	};
}

// Tile view of the running game for AiDecide (browser only: reads GameWorld, GameEntityManager, PlayerManager).
function AiBuildView(mode, roster)
{
	var bw = GameWorld.BlockWidth, bh = GameWorld.BlockHeight;
	var v = { w: GameWorld.WorldWidth, h: GameWorld.WorldHeight, walls: GameWorld.Walls, bombs: [], fire: [], blocked: [],
		ice: [], carpets: [], drains: [], lasers: [], shots: [], enemies: [], powerups: [], keys: [], players: [],
		keyFlags: PlayerManager.KeyFlags, mode: mode };

	function tile(e)
	{
		return { x: Math.floor((e.X + e.Width / 2) / bw), y: Math.floor((e.Y + e.Height / 2) / bh) };
	}

	// Every tile the entity's body overlaps (two while it walks between tiles)
	function cover(e)
	{
		var list = [];

		for (var y = Math.floor(e.Y / bh); y <= Math.floor((e.Y + e.Height - 1) / bh); ++y)
			for (var x = Math.floor(e.X / bw); x <= Math.floor((e.X + e.Width - 1) / bw); ++x)
				list.push({ x: x, y: y });

		return list;
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
				t.pushable = !!e.Pushable;
				t.dir = e.Direction || 0;
				v.bombs.push(t);
				break;

			case "Explosion": v.fire.push(t); break;
			case "HotWall": v.blocked.push(t); break;
			case "Drain": v.drains.push(t); break;
			case "Key": v.keys.push(t); break;

			case "Shot":
				t.dir = e.Direction || 0;
				v.shots.push(t);
				break;

			case "IceBlock":
				t.frozen = !!e.FrozenBomb;
				v.ice.push(t);
				break;

			case "MagicCarpet":
				t.dir = e.MagicDirection;
				v.carpets.push(t);
				break;

			case "Enemy":
				t.cover = cover(e);
				t.type = e.EnemyType;
				v.enemies.push(t);

				// a charging laser fires when 0.5 s of the charge are left
				if (e.ShoopTimer > 0.5 && e.ShoopDir)
					v.lasers.push({ x: t.x, y: t.y, dir: e.ShoopDir, time: e.ShoopTimer - 0.5 });
				break;

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
		t.cover = cover(p);
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

	var owner = null, path = [], wantBomb = false, kickDir = 0, kickFor = 0;
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
			kickDir = 0;
			thinkIn = deadFor = stuckFor = 0;
		}

		if (player.IsDead)
		{
			path = [];
			wantBomb = false;
			kickDir = 0;
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
			kickDir = plan.kick || 0;
			kickFor = 0.08;
			thinkIn = level.ThinkMs / 1000;
		}

		lastBombs = bombs;

		var tw = player.Width, th = player.Height;

		if (kickDir)
		{
			// walk into the bomb for a moment: that sets it sliding
			act.Dir = kickDir;
			kickFor -= delta;

			if (kickFor <= 0)
			{
				kickDir = 0;
				thinkIn = 0;
			}
		}
		else if (wantBomb)
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
			else
			{
				// Nothing to do: settle onto the tile's centre (half on the next tile is still in its blast).
				var at = AiSelf(player);

				act.Dir = AiSteer(player.X, player.Y, at.x * tw, at.y * th, 1);
			}
		}

		// Holding a direction without moving (another player or a new bomb in the way): plan again.
		if (act.Dir && !kickDir && player.X === lastX && player.Y === lastY)
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

if (typeof module !== 'undefined')
	module.exports = {
		AI_TILE_SECONDS: AI_TILE_SECONDS, AI_BOMB_SECONDS: AI_BOMB_SECONDS, AI_FIRE_SECONDS: AI_FIRE_SECONDS, AI_DIRS: AI_DIRS,
		AiBlastCells: AiBlastCells, AiDangerMap: AiDangerMap, AiForecast: AiForecast, AiReach: AiReach, AiFindPath: AiFindPath,
		AiEscape: AiEscape, AiSafeAfterBomb: AiSafeAfterBomb, AiHitsTeammate: AiHitsTeammate, AiBombEffect: AiBombEffect,
		AI_LEVELS: AI_LEVELS, AiDecide: AiDecide, AiSteer: AiSteer, AiSelf: AiSelf, AiController: AiController
	};
```

`index.html`: `<script src="Game/AiWorld.js"></script>` right before `Game/AiBrain.js`. `tests/page.test.js`: `assert.ok(at('Game/AiWorld.js') < at('Game/AiBrain.js'));`. `Game/Enemy.js`, Shoop charge: after `shoopDir = dir;` add `this.ShoopDir = dir;`.

- [ ] **Step 4:** `node --test tests/*.test.js` -> all PASS (old tests included).

---

### Task 3: Browser verification and docs

- [ ] Campaign with 1 human (invulnerable) + Normal + Hard on levels 3 (index 2, drains), 4 (index 3, carpets + ice), 5 (index 4, ice + frozen bombs + drains), 6 (index 5, carpets): count reasons (`remote`, `kick`, `trap`), self-hits, friendly fire, enemy kills.
- [ ] Battle: Hard bot with `PushableBombsTime` set: kicks happen, no self-kills from kicks.
- [ ] README: one line on what CPU players understand; spec's "Findings" section for anything found.
