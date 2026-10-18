// Computer players (CPU). AiDecide plans on the tile view and blast forecast of AiWorld.js; AiController turns
// its plans into the actions Input.Player() returns. AiBuildView builds the view from the running game.

// Node (tests): the world model lives in AiWorld.js (index.html loads it first in the browser)
if (typeof module !== 'undefined')
	Object.assign(global, require('./AiWorld.js'));

var AI_LEVELS =
{
	easy:   { Name: "Easy",   ThinkMs: 400, Margin: 0.35, SkipDanger: 0.2, HuntRange: 4,   HuntBonus: 2, WallBonus: 0, PowerRange: 0,   AvoidBadLuck: false,
	          Remote: false, Traps: false, Kicks: false, AvoidSight: false, Ambush: false, Skulls: false, Stalk: false, Wary: 0 },
	normal: { Name: "Normal", ThinkMs: 150, Margin: 0.25, SkipDanger: 0,   HuntRange: 8,   HuntBonus: 2, WallBonus: 6, PowerRange: 5,   AvoidBadLuck: true,
	          Remote: true,  Traps: true,  Kicks: true,  AvoidSight: true,  Ambush: true,  Skulls: true,  Stalk: true,  Wary: 2 },
	hard:   { Name: "Hard",   ThinkMs: 50,  Margin: 0.15, SkipDanger: 0,   HuntRange: 999, HuntBonus: 0, WallBonus: 8, PowerRange: 999, AvoidBadLuck: true,
	          Remote: true,  Traps: true,  Kicks: true,  AvoidSight: true,  Ambush: true,  Skulls: true,  Stalk: true,  Wary: 2 }
};

// Battle is about the other players: hunt them from anywhere, hunt before digging, dig towards them, and close in when there
// is nothing else to do. (The campaign levels keep their tuning.) Returns a copy of `level`.
var AI_BATTLE_AGGRESSIVE = true;     // (off: battle bots play like campaign bots)
var AI_BATTLE_HUNT_BONUS = -3;      // hunting spots cost this much less
var AI_BATTLE_WALL_BASE = 2;        // a wall to bomb costs this plus ...
var AI_BATTLE_WALL_SLOPE = 0.35;    // ... this much for every tile it is from the nearest opponent
var AI_BATTLE_RESTLESS_SECONDS = 4.0;
var AI_BATTLE_WARY = 1;             // keeps only this much of its caution about tiles an opponent can reach (Normal / Hard: 2)
var AI_POP_MIN_TIME = AI_BOMB_SECONDS + 0.6;   // a blinking skull with less time left than this cannot be blown up in time
var AI_SUDDEN_HORIZON = 8.0;        // seconds ahead the bots look at the arena closing in
var AI_BATTLE_PRESSURE = 3;         // an opponent this close (tiles, in a straight count) gets a bomb at once if the way out is safe
var AI_BATTLE_SHOWN_BONUS = 2;      // a power-up showing through a chipped brick is worth less of a detour (AI_SHOWN_BONUS) ...
var AI_BATTLE_SHOWN_PUSH = 4;       // ... and so is the push power-up (AI_SHOWN_PUSH)

function AiAggressive(level)
{
	var l = {};

	for (var k in level)
		l[k] = level[k];

	l.HuntRange = level.HuntRange < 8 ? 8 : 999;   // (Easy still sees less far than the others)
	l.HuntBonus = level.HuntBonus + AI_BATTLE_HUNT_BONUS;
	l.WallBonus = AI_BATTLE_WALL_BASE;
	l.WallSlope = AI_BATTLE_WALL_SLOPE;
	l.Wary = Math.min(level.Wary, AI_BATTLE_WARY);
	l.Pressure = level.Traps ? AI_BATTLE_PRESSURE : 0;   // (Easy does not)
	l.ShownBonus = AI_BATTLE_SHOWN_BONUS;
	l.ShownPush = AI_BATTLE_SHOWN_PUSH;
	l.Aggressive = true;

	return l;
}

// Breadth-first search over standable tiles. A tile can be crossed when the bot is out of it `margin` seconds
// before it burns, or after the blast is over (opts.safeOnly: only tiles no blast touches). `avoid` tiles are
// reached but not walked through. An ice block can be walked into when the tile behind it is free: it slides on.
// With `isGoal(x, y)` the search stops at the first tile (in discovery order) it holds for: `found` is that tile's index.
function AiReach(view, from, danger, opts, isGoal)
{
	var obstacles = AiObstacles(view);
	var ice = AiCellSet(view, view.ice || []);
	var closing = AiClosingMap(view);
	var start = AiIndex(view, from.x, from.y);
	var steps = {}, prev = {}, first = {}, order = [start];

	steps[start] = 0;
	prev[start] = -1;
	first[start] = 0;

	if (isGoal && isGoal(from.x, from.y))
		return { order: order, steps: steps, prev: prev, first: first, start: start, found: start };

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
			var slack = opts.slack || 0;

			// a tile that closes for good is no way through unless we are across before it shuts
			if (closing[ni] !== undefined && !((s + 0.5) * opts.step + opts.margin + slack < closing[ni]))
				continue;

			if (burn != Infinity && opts.safeOnly)
				continue;

			// in it from (s - 0.5) to (s + 0.5) steps: no blast may burn it meanwhile (any of them - a tile can burn twice)
			if (burn != Infinity && !AiBurnClear(danger, ni, (s - 0.5) * opts.step - slack, (s + 0.5) * opts.step + opts.margin + slack))
				continue;

			steps[ni] = s;
			prev[ni] = cur;
			first[ni] = cur == start ? d : first[cur];
			order.push(ni);

			if (isGoal && isGoal(nx, ny))
				return { order: order, steps: steps, prev: prev, first: first, start: start, found: ni };
		}
	}

	return { order: order, steps: steps, prev: prev, first: first, start: start };
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
	var reach = AiReach(view, from, danger, opts, isGoal);

	return reach.found === undefined ? null : AiTrace(view, reach, reach.found);
}

var AI_ESCAPE_LAYERS = 40;   // how many steps ahead a way out is searched for (~7 s)

// Way out in space and time: a search over (tile, step) that may also wait on a tile, e.g. for a blast to pass before it
// goes through. A tile is fine at step k when no blast burns it while the bot is in it (from k - 0.5 to k + 0.5 steps, plus
// the margin); the way ends on a tile that will not burn again once it is there, not in `shun`, and accepted by
// `isGoal(i)` if given. Returns the tiles to walk now - up to the first wait (the plan is made again by then) - with
// `path.goal` (where it ends: { x, y }) and `path.steps` (steps including waits); null when there is no way out.
function AiEscapeSearch(view, from, danger, opts, shun, isGoal)
{
	var obstacles = AiObstacles(view);
	var ice = AiCellSet(view, view.ice || []);
	var closing = AiClosingMap(view);
	var start = AiIndex(view, from.x, from.y);
	var step = opts.step, margin = opts.margin, slack = opts.slack || 0;
	var avoid = opts.avoid;
	var prev = [{}];
	var layer = [start];

	function goal(i, k)
	{
		return closing[i] === undefined && !(shun && shun[i]) && !AiBurnsAfter(danger, i, (k - 0.5) * step - slack) && (!isGoal || isGoal(i));
	}

	function result(i, k)
	{
		var tiles = [];

		for (var j = k; j > 0; --j)
		{
			tiles.unshift(i);
			i = prev[j][i];
		}

		var path = [], at = start;

		for (var n = 0; n < tiles.length && tiles[n] != at; ++n)
		{
			at = tiles[n];
			path.push({ x: at % view.w, y: Math.floor(at / view.w) });
		}

		var end = tiles.length ? tiles[tiles.length - 1] : start;

		// (not enumerable: the path still looks like a plain list of tiles)
		Object.defineProperty(path, "goal", { value: { x: end % view.w, y: Math.floor(end / view.w) } });
		Object.defineProperty(path, "steps", { value: k });

		return path;
	}

	if (goal(start, 0))
		return result(start, 0);

	for (var k = 1; k <= AI_ESCAPE_LAYERS && layer.length; ++k)
	{
		var seen = {}, next = [];
		var from_ = (k - 0.5) * step - slack, to = (k + 0.5) * step + margin + slack;

		prev.push(seen);

		for (var q = 0; q < layer.length; ++q)
		{
			var cur = layer[q];
			var cx = cur % view.w, cy = Math.floor(cur / view.w);

			// waiting first (d = 0), then moves: of two ways that get as far as soon, the one that waits rather than steps
			// to and fro
			for (var d = 0; d <= 4; ++d)
			{
				var ni;

				if (d == 0)
					ni = cur;
				else
				{
					var nx = cx + AI_DIRS[d][0], ny = cy + AI_DIRS[d][1];

					if (!AiFloor(view, nx, ny))
						continue;

					ni = AiIndex(view, nx, ny);

					if (ni != start && avoid && avoid[ni])
						continue;

					// (no way back onto the start tile once off it: the bomb just dropped there is solid)
					if (obstacles[ni])
					{
						var bx = nx + AI_DIRS[d][0], by = ny + AI_DIRS[d][1];

						if (!ice[ni] || AiWall(view, bx, by) != " " || obstacles[AiIndex(view, bx, by)])
							continue;
					}
				}

				if (seen[ni] !== undefined)
					continue;

				if (closing[ni] !== undefined && !(to < closing[ni]))
					continue;

				if (danger[ni] != Infinity && !AiBurnClear(danger, ni, from_, to))
					continue;

				seen[ni] = cur;
				next.push(ni);

				if (goal(ni, k))
					return result(ni, k);
			}
		}

		layer = next;
	}

	return null;
}

// Path to the nearest tile no blast will touch and not in `shun` (default: opts.avoid, the tiles next to enemies).
// (It may be a wait: [] with no way out needed yet; see AiEscapeSearch.) Only when there is no such tile: one that has
// burnt out by the time the bot gets there - safe as far as the forecast goes, but a plan that hangs on its timing.
// (opts.strict: only the first kind - what a bot counts on before it drops a bomb)
function AiEscape(view, from, danger, opts, shun)
{
	shun = shun || opts.avoid;

	return AiEscapeSearch(view, from, danger, opts, shun, function(i) { return danger[i] == Infinity; }) ||
		(opts.strict ? null : AiEscapeSearch(view, from, danger, opts, shun));
}

// No way out at all: at least head for the reachable tile that burns last (a blast may yet be late, a bomb kicked away...)
// rather than wait for it. [] when staying is as good as it gets.
function AiLastResort(view, from, danger, opts)
{
	// (tiles it can get to with no margin at all - never through a blast)
	var reach = AiReach(view, from, danger, AiWith(opts, { avoid: null, margin: 0, slack: 0 }));
	var best = reach.start, bestT = danger[reach.start];

	reach.order.forEach(function(i)
	{
		var t = danger[i] - reach.steps[i] * opts.step * 0.5;

		if (t > bestT + 1e-9)
		{
			bestT = t;
			best = i;
		}
	});

	return AiTrace(view, reach, best);
}

// The view as one player sees it: every enemy is solid (players are not: they walk through each other), a mover between
// two tiles blocks both (`cover`). Nobody walks over a power-up a human has first pick of (`locked`), and careful bots also never walk over a
// bad-luck power-up (it makes a player drop bombs by itself).
function AiSolidView(view, selfIndex, avoidCurses)
{
	var extra = [];

	view.enemies.forEach(function(e)
	{
		extra = extra.concat(e.cover || [e]);
	});

	extra = extra.concat(view.powerups.filter(function(p) { return p.locked || (avoidCurses && p.type == 5); }));

	var v = AiCopy(view);

	v.blocked = view.blocked.concat(extra);

	return v;
}

// A copy of planning options with some of them changed
function AiWith(opts, changes)
{
	var o = {};

	for (var k in opts)
		o[k] = opts[k];

	for (var k2 in changes)
		o[k2] = changes[k2];

	return o;
}

function AiWithBomb(view, at, me)
{
	var v = AiCopy(view);

	v.bombs = view.bombs.concat([{ x: at.x, y: at.y, power: me.power, time: AI_BOMB_SECONDS, superBomb: !!me.superBomb, dir: 0, pushable: true }]);

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
// - `safe`: whoever stands at `at` still gets away (keeping out of `avoid`, e.g. tiles an opponent can get to).
function AiBombEffect(view, me, at, danger, opts, avoid)
{
	var v = AiWithBomb(view, at, me);
	var after = AiDangerMap(v);
	var o = AiWith(opts, { avoid: avoid || null, strict: AI_STRICT_BOMB });
	var safe = AiEscape(v, at, after, o) !== null;

	// (opts.room: that many tiles to hide on at least - one lone tile is easily bombed shut)
	if (safe && opts.room > 1)
	{
		var reach = AiReach(v, at, after, o), room = 0;

		for (var n = 0; n < reach.order.length && room < opts.room; ++n)
			if (after[reach.order[n]] == Infinity && !(o.avoid && o.avoid[reach.order[n]]))
				++room;

		safe = room >= opts.room;
	}

	// `wasted`: this bomb would blast a brick that another blast is already going to destroy - and burn the power-up it
	// uncovers (the second blast comes 0.5 s or more later) -
	var wasted = AI_CAREFUL_BRICKS && AiWastedBricks(view, after.burns) > AiWastedBricks(view, danger.burns);

	// ... or a power-up lying there that no blast was going to reach (a curse is better burnt)
	if (AI_CAREFUL_BRICKS && !wasted)
		wasted = (view.powerups || []).some(function(p)
		{
			var i = AiIndex(view, p.x, p.y);

			return p.type != 5 && danger[i] == Infinity && after[i] != Infinity;
		});

	return { view: v, after: after, sooner: AiSooner(after, danger), safe: safe, wasted: wasted };
}

// Battle: tiles an opponent can walk to within `radius` steps - where it could drop a bomb into our way out: index -> true
function AiContested(view, me, radius)
{
	var contested = {};

	view.players.forEach(function(p)
	{
		if (p.dead || p.index == me.index)
			return;

		var steps = {}, queue = [{ x: p.x, y: p.y, s: 0 }];

		steps[AiIndex(view, p.x, p.y)] = 0;

		for (var q = 0; q < queue.length; ++q)
		{
			var c = queue[q];

			contested[AiIndex(view, c.x, c.y)] = true;

			if (c.s >= radius)
				continue;

			for (var d = 1; d <= 4; ++d)
			{
				var nx = c.x + AI_DIRS[d][0], ny = c.y + AI_DIRS[d][1];

				if (AiFloor(view, nx, ny) && steps[AiIndex(view, nx, ny)] === undefined)
				{
					steps[AiIndex(view, nx, ny)] = c.s + 1;
					queue.push({ x: nx, y: ny, s: c.s + 1 });
				}
			}
		}
	});

	return contested;
}

// Would a bomb here burn a power-up that a human has first pick of?
function AiBurnsLocked(view, me)
{
	var locked = view.powerups.filter(function(p) { return p.locked; });

	if (!locked.length)
		return false;

	return AiBlastCells(view, { x: me.x, y: me.y, power: me.power, superBomb: me.superBomb }).some(function(c)
	{
		return locked.some(function(p) { return p.x == c.x && p.y == c.y; });
	});
}

// Is there still a way to safety after dropping a bomb where the bot stands?
function AiSafeAfterBomb(view, me, opts)
{
	return AiBombEffect(view, me, me, AiDangerMap(view), opts).safe;
}

function AiHurtsTeammate(view, me, sooner)
{
	return view.players.some(function(p)
	{
		if (p.dead || p.index == me.index)
			return false;

		if (sooner[AiIndex(view, p.x, p.y)])
			return true;

		// A human may walk into the blast, or not see it coming (a CPU player always does): keep a tile away from them too
		if (AI_COOP_SPARE && !p.bot)
			for (var d = 1; d <= 4; ++d)
				if (AiInside(view, p.x + AI_DIRS[d][0], p.y + AI_DIRS[d][1]) && sooner[AiIndex(view, p.x + AI_DIRS[d][0], p.y + AI_DIRS[d][1])] &&
					AiFloor(view, p.x + AI_DIRS[d][0], p.y + AI_DIRS[d][1]))
					return true;

		return false;
	});
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

var AI_TRACK_SECONDS = 2.5;   // how far ahead the route of an enemy riding a carpet is predicted (a bomb takes 2 s)

// Targets with their route: an enemy on a magic carpet rides it (`track`, like a bomb's) - players never do.
// The planning bot (`me`) is solid too: a riding enemy stops in front of it.
function AiTargetTracks(view, targets, me)
{
	if (!(view.carpets || []).length)
		return targets;

	var carpets = AiCarpetMap(view);
	var stops = Object.assign({}, AiStaticObstacles(view));   // (a copy: the bot's own body is added to it)
	var self = view.players.filter(function(p) { return p.index == me.index; })[0];

	(self && self.cover || [me]).forEach(function(c) { stops[AiIndex(view, c.x, c.y)] = true; });

	return targets.map(function(t)
	{
		if (carpets[AiIndex(view, t.x, t.y)] === undefined)
			return t;

		// its own body does not stop it
		var own = AiCellSet(view, t.cover || [t]);
		var free = {};

		for (var k in stops)
			if (!own[k])
				free[k] = true;

		var moving = AiCopy(t);

		moving.track = AiBombTrack(view, { x: t.x, y: t.y, time: AI_TRACK_SECONDS }, free, carpets);

		return moving;
	});
}

// Would `after` (danger with our bomb) burn a target sooner than `danger` - while the target is there? A riding target
// is on each tile of its track from its arrival until it moves on.
function AiHitsTargets(view, targets, after, danger)
{
	return targets.some(function(t)
	{
		var track = t.track || [{ x: t.x, y: t.y, t: 0 }];

		for (var k = 0; k < track.length; ++k)
		{
			var i = AiIndex(view, track[k].x, track[k].y);
			var burn = after[i];
			var until = k + 1 < track.length ? track[k + 1].t : Infinity;

			if (burn < danger[i] && burn >= track[k].t - AI_FIRE_SECONDS && burn <= until)
				return true;
		}

		return false;
	});
}

// What a bot attacks: enemies in the campaign; in battle every other living player, and any enemy a skull let out.
function AiTargets(view, me)
{
	if (view.mode == "campaign")
		return view.enemies;

	return view.players.filter(function(p) { return !p.dead && p.index != me.index; }).concat(view.enemies);
}

// Enemy tiles and their neighbours (touching an enemy hurts). Battle has enemies only when a skull let one out.
function AiEnemyZone(view)
{
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

// Campaign: tiles in the line of fire (8 tiles) of fire-spitting enemies (type 4): their shots fly too fast to dodge
// reliably. (Laser enemies charge for 1 s first, firing after 0.5 s; the forecast handles them. Shunning their lines too left bots idle.)
// null if none.
function AiSight(view)
{
	var sight = null;

	view.enemies.forEach(function(e)
	{
		if (e.type != 4)
			return;

		sight = sight || {};

		for (var d = 1; d <= 4; ++d)
			AiLine(view, e.x, e.y, d, 8, false, []).forEach(function(c) { sight[AiIndex(view, c.x, c.y)] = true; });
	});

	return sight;
}

// Kicks: walking from the tile behind a still, pushable bomb into it sends it sliding.
// Returns [{ x, y (where to stand), bx, by (the bomb), dir, after (danger then), hits, standSafe, hurtsMate }] for bombs
// within 8 tiles. fromHere: only kicks from the bot's own tile, all of them; otherwise only those whose blast could reach a
// target (or set off another bomb, or a drain) - the rest are not worth a forecast.
function AiKicks(view, me, danger, targets, fromHere)
{
	var list = [];
	var stops = AiTrackStops(view), carpets = AiCarpetMap(view);
	var drains = AiCellSet(view, view.drains || []);
	var spots = [];

	targets.forEach(function(t) { spots = spots.concat(t.track || [t]); });

	// a blast from (x, y) of reach `power` might get to (tx, ty) (in line, close enough; walls not checked)
	function inLine(x, y, tx, ty, power)
	{
		return (x == tx && Math.abs(y - ty) <= power) || (y == ty && Math.abs(x - tx) <= power);
	}

	view.bombs.forEach(function(b, k)
	{
		// (a bomb about to go off - by itself or set off by another - is no time for a kick: getting clear of it and walking
		// into it takes a moment)
		if (!b.pushable || b.dir || Math.abs(b.x - me.x) + Math.abs(b.y - me.y) > 8 || danger[AiIndex(view, b.x, b.y)] < AI_KICK_MIN)
			return;

		for (var d = 1; d <= 4; ++d)
		{
			var sx = b.x - AI_DIRS[d][0], sy = b.y - AI_DIRS[d][1];

			if (!AiFloor(view, sx, sy) || (fromHere && (sx != me.x || sy != me.y)))
				continue;

			var v = AiCopy(view);
			var kicked = AiCopy(b);

			kicked.dir = d;
			// (it takes a moment to get clear of the bomb and walk into it)
			kicked.delay = AI_KICK_DELAY;

			// (a bomb that cannot move that way: the kick changes nothing)
			var track = AiBombTrack(view, kicked, stops, carpets);

			if (track.length < 2)
				continue;

			if (!fromHere && !track.some(function(p)
			{
				return drains[AiIndex(view, p.x, p.y)] ||
					spots.some(function(t) { return inLine(p.x, p.y, t.x, t.y, b.power); }) ||
					view.bombs.some(function(o) { return o !== b && inLine(p.x, p.y, o.x, o.y, b.power); });
			}))
				continue;

			v.bombs = view.bombs.slice();
			v.bombs[k] = kicked;

			var after = AiDangerMap(v);
			var sooner = AiSooner(after, danger);

			list.push({ x: sx, y: sy, bx: b.x, by: b.y, dir: d, after: after, hits: AiHitsTargets(view, targets, after, danger),
				standSafe: after[AiIndex(view, sx, sy)] == Infinity, hurtsMate: view.mode == "campaign" && AiHurtsTeammate(view, me, sooner) });
		}
	});

	return list;
}

// Battle: could one bomb from a nearby opponent leave us with no way out if we stood on (x, y)? The opponent drops it where
// it stands (or, if it could walk there in a step, next to it), with its power; whether we would still get away is the same
// question as for our own bomb. Returns true when it could (a tile to move away from).
function AiTrapProne(view, danger, x, y, me, opts)
{
	var o = AiWith(opts, { margin: 0, avoid: null, strict: true, room: 1 });

	return view.players.some(function(p)
	{
		if (p.dead || p.index == me.index || Math.abs(p.x - x) + Math.abs(p.y - y) > AI_PRONE_RANGE)
			return false;

		var bomb = { x: p.x, y: p.y, power: p.power || 2, time: AI_BOMB_SECONDS, superBomb: false, dir: 0, pushable: true };
		var v = AiCopy(view);

		v.bombs = view.bombs.concat([bomb]);

		var after = AiDangerMap(v);

		// (not a danger at all: out of its blast)
		if (after[AiIndex(view, x, y)] == Infinity)
			return false;

		return AiEscape(v, { x: x, y: y }, after, o) === null;
	});
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

// Somewhere else to be: a random safe tile 3-8 steps away (not next to an enemy, not in a line of fire).
// `keep`: the tile of the last wander plan - kept while it can still be reached safely.
function AiWander(view, me, danger, opts, shun, rng, keep)
{
	var reach = AiReach(view, me, danger, AiWith(opts, { avoid: opts.avoid, safeOnly: true }));

	if (keep >= 0 && keep != reach.start && reach.steps[keep] !== undefined && !(opts.avoid && opts.avoid[keep]) && !(shun && shun[keep]))
		return AiTrace(view, reach, keep);

	var spots = reach.order.filter(function(i)
	{
		var s = reach.steps[i];

		return s >= 3 && s <= 8 && !(opts.avoid && opts.avoid[i]) && !(shun && shun[i]);
	});

	if (!spots.length)
		return null;

	return AiTrace(view, reach, spots[Math.min(spots.length - 1, Math.floor(rng() * spots.length))]);
}

// Cooperation (campaign) - each can be switched off to see what it is worth
var AI_COOP_CLAIMS = true;    // do not go for what a teammate nearer to it is already going for
var AI_CLAIM_COST = 5;        // ... it costs this many steps more
var AI_COOP_ITEMS = true;     // leave a power-up to a human who is clearly nearer to it
var AI_COOP_SPARE = false;   // no bomb whose blast reaches the tile right next to a human
var AI_COOP_GUARD = true;     // enemies close to a human come first
var AI_GUARD_BONUS = 3;       // ... hunting spots against them cost this much less
var AI_GUARD_RANGE = 6;       // ... close: this many tiles (straight count) from a living human
// Stalking walking enemies (campaign): bomb where they will be, not where they are
var AI_STALK_CHANCE = 0.5;    // bomb when this much of the enemy's expected position is in the blast when it goes off
var AI_STALK_GOALS = false;   // ... and walk to spots from where that would work
var AI_STALK_RANGE = 12;      // enemies this near (tiles, straight count) are forecast
var AI_STALK_SECONDS = 3.0;   // how far ahead
var AI_CAREFUL_BRICKS = true; // no digging bomb that would burn a power-up another bomb is about to uncover
var AI_REPOSITION = false;    // battle: leave tiles where one bomb from a nearby opponent would leave no way out
var AI_PRONE_RANGE = 6;       // opponents this close (tiles, straight count) are the ones that count
var AI_PRONE_TRIES = 12;      // how many nearby tiles are tried as somewhere safer to be
var AI_STRICT_BOMB = true;    // a bomb counts as safe only if the bot can get to a tile that never burns (else: one that has burnt out)
var AI_GOAL_CHECKS = 6;       // how many bomb spots a plan checks (cheapest first) before it gives up on bombing anywhere
var AI_BOMB_GOALS = { hunt: true, wall: true, remote: true, skullpop: true, stalk: true };   // goals that mean a bomb on arrival
var AI_SAFE_ROOM = 1;         // Normal / Hard: a bomb is only safe with this many tiles to hide on afterwards
var AI_DIG_SCORE = true;      // digging spots by how many bricks a bomb there clears (off: any tile next to a brick)
var AI_DIG_EXTRA = 1.5;       // every brick past the first makes a digging spot worth this many steps
var AI_SHOWN_BONUS = 5;       // a brick with a power-up showing through a chip (see Cracks.js) makes a digging spot worth this many steps
var AI_SHOWN_PUSH = 8;        // ... the push power-up, to a bot that kicks bombs
var AI_STICKY = 1.5;         // the goal of the last plan counts as this many steps closer (hysteresis against jitter)
var AI_KICK_DODGE = "hits";    // kick a threatening bomb away instead of running: "any" kick that makes our tile safe, "hits" only
                              // one that hits somebody too, "" never
var AI_KICK_DELAY = 0.1;      // seconds from the decision until a kicked bomb slides (getting clear of it, walking in)
var AI_KICK_MIN = 0.35;       // a bomb that goes off sooner than this (seconds) is not kicked
var AI_KICK_RETRY = 1.0;      // seconds before a kick that did not get the bomb going is tried again

var AI_TURN_COST = 1.0;       // a goal that makes a moving bot turn back costs this many steps more

// A bot on its way (me.dir) that would have to turn back for a goal (first step `d`): that costs a little - else two goals
// about as far in opposite directions have it walk to and fro as things change.
function AiTurnCost(me, d)
{
	return me.dir && d && Math.abs(me.dir - d) == 2 ? AI_TURN_COST : 0;
}

// What the bots are going for, so they do not all go for the same thing: player index -> { x, y (the tile), reason }.
// Written by the controllers (AiController), cleared by AiBoardClear when a game starts, read by AiBuildView (view.mates).
var AiBoard = {};

function AiBoardClear()
{
	AiBoard = {};
}

// Extra cost of a goal tile that a teammate who is at least as near to it has already claimed (same sort of goal, within a
// tile of the same place) - two bots after the same brick or the same enemy only get in each other's way.
function AiClaimCost(view, me, i, kind, steps)
{
	if (!AI_COOP_CLAIMS || !view.mates || !view.mates.length || kind == "approach" || kind == "kick")
		return 0;

	var x = i % view.w, y = Math.floor(i / view.w);

	for (var k = 0; k < view.mates.length; ++k)
	{
		var m = view.mates[k];

		if (m.index == me.index || Math.abs(m.x - x) + Math.abs(m.y - y) > 1)
			continue;

		var at = view.players.filter(function(p) { return p.index == m.index && !p.dead; })[0];

		if (at && Math.abs(at.x - x) + Math.abs(at.y - y) <= steps + 1)
			return AI_CLAIM_COST;
	}

	return 0;
}

// Is a living human (a person, not a CPU player) at least a step nearer to (x, y) than we are, and near?
function AiHumanNearer(view, me, x, y)
{
	var mine = Math.abs(me.x - x) + Math.abs(me.y - y);

	return view.players.some(function(p)
	{
		var d = Math.abs(p.x - x) + Math.abs(p.y - y);

		return !p.dead && !p.bot && p.index != me.index && d + 1 <= mine && d <= 8;
	});
}

// Is (x, y) close to a living human?
function AiNearHuman(view, me, x, y)
{
	return view.players.some(function(p)
	{
		return !p.dead && !p.bot && p.index != me.index && Math.abs(p.x - x) + Math.abs(p.y - y) <= AI_GUARD_RANGE;
	});
}

// Position forecasts of the walking enemies near `me`: [{ e, f: AiEnemyForecast }] (kept on the view for the whole plan)
function AiEnemyForecasts(view, me)
{
	return AiMemo(view, "enemyFx", view.enemies, view.bombs, view.ice, view.players, view.enemies.length + view.bombs.length, function()
	{
		var carpets = AiCarpetMap(view);

		return view.enemies.filter(function(e)
		{
			// (one riding a magic carpet is dealt with by its track)
			return e.moving === true && carpets[AiIndex(view, e.x, e.y)] === undefined && Math.abs(e.x - me.x) + Math.abs(e.y - me.y) <= AI_STALK_RANGE;
		}).map(function(e) { return { e: e, f: AiEnemyForecast(view, e, AI_STALK_SECONDS) }; });
	});
}

// How likely is it that some forecast enemy is in the burning tiles when they burn? `burning`: [{ i (tile), b (seconds from now
// until it starts to burn) }]. For the likeliest enemy: the most probability, over the moments around the blast, that is on them.
function AiStalkChance(fcs, burning)
{
	var best = 0;

	fcs.forEach(function(c)
	{
		var tt = c.f.tt;

		for (var k = 0; k < c.f.layers.length; ++k)
		{
			var sum = 0, lay = c.f.layers[k];

			burning.forEach(function(x)
			{
				if (lay[x.i] && Math.abs(k * tt - (x.b + AI_FIRE_SECONDS / 2)) <= tt)
					sum += lay[x.i];
			});

			if (sum > best)
				best = Math.min(1, sum);
		}
	});

	return best;
}

// me.memory (kept by AiController between plans): { goal: { x, y } where the last plan led, reason, now (seconds),
// kicks: [{ x, y, dir, t }] kicks tried (bomb tile, direction) }. Was tile i the goal of the last plan, of this kind?
function AiRemembered(me, i, kind)
{
	var m = me.memory;

	return !!(m && m.goal && m.reason == kind && m.goal.i === i);
}

// Did a kick at this bomb in this direction just fail (the bomb is still there)?
function AiKickFailed(me, k)
{
	var m = me.memory;

	return !!(m && m.kicks && m.kicks.some(function(t) { return t.x == k.bx && t.y == k.by && t.dir == k.dir && m.now - t.t < AI_KICK_RETRY; }));
}

// Cheapest reachable goal (steps + bonus): power-ups, keys, spots with a target in blast line, spots from which a
// bomb reaches a target through a drain or on a carpet, kicks, spots next to a soft wall. Goals on the bot's own
// tile only count when bombing there is fine (hereOk). `shun`: tiles never to wait on (line of fire).
// A spot to walk to and bomb from is only a goal if bombing there will be fine (checked for the cheapest few, up to
// AI_GOAL_CHECKS): otherwise the bot gets there, may not bomb, and walks off to the next spot - and back.
function AiChooseGoal(view, me, level, danger, opts, targets, hereOk, shun, poppable, contested, hereWallOk)
{
	var campaign = view.mode == "campaign";
	var reach = AiReach(view, me, danger, AiWith(opts, { avoid: opts.avoid, safeOnly: true }));
	var goals = {};

	function add(x, y, kind, bonus, range)
	{
		if (!AiFloor(view, x, y))
			return;

		var i = AiIndex(view, x, y);

		// never a tile that will burn, one next to an enemy (enemies walk into you), nor a line of fire to wait in
		// (attack spots are in the shooter's line by nature: the forecast covers a charging laser)
		if (danger[i] != Infinity || (opts.avoid && opts.avoid[i]) || (shun && shun[i] && kind != "hunt" && kind != "remote"))
			return;

		if (!goals[i] || goals[i].bonus > bonus)
			goals[i] = { kind: kind, bonus: bonus, range: range };
	}

	view.powerups.forEach(function(p)
	{
		if (level.PowerRange > 0 && !p.locked && !(level.AvoidBadLuck && p.type == 5) && !(AI_COOP_ITEMS && campaign && AiHumanNearer(view, me, p.x, p.y)))
		{
			// the push power-up (3) is worth a detour to a bot that knows what to do with it: it kicks bombs
			if (p.type == 3 && level.Kicks)
				add(p.x, p.y, "item", -5, Math.max(level.PowerRange, 12));
			else
				add(p.x, p.y, "item", -2, level.PowerRange);
		}
	});

	if (campaign)
		view.keys.forEach(function(k) { add(k.x, k.y, "key", -2, 999); });

	if (me.bombs > 0)
	{
		targets.forEach(function(t)
		{
			// (an enemy close to a human is the one to go for)
			var bonus = level.HuntBonus - (AI_COOP_GUARD && campaign && AiNearHuman(view, me, t.x, t.y) ? AI_GUARD_BONUS : 0);

			AiBlastCells(view, { x: t.x, y: t.y, power: me.power, superBomb: me.superBomb }).forEach(function(c)
			{
				add(c.x, c.y, "hunt", bonus, level.HuntRange);
			});
		});

		// A blinking skull to blow up (it turns into a power-up): the spots from which our blast reaches it, if there is time to
		// get there and let the fuse burn
		(poppable || []).forEach(function(s)
		{
			var steps = Math.floor((s.time - AI_POP_MIN_TIME) / opts.step);

			if (steps >= 0)
				AiBlastCells(view, { x: s.x, y: s.y, power: me.power, superBomb: me.superBomb }).forEach(function(c) { add(c.x, c.y, "skullpop", level.HuntBonus - 2, steps); });
		});

		// Skulls on purpose: a blinking skull is a bomb on a timer. With a target in its reach, lurk just outside it, by
		// the target's ways out (never inside: the forecast marks it) - the attack and trap checks then close the exits.
		if (level.Skulls)
		{
			(view.skulls || []).forEach(function(s)
			{
				if (s.time < 1.0)
					return;

				var zoneSet = AiCellSet(view, AiBlastCells(view, { x: s.x, y: s.y, power: AI_SKULL_REACH }));

				targets.forEach(function(t)
				{
					if (!zoneSet[AiIndex(view, t.x, t.y)])
						return;

					var steps = {}, queue = [{ x: t.x, y: t.y, s: 0 }];

					steps[AiIndex(view, t.x, t.y)] = 0;

					for (var q = 0; q < queue.length; ++q)
					{
						var c = queue[q];

						if (!zoneSet[AiIndex(view, c.x, c.y)])
							add(c.x, c.y, "skull", level.HuntBonus - 1, level.HuntRange);

						if (c.s >= 3)
							continue;

						for (var d = 1; d <= 4; ++d)
						{
							var nx = c.x + AI_DIRS[d][0], ny = c.y + AI_DIRS[d][1];

							if (AiFloor(view, nx, ny) && steps[AiIndex(view, nx, ny)] === undefined)
							{
								steps[AiIndex(view, nx, ny)] = c.s + 1;
								queue.push({ x: nx, y: ny, s: c.s + 1 });
							}
						}
					}
				});
			});
		}

		// (an aggressive bot digs where it gets it closer to somebody)
		var gapTo = function(x, y)
		{
			var g = Infinity;

			for (var n = 0; n < targets.length; ++n)
				g = Math.min(g, Math.abs(targets[n].x - x) + Math.abs(targets[n].y - y));

			return g;
		};

		var wallBonus = function(x, y)
		{
			if (!level.WallSlope || !targets.length)
				return level.WallBonus;

			return level.WallBonus + level.WallSlope * gapTo(x, y);
		};

		// Bricks with a power-up showing through a chip: tile index -> { bonus, range } (the same rules as a power-up lying about)
		var shown = {};

		(view.shown || []).forEach(function(b)
		{
			if (level.PowerRange > 0 && !(level.AvoidBadLuck && b.type == 5) && !(AI_COOP_ITEMS && campaign && AiHumanNearer(view, me, b.x, b.y)))
				shown[AiIndex(view, b.x, b.y)] = b.type == 3 && level.Kicks ? { bonus: level.ShownPush || AI_SHOWN_PUSH, range: Math.max(level.PowerRange, 12) } : { bonus: level.ShownBonus || AI_SHOWN_BONUS, range: level.PowerRange };
		});

		// what bombing brick (x, y) from tile i is worth (lower is better)
		var brickBonus = function(x, y, i)
		{
			var loot = shown[AiIndex(view, x, y)];

			return wallBonus(x, y) - (loot && reach.steps[i] <= loot.range ? loot.bonus : 0);
		};

		if (AI_DIG_SCORE)
		{
			// Digging spots by what one bomb there clears: every soft wall (and ice block) its blast reaches counts, so a bot
			// prefers the spot that opens up most. (Reachable tiles only: that is where a bot can bomb from.)
			var iceSet = AiCellSet(view, view.ice || []);

			reach.order.forEach(function(i)
			{
				var x = i % view.w, y = Math.floor(i / view.w);
				var bricks = 0, nearest = Infinity;

				for (var d = 1; d <= 4; ++d)
				{
					for (var r = 1; r <= me.power; ++r)
					{
						var cx = x + AI_DIRS[d][0] * r, cy = y + AI_DIRS[d][1] * r;
						var ch = AiWall(view, cx, cy);

						if (ch == "1" || iceSet[AiIndex(view, cx, cy)])
						{
							++bricks;
							nearest = Math.min(nearest, ch == "1" ? brickBonus(cx, cy, i) : wallBonus(cx, cy));

							if (!me.superBomb || ch != "1")
								break;
						}
						else if (ch != " ")
							break;
					}
				}

				if (bricks)
					add(x, y, "wall", nearest - AI_DIG_EXTRA * (bricks - 1), 999);
			});
		}
		else
		{
			for (var y = 0; y < view.h; ++y)
				for (var x = 0; x < view.w; ++x)
					if (AiWall(view, x, y) == "1")
						for (var d = 1; d <= 4; ++d)
							add(x + AI_DIRS[d][0], y + AI_DIRS[d][1], "wall", brickBonus(x, y, AiIndex(view, x + AI_DIRS[d][0], y + AI_DIRS[d][1])), 999);

			// ice blocks break in a blast too (one that cannot be pushed may be all that seals a bot in)
			(view.ice || []).forEach(function(c)
			{
				for (var d = 1; d <= 4; ++d)
					add(c.x + AI_DIRS[d][0], c.y + AI_DIRS[d][1], "wall", wallBonus(c.x, c.y), 999);
			});
		}

		// Stalk: spots where a bomb dropped on arrival would very likely catch a walking enemy (it arrives in `steps` steps, the
		// bomb goes off 2 s later). The attack check above bombs for real when the bot is there and it still looks good.
		if (level.Stalk && campaign && AI_STALK_GOALS)
		{
			var fcs2 = AiEnemyForecasts(view, me);

			if (fcs2.length)
			{
				for (var n3 = 1; n3 < reach.order.length; ++n3)
				{
					var i3 = reach.order[n3], s3 = reach.steps[i3];

					if (s3 > 8)
						break;

					var cells3 = AiBlastCells(view, { x: i3 % view.w, y: Math.floor(i3 / view.w), power: me.power, superBomb: me.superBomb });
					var chance = AiStalkChance(fcs2, cells3.map(function(c) { return { i: AiIndex(view, c.x, c.y), b: s3 * opts.step + AI_BOMB_SECONDS }; }));

					if (chance >= AI_STALK_CHANCE)
						add(i3 % view.w, Math.floor(i3 / view.w), "stalk", level.HuntBonus - 1 - 3 * chance, 8);
				}
			}
		}

		// Ambush: beside the route of an enemy riding a carpet (never on it - it would run into us), to bomb when the
		// timing is right (the attack check decides; until then the bot waits there).
		if (level.Ambush)
		{
			targets.forEach(function(t)
			{
				if (!t.track || t.track.length < 2)
					return;

				var route = AiCellSet(view, t.track);

				t.track.forEach(function(p)
				{
					AiBlastCells(view, { x: p.x, y: p.y, power: me.power, superBomb: me.superBomb }).forEach(function(c)
					{
						if (!route[AiIndex(view, c.x, c.y)])
							add(c.x, c.y, "ambush", level.HuntBonus + 1, level.HuntRange);
					});
				});
			});
		}

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

				if (fx.safe && AiHitsTargets(view, targets, fx.after, danger) && !(campaign && AiHurtsTeammate(view, me, fx.sooner)))
					add(spot.x, spot.y, "remote", level.HuntBonus - 1, 999);
			}
		}
	}

	var best = -1, bestCost = Infinity, cands = [];

	reach.order.forEach(function(i)
	{
		var g = goals[i];
		var s = reach.steps[i];

		if (!g || s > g.range)
			return;

		if (s == 0 && (g.kind == "item" || g.kind == "key" || (g.kind != "ambush" && g.kind != "skull" && g.kind != "stalk" && !(g.kind == "wall"&& hereWallOk !== undefined ? hereWallOk : hereOk))))
			return;

		// (the goal of the last plan costs a little less: two goals about as good must not take turns - that is jitter)
		cands.push({ i: i, cost: s + g.bonus - (AiRemembered(me, i, g.kind) ? AI_STICKY : 0) + AiTurnCost(me, reach.first[i]) + (campaign ? AiClaimCost(view, me, i, g.kind, s) : 0) });
	});

	// cheapest first (ties: nearest first - the sort keeps the order of the search)
	cands.sort(function(a, b) { return a.cost - b.cost; });

	for (var c = 0, checks = 0; c < cands.length; ++c)
	{
		var g = goals[cands[c].i];

		if (AI_GOAL_CHECKS && reach.steps[cands[c].i] > 0 && AI_BOMB_GOALS[g.kind])
		{
			if (checks >= AI_GOAL_CHECKS)
				continue;

			++checks;

			var at = { x: cands[c].i % view.w, y: Math.floor(cands[c].i / view.w), power: me.power, superBomb: me.superBomb };
			var fx = AiBombEffect(view, me, at, danger, opts, contested);

			if (!fx.safe || (campaign && AiHurtsTeammate(view, me, fx.sooner)) || AiBurnsLocked(view, at) || (g.kind == "wall" && fx.wasted))
				continue;
		}

		best = cands[c].i;
		bestCost = cands[c].cost;
		break;
	}

	var result = best < 0 ? null : { kind: goals[best].kind, kick: 0, path: AiTrace(view, reach, best), cost: bestCost };

	// Kicks: the stand tile is next to the bomb, so inside its blast for now - the path only has to get there in time.
	if (level.Kicks && me.kick)
	{
		AiKicks(view, me, danger, targets, false).forEach(function(k)
		{
			if (!k.hits || !k.standSafe || k.hurtsMate || AiKickFailed(me, k))
				return;

			var path = AiFindPath(view, me, function(x, y) { return x == k.x && y == k.y; }, danger, AiWith(opts, { avoid: opts.avoid }));
			var cost = path ? path.length + level.HuntBonus - 1 - (AiRemembered(me, AiIndex(view, k.x, k.y), "kick") ? AI_STICKY : 0) : Infinity;

			if (cost < (result ? result.cost : Infinity))
				result = { kind: "kick", kick: k.dir, path: path, cost: cost };
		});
	}

	// Campaign, nothing else to do: close in on the nearest enemy (to strike when it comes out), rather than freeze.
	// (An aggressive bot in a battle closes in on the nearest opponent.)
	if (!result && (campaign || level.Aggressive) && targets.length)
	{
		var gap = function(i)
		{
			var x = i % view.w, y = Math.floor(i / view.w);

			return Math.min.apply(null, targets.map(function(t) { return Math.abs(t.x - x) + Math.abs(t.y - y); }));
		};

		var closest = -1, closestGap = gap(reach.start);
		var ok = function(i) { return !((opts.avoid && opts.avoid[i]) || (shun && shun[i]) || danger[i] != Infinity); };

		reach.order.forEach(function(i)
		{
			if (!ok(i))
				return;

			if (gap(i) < closestGap)
			{
				closestGap = gap(i);
				closest = i;
			}
		});

		// (keep closing in on the tile of the last plan while it is about as close: targets move, a new tile every plan is jitter)
		var last = me.memory && me.memory.reason == "approach" && me.memory.goal ? AiIndex(view, me.memory.goal.x, me.memory.goal.y) : -1;

		if (closest >= 0 && last >= 0 && last != reach.start && reach.steps[last] !== undefined && ok(last) && gap(last) <= closestGap + 1)
			closest = last;

		if (closest >= 0)
			result = { kind: "approach", kick: 0, path: AiTrace(view, reach, closest), cost: Infinity };
	}

	return result;
}

// One word for what a plan is about, for the HUD card of a CPU player (at most 9 letters).
function AiIntent(plan, view, me)
{
	var campaign = view.mode == "campaign";

	switch (plan.reason)
	{
		case "flee": return "FLEEING";
		case "evade": return "DODGING";
		case "separate": return "SPREAD";
		case "kick": return "KICKING";
		case "wall": return "DIGGING";
		case "item": return "LOOTING";
		case "key": return "KEYS";
		case "skull":
		case "skullpop": return "SKULL";
		case "wander":
		case "ambush": return "SEARCHING";
		case "approach": return campaign ? "SEARCHING" : "CHASING";
		case "idle": return me.bombs > 0 ? "SEARCHING" : "WAITING";
	}

	// a fight: against the enemies / opponents (hunt, attack, stalk, trap, pressure, remote, poke, cornered)
	if (campaign)
	{
		// ... close to a human: protecting them
		var guarding = view.enemies.some(function(e) { return AiNearHuman(view, me, e.x, e.y); });

		if (guarding)
			return "GUARDING";

		return plan.bomb ? "KILLING" : "HUNTING";
	}

	return plan.bomb ? "ATTACK" : "HUNTING";
}

// One planning step. me: { x, y, index, speed, power, bombs, superBomb, kick, offX, offY (how far off its tile's centre, in
// tiles), memory (optional, see AiRemembered) }; level: an AI_LEVELS entry; rng: () -> [0, 1).
// Returns { path: [tiles], bomb, kick (direction to walk into a bomb, optional), reason, target: { x, y, i } (where it leads) }.
function AiDecide(view, me, level, rng)
{
	var plan = AiPlan(view, me, level, rng);
	var end = plan.path.length ? plan.path[plan.path.length - 1] : (plan.path.goal || me);

	plan.target = { x: end.x, y: end.y, i: AiIndex(view, end.x, end.y) };
	plan.intent = AiIntent(plan, view, me);

	return plan;
}

function AiPlan(view, me, level, rng)
{
	var raw = view;

	if (view.mode == "battle" && AI_BATTLE_AGGRESSIVE)
		level = AiAggressive(level);

	view = AiSolidView(view, me.index, level.AvoidBadLuck);

	var fc = AiForecast(view);
	var danger = fc.danger;

	// Skulls to blow up for the power-up they turn into (a blast must get to a blinking skull before its time is up): a bot
	// that can do it does not run from the skull's reach meanwhile - its blast destroys the skull - so the skull is left out of
	// the danger it sees. Skulls that are about to go off, or that a bomb is already going to pop, are not left out.
	var poppable = [];

	if (level.Skulls && me.bombs > 0 && (view.skulls || []).length)
	{
		poppable = view.skulls.filter(function(s, i) { return s.time > AI_POP_MIN_TIME && !fc.popped[i]; });

		if (poppable.length)
		{
			var without = AiCopy(view);

			without.skulls = view.skulls.filter(function(s) { return poppable.indexOf(s) < 0; });
			danger = AiDangerMap(without);
		}
	}

	var here = AiIndex(view, me.x, me.y);
	var campaign = view.mode == "campaign";
	var zone = AiEnemyZone(view);
	var step = AI_TILE_SECONDS / Math.max(0.25, me.speed || 1);
	// (`slack`: a bot off its tile's centre may be that much later out of a tile, or sooner in one)
	var opts = { step: step, margin: level.Margin, avoid: zone, slack: Math.max(Math.abs(me.offX || 0), Math.abs(me.offY || 0)) * step,
		room: level.Wary ? AI_SAFE_ROOM : 1 };
	var targets = AiTargetTracks(view, AiTargets(view, me), me);

	// The game only drops a bomb on a tile nothing else solid (a bomb, a player, an enemy, ice) is on - another player
	// standing on the tile counts, though players do walk through each other.
	var tileTaken = !!AiObstacles(view)[here] || raw.players.some(function(p)
	{
		return !p.dead && p.index != me.index && (p.cover || [p]).some(function(c) { return c.x == me.x && c.y == me.y; });
	});

	// Players walk through each other, but a crowd on one tile is useless (nobody can bomb there) and moves in lockstep: keep
	// to tiles with nobody on them when there is a choice. `crowd`: tiles of the other players; `sharing`: those on our tile.
	var crowd = {}, sharing = [], crowded = false;

	view.players.forEach(function(p)
	{
		if (p.dead || p.index == me.index)
			return;

		(p.cover || [p]).forEach(function(c)
		{
			var i = AiIndex(view, c.x, c.y);

			if (i == here)
			{
				if (sharing.indexOf(p) < 0)
					sharing.push(p);
			}
			else
			{
				crowd[i] = true;
				crowded = true;
			}
		});
	});

	var plainOpts = opts;

	if (crowded)
	{
		var merged = {};

		for (var k in zone || {}) merged[k] = true;
		for (var k2 in crowd) merged[k2] = true;

		opts = AiWith(opts, { avoid: merged });
	}

	// Battle, careful bots: tiles an opponent can reach in a moment are no way out (it may bomb them shut)
	var contested = !campaign && level.Wary ? AiContested(raw, me, level.Wary) : null;

	// 1. Out of the way of a blast (Easy sometimes notices a slow one late)
	var threatened = danger[here] != Infinity;

	if (threatened && danger[here] > 0.6 && rng() < level.SkipDanger)
		threatened = false;

	if (threatened)
	{
		// Hard, with the push power-up: kicking the bomb away from here beats running (best if it hits somebody).
		if (level.Kicks && me.kick)
		{
			// (not a bomb we are still well into: the controller backs off until clear before it walks into it - a player still
			// overlapping a bomb cannot push it)
			var kicks = AiKicks(view, me, danger, targets, true).filter(function(k)
			{
				return k.x == me.x && k.y == me.y && k.after[here] == Infinity && !k.hurtsMate && !AiKickFailed(me, k) &&
					AI_DIRS[k.dir][0] * (me.offX || 0) + AI_DIRS[k.dir][1] * (me.offY || 0) <= 0.3;
			});

			kicks.sort(function(a, b) { return (b.hits ? 1 : 0) - (a.hits ? 1 : 0); });

			// (AI_KICK_DODGE "hits": only a kick that also hits somebody beats running)
			if (AI_KICK_DODGE == "hits")
				kicks = kicks.filter(function(k) { return k.hits; });

			if (kicks.length && AI_KICK_DODGE)
				return { path: [], bomb: false, kick: kicks[0].dir, reason: "kick" };
		}

		// Away from opponents first (battle); then a comfortable escape; then ignore enemies; then drop the safety margin
		// (tight, but it beats standing still).
		var tries = [opts, AiWith(opts, { avoid: null }), AiWith(opts, { margin: 0, avoid: null })];

		if (contested)
			tries.unshift(AiWith(opts, { avoid: contested }));

		for (var t = 0, esc = null; t < tries.length && !esc; ++t)
		{
			esc = AiEscape(view, me, danger, tries[t]);

			// Keep running for the tile of the last plan while it is still safe and about as close: a new way out every plan
			// (opponents move, bombs appear) makes a bot run to and fro.
			if (esc && me.memory && me.memory.reason == "flee" && me.memory.goal && me.memory.goal.i != AiIndex(view, esc.goal.x, esc.goal.y))
			{
				var gi = me.memory.goal.i;
				var same = AiEscapeSearch(view, me, danger, tries[t], tries[t].avoid, function(i) { return i == gi; });

				if (same && same.steps <= esc.steps + 1)
					esc = same;
			}
		}

		// (doomed: no way out as far as the forecast goes)
		return { path: esc || AiLastResort(view, me, danger, opts), bomb: false, reason: "flee", doomed: !esc };
	}

	// 1b. Standing on top of another player: step off to a free tile close by, away from them (not both the same way)
	if (sharing.length)
	{
		var reach = AiReach(view, me, danger, AiWith(opts, { avoid: zone, safeOnly: true }));
		var spot = -1, spotScore = -Infinity;

		reach.order.forEach(function(i)
		{
			var s = reach.steps[i];

			if (s < 1 || s > 2 || crowd[i] || (zone && zone[i]))
				return;

			var x = i % view.w, y = Math.floor(i / view.w);
			var away = Math.min.apply(null, sharing.map(function(p) { return Math.abs(p.x - x) + Math.abs(p.y - y); }));
			// (a good deal of luck in it: two bots on one tile, seeing the same thing, must not choose the same way - but once
			// chosen, a way is kept: a new roll every plan would only make them dither)
			var score = away * 2 - s + rng() * 4 + (AiRemembered(me, i, "separate") ? 10 : 0);

			if (score > spotScore)
			{
				spotScore = score;
				spot = i;
			}
		});

		if (spot >= 0)
			return { path: AiTrace(view, reach, spot), bomb: false, reason: "separate" };
	}

	var effect = me.bombs > 0 && !tileTaken ? AiBombEffect(view, me, me, danger, opts, contested) : null;
	var hereOk = !!effect && effect.safe && !(campaign && AiHurtsTeammate(view, me, effect.sooner)) && !AiBurnsLocked(view, me);

	// 1c. A blinking skull our bomb reaches, with the time to spare: blow it up
	if (hereOk && poppable.length)
	{
		var cells = AiCellSet(view, AiBlastCells(view, { x: me.x, y: me.y, power: me.power, superBomb: me.superBomb }));

		if (poppable.some(function(s) { return cells[AiIndex(view, s.x, s.y)]; }))
			return { path: [], bomb: true, reason: "skullpop" };
	}

	// 2. A target our bomb would reach (straight, through a chain, a drain or riding a carpet)
	if (hereOk && AiHitsTargets(view, targets, effect.after, danger))
		return { path: [], bomb: true, reason: "attack" };

	// 2a. Campaign: an enemy that walks into the blast before it is over - it is not there yet, but it will be
	if (hereOk && level.Stalk && campaign)
	{
		var fcs = AiEnemyForecasts(view, me), burning = [];

		if (fcs.length)
		{
			effect.after.forEach(function(b, i) { if (b != Infinity && b < danger[i]) burning.push({ i: i, b: b }); });

			if (AiStalkChance(fcs, burning) >= AI_STALK_CHANCE)
				return { path: [], bomb: true, reason: "stalk" };
		}
	}

	// 2b. Battle: a bomb that leaves an opponent nowhere to run
	if (hereOk && level.Traps && !campaign && AiTraps(raw, me, danger, effect))
		return { path: [], bomb: true, reason: "trap" };

	// 2c. Battle, aggressive: an opponent right next to us - a bomb to drive it back, take its room and cut its ways, as long as
	// ours is safe
	if (hereOk && level.Pressure && !campaign && view.players.some(function(p)
	{
		return !p.dead && p.index != me.index && Math.abs(p.x - me.x) + Math.abs(p.y - me.y) <= level.Pressure;
	}))
		return { path: [], bomb: true, reason: "pressure" };

	// 2d. Battle: not a place where one bomb from a nearby opponent would trap us - move to one that is not
	if (AI_REPOSITION && !campaign && level.Wary && AiTrapProne(raw, danger, me.x, me.y, me, opts))
	{
		var reach2 = AiReach(view, me, danger, AiWith(opts, { avoid: zone, safeOnly: true }));
		var tried2 = 0;

		for (var n2 = 1; n2 < reach2.order.length && tried2 < AI_PRONE_TRIES; ++n2)
		{
			var i2 = reach2.order[n2];

			if (crowd[i2] || (zone && zone[i2]))
				continue;

			++tried2;

			if (!AiTrapProne(raw, danger, i2 % view.w, Math.floor(i2 / view.w), me, opts))
				return { path: AiTrace(view, reach2, i2), bomb: false, reason: "reposition" };
		}
	}

	// 3. Campaign: do not hang around next to enemies
	if (zone && zone[here])
	{
		// (walking through the enemy's surroundings is the only way out of them)
		var away = AiEscape(view, me, danger, AiWith(opts, { avoid: null }), zone);

		if (away && away.length)
			return { path: away, bomb: false, reason: "evade" };

		// Cornered: the enemy hurts anyway, a bomb at least takes it along.
		if (effect && AiHitsAny(view, view.enemies, effect.sooner) && !AiHurtsTeammate(view, me, effect.sooner))
			return { path: [], bomb: true, reason: "cornered" };
	}

	// 4. The cheapest goal (arrived at a hunt / wall / remote spot: bomb; at a kick spot: kick)
	var shun = level.AvoidSight && campaign ? AiSight(view) : null;
	var hereWallOk = hereOk && !(effect && effect.wasted);
	var goal = AiChooseGoal(view, me, level, danger, opts, targets, hereOk, shun, poppable, contested, hereWallOk);

	// (boxed in by other players? then walk through them after all)
	if (!goal && crowded)
		goal = AiChooseGoal(view, me, level, danger, plainOpts, targets, hereOk, shun, poppable, contested, hereWallOk);

	// 4b. Restless (no bomb for a while) and nothing productive to do - a deterministic planner would wait forever in a
	// deadlock (an enemy jammed on a carpet, a target that never lines up): poke at a target close by, or move on.
	if (me.restless && (!goal || goal.kind == "approach" || goal.kind == "ambush"))
	{
		var close = targets.some(function(t) { return Math.abs(t.x - me.x) + Math.abs(t.y - me.y) <= 3; });

		if (hereOk && close)
			return { path: [], bomb: true, reason: "poke" };

		var wander = AiWander(view, me, danger, opts, shun, rng, me.memory && me.memory.reason == "wander" && me.memory.goal ? me.memory.goal.i : -1);

		if (wander)
			return { path: wander, bomb: false, reason: "wander" };
	}

	if (goal)
	{
		if (goal.path.length == 0 && goal.kick)
			return { path: [], bomb: false, kick: goal.kick, reason: "kick" };

		return { path: goal.path, bomb: goal.path.length == 0 && goal.kind != "ambush" && goal.kind != "approach" && goal.kind != "skull" && goal.kind != "stalk", reason: goal.kind };
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
	var x = Math.floor((player.X + player.Width / 2) / player.Width);
	var y = Math.floor((player.Y + player.Height / 2) / player.Height);

	return {
		x: x,
		y: y,
		offX: (player.X - x * player.Width) / player.Width,
		offY: (player.Y - y * player.Height) / player.Height,
		index: player.Index,
		speed: player.Speed || 1,
		power: (player.BadLuckFlags & 32) ? 1 : player.Power,
		bombs: (player.BadLuckFlags & 16) ? 0 : player.Bombs,
		superBomb: player.SuperBombsTime > 0,
		kick: player.PushableBombsTime > 0,
		dir: player.Direction || 0
	};
}

// Tile view of the running game for AiDecide (browser only: reads GameWorld, GameEntityManager, PlayerManager).
function AiBuildView(mode, roster)
{
	var bw = GameWorld.BlockWidth, bh = GameWorld.BlockHeight;
	var v = { w: GameWorld.WorldWidth, h: GameWorld.WorldHeight, walls: GameWorld.Walls, bombs: [], fire: [], blocked: [],
		ice: [], carpets: [], drains: [], lasers: [], shots: [], enemies: [], powerups: [], shown: [], skulls: [], keys: [], players: [],
		closing: [], keyFlags: PlayerManager.KeyFlags, mode: mode };

	// Battle: the cells of the arena about to close (sudden death), and when
	var game = typeof Engine != "undefined" ? Engine.Application : null;

	if (mode == "battle" && game && game.Battle && !game.RoundOver)
		v.closing = SuddenSchedule(game.BattleTime, game.SuddenTimer, game.SuddenIndex, game.SuddenOrder || SpiralOrder(v.w, v.h), AI_SUDDEN_HORIZON);

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
				t.pushable = true;   // (any bomb can be kicked by somebody who holds the kick power-up)
				t.dir = e.Direction || 0;
				t.cover = cover(e);
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
				t.cover = cover(e);
				v.ice.push(t);
				break;

			case "MagicCarpet":
				t.dir = e.MagicDirection;
				v.carpets.push(t);
				break;

			case "Enemy":
				t.cover = cover(e);
				t.type = e.EnemyType;
				t.dir = e.Direction || 0;
				t.speed = e.Speed || 1;
				t.moving = e.ShoopTimer <= 0;
				t.seek = !!e.SeekPlayer;
				t.fear = !!e.FearOfPlayer;
				v.enemies.push(t);

				// a charging laser fires when 0.5 s of the charge are left
				if (e.ShoopTimer > 0.5 && e.ShoopDir)
					v.lasers.push({ x: t.x, y: t.y, dir: e.ShoopDir, time: e.ShoopTimer - 0.5 });
				break;

			case "PowerUp":
				t.type = e.PowerUpType;
				t.locked = e.BotLock > 0;
				v.powerups.push(t);

				// a blinking skull is about to go off: seconds left
				if (e.PowerUpType == SKULL_TYPE && e.Age >= SKULL_BLINK_AFTER)
					v.skulls.push({ x: t.x, y: t.y, time: Math.max(0, SKULL_BLINK_AFTER + SKULL_FUSE - e.Age) });
				break;
		}
	});

	// bricks with a power-up showing through a chip
	var cracks = GameWorld.Cracks;

	if (cracks)
	{
		for (var k in cracks.tiles)
		{
			var c = cracks.tiles[k], bx = k % v.w, by = Math.floor(k / v.w);

			if (c.chip && c.pu >= 0 && v.walls[by] && v.walls[by][bx] == "1")
				v.shown.push({ x: bx, y: by, type: c.pu });
		}
	}

	PlayerManager.Players.forEach(function(p)
	{
		var t = tile(p);

		t.index = p.Index;
		t.dead = p.IsDead;
		t.power = p.Power;
		t.cover = cover(p);
		t.bot = !!(roster[p.Index] && roster[p.Index].Bot);

		if (!p.IsDead && AiBoard[p.Index])
			v.mates = (v.mates || []).concat([{ index: p.Index, x: AiBoard[p.Index].x, y: AiBoard[p.Index].y, reason: AiBoard[p.Index].reason }]);
		v.players.push(t);
	});

	return v;
}

var AI_RESTLESS_SECONDS = 8.0;

var AI_WORKER_PATIENCE = 0.5;   // seconds a worker may take over a plan before the bot plans for itself instead

// Drives one Player: plans every level.ThinkMs (and whenever a new bomb appears), then steers tile by tile.
// env: { View: () -> view, BombCount: () -> number of bombs in the world, Threads: () -> may the planning run in a worker? (optional) }
// makeWorker (optional): () -> a worker running AiWorkerCore (Game/AiWorker.js; postMessage / onmessage / onerror / terminate).
// With one, the bot plans in its own thread: it sends the view, goes on with its old plan, and takes the new one when it is
// back (a frame or two later). Without one - or in turbo, or if the worker fails or stalls - it plans right here, which is
// repeatable with a seeded rng (Sim, the headless bench, the tests).
function AiController(levelName, rng, makeWorker)
{
	var level = AI_LEVELS[levelName] || AI_LEVELS.normal;
	var random = rng || Math.random;

	var owner = null, path = [], wantBomb = false, kickDir = 0, kickFor = 0, kickPhase = 0, kickAlign = 0, kickAt = null;
	var thinkIn = 0, lastBombs = 0, deadFor = 0, stuckFor = 0, lastX = null, lastY = null;
	var sinceBomb = 0;   // seconds alive without dropping a bomb (restless after AI_RESTLESS_SECONDS)
	var committed = false;   // walking a wander path: keep it until it is done (re-rolling it would only jitter)
	var clock = 0;
	var memory = { goal: null, reason: null, now: 0, kicks: [] };   // what the planner remembers between plans (AiRemembered)
	var self_ = this;
	var worker = null, broken = false;
	var planId = 0, pending = null;   // the request out: { id, x, y (the tile the bot was on), at (clock) }
	var arrived = null;               // its answer, taken up by the next Update
	var inPlace = false;              // the worker was too slow: the next plan is made here
	var replan = false;               // a new bomb came while a request was out: plan again as soon as it is back

	this.Level = levelName;

	// What the bot is up to, in a word (for the HUD)
	this.Intent = "";

	function abandon()
	{
		pending = null;
		arrived = null;
		replan = false;
	}

	function useWorker(env)
	{
		if (!makeWorker || broken || !(env.Threads ? env.Threads() : true))
			return false;

		if (!worker)
		{
			try
			{
				worker = makeWorker();
				worker.onmessage = function(e)
				{
					var m = e.data;

					if (m && m.t == "plan")
						arrived = m;
					else if (m && m.t == "error")
						broken = true;
				};
				worker.onerror = function() { broken = true; };
			}
			catch (err)
			{
				broken = true;
				worker = null;
				return false;
			}
		}

		return true;
	}

	this.Dispose = function()
	{
		if (owner)
			delete AiBoard[owner.Index];

		if (worker)
		{
			worker.onmessage = null;
			worker.onerror = null;

			if (worker.terminate)
				worker.terminate();
		}

		worker = null;
		abandon();
	}

	// Take over a plan (made here, or by the worker)
	function adopt(plan)
	{
		self_.LastPlan = plan;
		self_.Intent = plan.intent || "";

		if (plan.target && owner)
			AiBoard[owner.Index] = { x: plan.target.x, y: plan.target.y, reason: plan.reason };
		memory.goal = plan.target || null;
		memory.reason = plan.reason;
		path = plan.path;
		committed = plan.reason == "wander";
		wantBomb = plan.bomb;

		// (a kick under way is not dropped for the same kick)
		if ((plan.kick || 0) != kickDir)
		{
			kickDir = plan.kick || 0;
			kickPhase = 0;
			kickAlign = 0;
		}

		thinkIn = level.ThinkMs / 1000;
	}

	// A plan from the worker was made for where the bot was then. Still good if it is on the same tile; on the way along the
	// path it is cut down to what is left; a bomb or a kick is only meant for the tile it was planned on. Else: plan again.
	function fresh(plan, from, now)
	{
		if (now.x == from.x && now.y == from.y)
			return true;

		if (plan.bomb || plan.kick)
			return false;

		for (var i = 0; i < plan.path.length; ++i)
			if (plan.path[i].x == now.x && plan.path[i].y == now.y)
			{
				plan.path = plan.path.slice(i + 1);
				return true;
			}

		return false;
	}

	this.Update = function(delta, player, env)
	{
		var act = { Dir: 0, Bomb: false, BombPressed: false };

		// A new level creates new Player entities: start over.
		if (player !== owner)
		{
			owner = player;
			abandon();
			path = [];
			wantBomb = false;
			kickDir = 0;
			thinkIn = deadFor = stuckFor = sinceBomb = 0;
			memory = { goal: null, reason: null, now: clock, kicks: [] };
		}

		clock += delta;

		if (player.IsDead)
		{
			this.Intent = "";
			delete AiBoard[player.Index];
			abandon();
			path = [];
			wantBomb = false;
			kickDir = 0;
			thinkIn = 0;
			deadFor += delta;
			memory.goal = null;

			if (player.Lifes > 0 && deadFor >= 1.0)
			{
				deadFor = 0;
				act.BombPressed = true;
			}

			return act;
		}

		deadFor = 0;
		sinceBomb += delta;

		var bombs = env.BombCount();

		thinkIn -= delta;

		var threaded = useWorker(env);

		// An answer from the worker
		if (pending && (!threaded || clock - pending.at > AI_WORKER_PATIENCE))
		{
			// (the worker is gone, or stuck: this time the bot thinks for itself)
			abandon();
			inPlace = true;
			thinkIn = 0;
		}
		else if (pending && arrived)
		{
			var answer = arrived, from = pending;

			pending = null;
			arrived = null;

			if (answer.id == from.id && fresh(answer.plan, from, AiSelf(player)))
				adopt(answer.plan);
			else
				thinkIn = 0;   // (outdated: ask again)
		}

		if (pending && bombs > lastBombs)
			replan = true;

		// (a new bomb always means a new plan; a wander path is kept until done or stuck)
		if (!pending && ((thinkIn <= 0 && !(committed && path.length)) || bombs > lastBombs || replan))
		{
			var self = AiSelf(player);
			var view = env.View();

			replan = false;
			self.restless = sinceBomb > (view.mode == "battle" ? AI_BATTLE_RESTLESS_SECONDS : AI_RESTLESS_SECONDS);
			memory.now = clock;
			memory.kicks = memory.kicks.filter(function(k) { return clock - k.t < AI_KICK_RETRY; });
			self.memory = memory;

			if (threaded && !inPlace)
			{
				pending = { id: ++planId, x: self.x, y: self.y, at: clock };
				worker.postMessage({ t: "plan", id: pending.id, view: view, me: self, level: levelName });
			}
			else
			{
				inPlace = false;
				adopt(AiDecide(view, self, level, random));
			}
		}

		lastBombs = bombs;

		var tw = player.Width, th = player.Height;

		if (kickDir)
		{
			// A kick: walking into the bomb sets it sliding - but only from clear of it (a player still overlapping the bomb
			// cannot push it). So first back off until clear, then walk into it for a moment.
			var me = AiSelf(player);
			var into = AI_DIRS[kickDir][0] * (player.X - me.x * tw) + AI_DIRS[kickDir][1] * (player.Y - me.y * th);   // px

			if (kickPhase == 0)
			{
				kickAlign += delta;

				if (into > 0 && kickAlign < 0.35)
					act.Dir = kickDir > 2 ? kickDir - 2 : kickDir + 2;
				else
				{
					kickPhase = 1;
					kickFor = 0.06 + Math.max(0, -into) * 0.01 / Math.max(0.5, player.Speed || 1);
					kickAt = { x: me.x + AI_DIRS[kickDir][0], y: me.y + AI_DIRS[kickDir][1], dir: kickDir };
				}
			}

			if (kickPhase == 1)
			{
				act.Dir = kickDir;
				kickFor -= delta;

				if (kickFor <= 0)
				{
					// (if the bomb is still there next time, this kick did not work: AiKickFailed)
					kickAt.t = clock;
					memory.kicks.push(kickAt);
					kickDir = 0;
					kickPhase = 0;
					thinkIn = 0;
				}
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
				sinceBomb = 0;
			}
		}
		else
		{
			var walking = path.length > 0;

			while (path.length && AiSteer(player.X, player.Y, path[0].x * tw, path[0].y * th, 1) == 0)
				path.shift();

			// (there: what next? - at once, a way out may only have led to a spot to wait on)
			if (walking && !path.length)
				thinkIn = 0;

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
		AI_LEVELS: AI_LEVELS, AiDecide: AiDecide, AiIntent: AiIntent, AiTargetTracks: AiTargetTracks, AiContested: AiContested, AiSteer: AiSteer, AiSelf: AiSelf, AiController: AiController
	};
