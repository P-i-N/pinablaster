// Computer players (CPU). AiDecide plans on the tile view and blast forecast of AiWorld.js; AiController turns
// its plans into the actions Input.Player() returns. AiBuildView builds the view from the running game.

// Node (tests): the world model lives in AiWorld.js (index.html loads it first in the browser)
if (typeof module !== 'undefined')
	Object.assign(global, require('./AiWorld.js'));

var AI_LEVELS =
{
	easy:   { Name: "Easy",   ThinkMs: 400, Margin: 0.35, SkipDanger: 0.2, HuntRange: 4,   HuntBonus: 2, WallBonus: 0, PowerRange: 0,   AvoidBadLuck: false,
	          Remote: false, Traps: false, Kicks: false, AvoidSight: false, Ambush: false, Skulls: false, Wary: 0 },
	normal: { Name: "Normal", ThinkMs: 150, Margin: 0.25, SkipDanger: 0,   HuntRange: 8,   HuntBonus: 2, WallBonus: 6, PowerRange: 5,   AvoidBadLuck: true,
	          Remote: true,  Traps: true,  Kicks: true,  AvoidSight: true,  Ambush: true,  Skulls: true,  Wary: 2 },
	hard:   { Name: "Hard",   ThinkMs: 50,  Margin: 0.15, SkipDanger: 0,   HuntRange: 999, HuntBonus: 0, WallBonus: 8, PowerRange: 999, AvoidBadLuck: true,
	          Remote: true,  Traps: true,  Kicks: true,  AvoidSight: true,  Ambush: true,  Skulls: true,  Wary: 2 }
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
	var steps = {}, prev = {}, order = [start];

	steps[start] = 0;
	prev[start] = -1;

	if (isGoal && isGoal(from.x, from.y))
		return { order: order, steps: steps, prev: prev, start: start, found: start };

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

			// a tile that closes for good is no way through unless we are across before it shuts
			if (closing[ni] !== undefined && !((s + 0.5) * opts.step + opts.margin < closing[ni]))
				continue;

			if (burn != Infinity && opts.safeOnly)
				continue;

			if (burn != Infinity && !((s + 0.5) * opts.step + opts.margin < burn || (s - 0.5) * opts.step > burn + AI_FIRE_SECONDS))
				continue;

			steps[ni] = s;
			prev[ni] = cur;
			order.push(ni);

			if (isGoal && isGoal(nx, ny))
				return { order: order, steps: steps, prev: prev, start: start, found: ni };
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
	var reach = AiReach(view, from, danger, opts, isGoal);

	return reach.found === undefined ? null : AiTrace(view, reach, reach.found);
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

	return {
		view: v, after: after, sooner: AiSooner(after, danger),
		safe: AiEscape(v, at, after, { step: opts.step, margin: opts.margin, avoid: avoid || null }) !== null
	};
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
// reliably. (Laser enemies charge for 2.5 s first; the forecast handles them. Shunning their lines too left bots idle.)
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

			list.push({ x: sx, y: sy, dir: d, after: after, hits: AiHitsTargets(view, targets, after, danger),
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

// Somewhere else to be: a random safe tile 3-8 steps away (not next to an enemy, not in a line of fire).
function AiWander(view, me, danger, opts, shun, rng)
{
	var reach = AiReach(view, me, danger, { step: opts.step, margin: opts.margin, avoid: opts.avoid, safeOnly: true });
	var spots = reach.order.filter(function(i)
	{
		var s = reach.steps[i];

		return s >= 3 && s <= 8 && !(opts.avoid && opts.avoid[i]) && !(shun && shun[i]);
	});

	if (!spots.length)
		return null;

	return AiTrace(view, reach, spots[Math.min(spots.length - 1, Math.floor(rng() * spots.length))]);
}

// Cheapest reachable goal (steps + bonus): power-ups, keys, spots with a target in blast line, spots from which a
// bomb reaches a target through a drain or on a carpet, kicks, spots next to a soft wall. Goals on the bot's own
// tile only count when bombing there is fine (hereOk). `shun`: tiles never to wait on (line of fire).
function AiChooseGoal(view, me, level, danger, opts, targets, hereOk, shun, poppable)
{
	var campaign = view.mode == "campaign";
	var reach = AiReach(view, me, danger, { step: opts.step, margin: opts.margin, avoid: opts.avoid, safeOnly: true });
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
		if (level.PowerRange > 0 && !p.locked && !(level.AvoidBadLuck && p.type == 5))
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
			AiBlastCells(view, { x: t.x, y: t.y, power: me.power, superBomb: me.superBomb }).forEach(function(c)
			{
				add(c.x, c.y, "hunt", level.HuntBonus, level.HuntRange);
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
		var wallBonus = function(x, y)
		{
			if (!level.WallSlope || !targets.length)
				return level.WallBonus;

			return level.WallBonus + level.WallSlope * Math.min.apply(null, targets.map(function(t) { return Math.abs(t.x - x) + Math.abs(t.y - y); }));
		};

		for (var y = 0; y < view.h; ++y)
			for (var x = 0; x < view.w; ++x)
				if (AiWall(view, x, y) == "1")
					for (var d = 1; d <= 4; ++d)
						add(x + AI_DIRS[d][0], y + AI_DIRS[d][1], "wall", wallBonus(x, y), 999);

		// ice blocks break in a blast too (one that cannot be pushed may be all that seals a bot in)
		(view.ice || []).forEach(function(c)
		{
			for (var d = 1; d <= 4; ++d)
				add(c.x + AI_DIRS[d][0], c.y + AI_DIRS[d][1], "wall", wallBonus(c.x, c.y), 999);
		});

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

	var best = -1, bestCost = Infinity;

	reach.order.forEach(function(i)
	{
		var g = goals[i];
		var s = reach.steps[i];

		if (!g || s > g.range)
			return;

		if (s == 0 && (g.kind == "item" || g.kind == "key" || (g.kind != "ambush" && g.kind != "skull" && !hereOk)))
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

		reach.order.forEach(function(i)
		{
			if ((opts.avoid && opts.avoid[i]) || (shun && shun[i]) || danger[i] != Infinity)
				return;

			if (gap(i) < closestGap)
			{
				closestGap = gap(i);
				closest = i;
			}
		});

		if (closest >= 0)
			result = { kind: "approach", kick: 0, path: AiTrace(view, reach, closest), cost: Infinity };
	}

	return result;
}

// One planning step. me: { x, y, index, speed, power, bombs, superBomb, kick }; level: an AI_LEVELS entry; rng: () -> [0, 1).
// Returns { path: [tiles], bomb, kick (direction to walk into a bomb, optional), reason }.
function AiDecide(view, me, level, rng)
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
	var opts = { step: AI_TILE_SECONDS / Math.max(0.25, me.speed || 1), margin: level.Margin, avoid: zone };
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

		opts = { step: opts.step, margin: opts.margin, avoid: merged };
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
			var kicks = AiKicks(view, me, danger, targets).filter(function(k)
			{
				return k.x == me.x && k.y == me.y && k.after[here] == Infinity && !k.hurtsMate;
			});

			kicks.sort(function(a, b) { return (b.hits ? 1 : 0) - (a.hits ? 1 : 0); });

			if (kicks.length)
				return { path: [], bomb: false, kick: kicks[0].dir, reason: "kick" };
		}

		// Away from opponents first (battle); then a comfortable escape; then ignore enemies; then drop the safety margin
		// (tight, but it beats standing still).
		var esc = (contested && AiEscape(view, me, danger, { step: opts.step, margin: opts.margin, avoid: contested })) ||
			AiEscape(view, me, danger, opts) ||
			AiEscape(view, me, danger, { step: opts.step, margin: opts.margin, avoid: null }) ||
			AiEscape(view, me, danger, { step: opts.step, margin: 0, avoid: null });

		return { path: esc || [], bomb: false, reason: "flee" };
	}

	// 1b. Standing on top of another player: step off to a free tile close by, away from them (not both the same way)
	if (sharing.length)
	{
		var reach = AiReach(view, me, danger, { step: opts.step, margin: opts.margin, avoid: zone, safeOnly: true });
		var spot = -1, spotScore = -Infinity;

		reach.order.forEach(function(i)
		{
			var s = reach.steps[i];

			if (s < 1 || s > 2 || crowd[i] || (zone && zone[i]))
				return;

			var x = i % view.w, y = Math.floor(i / view.w);
			var away = Math.min.apply(null, sharing.map(function(p) { return Math.abs(p.x - x) + Math.abs(p.y - y); }));
			// (a good deal of luck in it: two bots on one tile, seeing the same thing, must not choose the same way)
			var score = away * 2 - s + rng() * 4;

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
	var shun = level.AvoidSight && campaign ? AiSight(view) : null;
	var goal = AiChooseGoal(view, me, level, danger, opts, targets, hereOk, shun, poppable);

	// (boxed in by other players? then walk through them after all)
	if (!goal && crowded)
		goal = AiChooseGoal(view, me, level, danger, plainOpts, targets, hereOk, shun, poppable);

	// 4b. Restless (no bomb for a while) and nothing productive to do - a deterministic planner would wait forever in a
	// deadlock (an enemy jammed on a carpet, a target that never lines up): poke at a target close by, or move on.
	if (me.restless && (!goal || goal.kind == "approach" || goal.kind == "ambush"))
	{
		var close = targets.some(function(t) { return Math.abs(t.x - me.x) + Math.abs(t.y - me.y) <= 3; });

		if (hereOk && close)
			return { path: [], bomb: true, reason: "poke" };

		var wander = AiWander(view, me, danger, opts, shun, rng);

		if (wander)
			return { path: wander, bomb: false, reason: "wander" };
	}

	if (goal)
	{
		if (goal.path.length == 0 && goal.kick)
			return { path: [], bomb: false, kick: goal.kick, reason: "kick" };

		return { path: goal.path, bomb: goal.path.length == 0 && goal.kind != "ambush" && goal.kind != "approach" && goal.kind != "skull", reason: goal.kind };
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
		ice: [], carpets: [], drains: [], lasers: [], shots: [], enemies: [], powerups: [], skulls: [], keys: [], players: [],
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

var AI_RESTLESS_SECONDS = 8.0;

// Drives one Player: plans every level.ThinkMs (and whenever a new bomb appears), then steers tile by tile.
// env: { View: () -> view, BombCount: () -> number of bombs in the world }
function AiController(levelName, rng)
{
	var level = AI_LEVELS[levelName] || AI_LEVELS.normal;
	var random = rng || Math.random;

	var owner = null, path = [], wantBomb = false, kickDir = 0, kickFor = 0;
	var thinkIn = 0, lastBombs = 0, deadFor = 0, stuckFor = 0, lastX = null, lastY = null;
	var sinceBomb = 0;   // seconds alive without dropping a bomb (restless after AI_RESTLESS_SECONDS)
	var committed = false;   // walking a wander path: keep it until it is done (re-rolling it would only jitter)

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
			thinkIn = deadFor = stuckFor = sinceBomb = 0;
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
		sinceBomb += delta;

		var bombs = env.BombCount();

		thinkIn -= delta;

		// (a new bomb always means a new plan; a wander path is kept until done or stuck)
		if ((thinkIn <= 0 && !(committed && path.length)) || bombs > lastBombs)
		{
			var self = AiSelf(player);
			var view = env.View();

			self.restless = sinceBomb > (view.mode == "battle" ? AI_BATTLE_RESTLESS_SECONDS : AI_RESTLESS_SECONDS);

			var plan = AiDecide(view, self, level, random);

			path = plan.path;
			committed = plan.reason == "wander";
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
				sinceBomb = 0;
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
		AI_LEVELS: AI_LEVELS, AiDecide: AiDecide, AiTargetTracks: AiTargetTracks, AiContested: AiContested, AiSteer: AiSteer, AiSelf: AiSelf, AiController: AiController
	};
