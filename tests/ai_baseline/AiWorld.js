// What computer players know about the world: a tile "view" of it (built by AiBuildView in AiBrain.js) and the
// blast forecast - when each tile will burn, following bombs that ride magic carpets or slide after a kick,
// drains passing blasts on, frozen bombs in ice, chain reactions, enemy lasers and fire shots.
// Pure: no DOM, no game globals.

var AI_TILE_SECONDS = 0.17;     // one tile at speed 1 (17 px, one pixel per 10 ms step): players, kicked bombs, shots
var AI_CARPET_SECONDS = 0.08;   // magic carpets carry a bomb across a tile about twice as fast (measured)
var AI_BOMB_SECONDS = 2.0;      // Bomb.ExplosionTime
var AI_SKULL_REACH = 5;         // a skull that blows up has a reach of 1-5: plan for the worst
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

// What is worked out about a view is kept on the view (`__memo`) for as long as the lists it was worked out from are the
// very same arrays: the planner asks for the same maps again and again (every path search, every forecast).
// (`len` also catches something pushed onto one of them.) The results are shared: do not change them.
function AiMemo(view, name, a, b, c, d, len, make)
{
	var memo = view.__memo || (view.__memo = {});
	var m = memo[name];

	if (m && m.a === a && m.b === b && m.c === c && m.d === d && m.len === len)
		return m.value;

	m = memo[name] = { a: a, b: b, c: c, d: d, len: len, value: make() };

	return m.value;
}

// Sudden death (battle): the tiles that close for good, with the time they do: index -> seconds (view.closing: [{ x, y, t }]).
function AiClosingMap(view)
{
	return AiMemo(view, "closing", view.closing, view.w, null, null, (view.closing || []).length, function()
	{
		var map = {};

		(view.closing || []).forEach(function(c)
		{
			var i = AiIndex(view, c.x, c.y);

			if (map[i] === undefined || c.t < map[i])
				map[i] = c.t;
		});

		return map;
	});
}

// Tiles taken by something solid right now: bombs, ice blocks and other obstacles (`blocked`): index -> true.
// Something stuck between two tiles (`cover`: the tiles its body overlaps) takes both.
function AiStaticObstacles(view)
{
	return AiMemo(view, "static", view.bombs, view.blocked, view.ice, view.w, view.bombs.length + view.blocked.length + (view.ice || []).length, function()
	{
		var map = {};

		view.bombs.concat(view.blocked, view.ice || []).forEach(function(b)
		{
			(b.cover || [b]).forEach(function(c) { map[AiIndex(view, c.x, c.y)] = true; });
		});

		return map;
	});
}

// Magic carpets: index -> direction
function AiCarpetMap(view)
{
	return AiMemo(view, "carpets", view.carpets, view.w, null, null, (view.carpets || []).length, function()
	{
		var carpets = {};

		(view.carpets || []).forEach(function(c) { carpets[AiIndex(view, c.x, c.y)] = c.dir; });

		return carpets;
	});
}

// Tiles to keep out of: what is solid now, plus every tile of the way a bomb rides (on a carpet) or slides (kicked) -
// it is solid all along, and may well stop in the only way out.
function AiObstacles(view)
{
	return AiMemo(view, "obstacles", view.bombs, view.blocked, view.ice, view.carpets, view.bombs.length + view.blocked.length + (view.ice || []).length + (view.carpets || []).length, function()
	{
		var stops = AiStaticObstacles(view);
		var carpets = AiCarpetMap(view);
		var map = {};

		for (var k in stops)
			map[k] = true;

		view.bombs.forEach(function(b)
		{
			if (!b.dir && carpets[AiIndex(view, b.x, b.y)] === undefined)
				return;

			AiBombTrack(view, b, stops, carpets).forEach(function(p) { map[AiIndex(view, p.x, p.y)] = true; });
		});

		return map;
	});
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
		if (k != "__memo")
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
var aiCalm = [];   // (bench speed-up only: same results as filling the array)

function AiForecast(view)
{
	var size = view.w * view.h, i;

	if (aiCalm.length != size)
	{
		aiCalm = [];

		for (i = 0; i < size; ++i)
			aiCalm.push(Infinity);
	}

	var danger = aiCalm.slice();

	var stops = AiStaticObstacles(view);
	var carpets = AiCarpetMap(view);
	var drains = view.drains || [];
	var events = [];

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
							cells = cells.concat(AiBlastCells(view, { x: d.x, y: d.y, power: b.power, superBomb: b.superBomb }));
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

	// A blinking skull power-up is about to blow up (reach 1-5) or break open into an enemy: either way its tile and,
	// at worst, a cross of AI_SKULL_REACH around it is no place to be. A blast that reaches it first destroys it quietly.
	(view.skulls || []).forEach(function(s)
	{
		events.push({ t: s.time, skull: s, cells: function() { return AiBlastCells(view, { x: s.x, y: s.y, power: AI_SKULL_REACH }); } });
	});

	view.fire.forEach(function(f)
	{
		events.push({ t: 0, cells: function() { return [f]; } });
	});

	// a closing arena cell blasts whatever stands on it (and sets bombs off) when it shuts
	(view.closing || []).forEach(function(c)
	{
		events.push({ t: c.t, cells: function() { return [c]; } });
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
			if (!e.done && e.skull && e.t > next.t && hit[AiIndex(view, e.skull.x, e.skull.y)])
			{
				e.done = true;
				e.cancelled = true;   // destroyed before its time: it will turn into a power-up
			}
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
		// per view.skulls: will a blast reach it before its time is up (a bomb already out, a chain, ...)?
		popped: (view.skulls || []).map(function(s) { return events.some(function(e) { return e.skull === s && e.cancelled; }); }),
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
		AI_TILE_SECONDS: AI_TILE_SECONDS, AI_CARPET_SECONDS: AI_CARPET_SECONDS, AI_BOMB_SECONDS: AI_BOMB_SECONDS, AI_SKULL_REACH: AI_SKULL_REACH,
		AI_FIRE_SECONDS: AI_FIRE_SECONDS, AI_DIRS: AI_DIRS,
		AiInside: AiInside, AiWall: AiWall, AiIndex: AiIndex, AiFloor: AiFloor, AiObstacles: AiObstacles,
		AiStaticObstacles: AiStaticObstacles, AiClosingMap: AiClosingMap, AiCarpetMap: AiCarpetMap, AiCellSet: AiCellSet,
		AiCopy: AiCopy, AiLine: AiLine, AiBlastCells: AiBlastCells, AiBombTrack: AiBombTrack, AiTrackAt: AiTrackAt,
		AiForecast: AiForecast, AiDangerMap: AiDangerMap
	};
