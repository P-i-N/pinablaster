// Campaign levels: maps, names and hints, plus a checker that every level can be finished.
// Pure: no DOM, no game globals.
//
// Tiles: " " floor, "0" "2" walls, "3" void, "1" brick
//        "a".."g" enemies: Dumballoon, Mop on meth, Shoop-da-whoop, Drakentus, Flamie, Blowfrog, Angry 4channer
//        "P" player 1 spawn (default: top-left corner; the others mirror it), "i" ice block, "I" ice with a frozen bomb
//        "#" drain, "^" ">" "," "<" magic carpets (up, right, down, left)
//        "T" "H" "N" "U" keys for the doors "A" "B" "C" "D"
// Over: [x, y, tile] for an enemy or ice block standing on a carpet or drain (a map tile holds one character only).

var CAMPAIGN_LEVELS =
[
	{
		Name: "FIRST STEPS",
		Hint: "Bomb the bricks, pop the balloons!",
		Map:
		[
			"200000000000000000000000002",
			"0     11 11     11 11     0",
			"0 0 0 010 0 0 0 0 010 0 0 0",
			"0  1 1  11       11  1 1  0",
			"0 01010 01010101010 01010 0",
			"0 1 1  a 1  1 1  1 a  1 1 0",
			"010 0 0 01010 01010 0 0 010",
			"0 1     11  111  11     1 0",
			"0 0 0 010 0 0 0 0 010 0 0 0",
			"011 11   a 11111 a   11 110",
			"0 0 0 010 0 0 0 0 010 0 0 0",
			"0 1     11  111  11     1 0",
			"010 0 0 01010 01010 0 0 010",
			"0 1 1  a 1  1 1  1 a  1 1 0",
			"0 01010 01010101010 01010 0",
			"0  1 1  11       11  1 1  0",
			"0 0 0 010 0 0 0 0 010 0 0 0",
			"0     11 11     11 11     0",
			"200000000000000000000000002"
		]
	},
	{
		Name: "MOP ON METH",
		Hint: "Mops chase you down. Lure them into the blast!",
		Map:
		[
			"200000000000000000000000002",
			"0     11           11     0",
			"0 0 0 0 0 010 010 0 0 0 0 0",
			"0   1  11 1     1 11  1   0",
			"0 0 010 0 0101010 0 010 0 0",
			"011111  222 222 222  111110",
			"01010 0 2         2 0 01010",
			"0 1  a       b       a  1 0",
			"01010 012  0   0  210 01010",
			"01111  12 b     b 21  11110",
			"01010 012  0   0  210 01010",
			"0 1  a       b       a  1 0",
			"01010 0 2         2 0 01010",
			"011111  222 222 222  111110",
			"0 0 010 0 0101010 0 010 0 0",
			"0   1  11 1     1 11  1   0",
			"0 0 0 0 0 010 010 0 0 0 0 0",
			"0     11           11     0",
			"200000000000000000000000002"
		]
	},
	{
		Name: "HIDE AND SEEK",
		Hint: "Drakes flee and steal power-ups. Corner them!",
		Map:
		[
			"200000000000000000000000002",
			"0     21           12     0",
			"02222 2221222 2221222 22220",
			"0     2             2     0",
			"0 22222 222 222 222 22222 0",
			"011  1 12 2     2 21 1  110",
			"012122222 222 222 222221210",
			"0      d  1     1  d      0",
			"012 22212 2 2 2 2 21222 210",
			"012b2   2 2  a  2 2   2b210",
			"012 21222 222 222 22212 210",
			"0  12   21 1   1 12   21  0",
			"022 2 21212 2 2 21212 2 220",
			"011 2 2d 1       1 d2 2 110",
			"0 212221222 2 2 222122212 0",
			"0 21  2   1 2 2 1   2  12 0",
			"0 2 2 22212 2 2 21222 2 2 0",
			"0   211111  2 2  111112   0",
			"200000000000000000000000002"
		]
	},
	{
		Name: "ICE RINK",
		Hint: "Push the ice. A blast shatters it.",
		Map:
		[
			"200000000000000000000000002",
			"0    1i1 1i     i1 1i1    0",
			"0 0i010 010 0 0 010 010i0 0",
			"0   i   i i11 11i i   i   0",
			"0 0 0i0 0 0101010 010i0 0 0",
			"01i    biii  1  iii 1   i10",
			"0 0 010 2222i2i2222 010 0 0",
			"0i11  1 2    b   a2 1  d i0",
			"0 0 0 0 i 0 0 0 0 i 0 0 0 0",
			"01   a  2  I b I  2  b   10",
			"0 0 0 0 i 0 0 0 0 i 0 0 0 0",
			"0i11  1 2a        2 1  11i0",
			"0 0 010 2222i2i2222 010 0 0",
			"01ia  1 iii  1  iiib    i10",
			"0 0 0i010 0101010 0 0i0 0 0",
			"0   i   i i11 11i i   i   0",
			"0 0i010 010 0 0 010 010i0 0",
			"0    1i1 1i     i1 1i1    0",
			"200000000000000000000000002"
		]
	},
	{
		Name: "CHAIN REACTION",
		Hint: "Light a frozen-bomb fuse and watch it go!",
		Map:
		[
			"200000000000000000000000002",
			"0    11   1     1   11    0",
			"0 01222222222222222222210 0",
			"0 122   b             221 0",
			"01 IIIIIIIIIIIIIIIIIIIII 10",
			"0 122       b    a    221 0",
			"010122222222222222222221010",
			"0 111 1  1 1 d 1 1  1 111 0",
			"0101010 0 010 010 0 0101010",
			"0 1 1  e    111    e  1 1 0",
			"0101010 0 010 010 0 0101010",
			"0 111 1  1 1 d 1 1  1 111 0",
			"010122222222222222222221010",
			"0 122    a    b       221 0",
			"01 IIIIIIIIIIIIIIIIIIIII 10",
			"0 122             b   221 0",
			"0 01222222222222222222210 0",
			"0    11   1     1   11    0",
			"200000000000000000000000002"
		]
	},
	{
		Name: "DOWN THE DRAIN",
		Hint: "Bomb a drain and every drain blows. Mind your step!",
		Map:
		[
			"200000000000000000000000002",
			"0       1         1       0",
			"0 010 0 01010 01010 0 010 0",
			"0   1 2 1#  1 1  #1 2 1   0",
			"0 0 02 2010 01010102 20 0 0",
			"01112a# 21 b    112 #a21110",
			"010102 2010 010 0102 201010",
			"0111112111 e 2   1112111110",
			"010 01010 0 2 210 01010 010",
			"01 d 1 1 1 2b# 2 1 1 1 d 10",
			"010 01010 012 2 0 01010 010",
			"0111112111   2 e 1112111110",
			"010102 2010 010 0102 201010",
			"01112a# 211    b 12 #a21110",
			"0 0 02 20101010 0102 20 0 0",
			"0   1 2 1#  1 1  #1 2 1   0",
			"0 010 0 01010 01010 0 010 0",
			"0       1         1       0",
			"200000000000000000000000002"
		]
	},
	{
		Name: "SHOOP DA WHOOP",
		Hint: "Shoops fire lasers down open lines. Keep a wall between you!",
		Map:
		[
			"200000000000000000000000002",
			"0   111  11     11  111   0",
			"0 02220 02220 02220 02220 0",
			"0  1 1 # e 1   1   # 1 1  0",
			"02 0 21012 01210 21012 0 20",
			"011 d    1   1   1     1110",
			"010220 0 0220 022010 022010",
			"0 1     b  1 c 1 1 1    1 0",
			"0 21012 0 2 0 0 2 0 21012 0",
			"0 1 c 1 # 1     1 # 1 c 1 0",
			"0 21012 0 2 0 0 2 0 21012 0",
			"0 1    1 1 1 c 1  b     1 0",
			"010220 010220 0220 0 022010",
			"0111     1   1   1    d 110",
			"02 0 21012 01210 21012 0 20",
			"0  1 1 #   1   1 e # 1 1  0",
			"0 02220 02220 02220 02220 0",
			"0   111  11     11  111   0",
			"200000000000000000000000002"
		]
	},
	{
		Name: "CONVEYOR",
		Hint: "Belts carry bombs, ice and monsters. Time your shot!",
		Map:
		[
			"200000000000000000000000002",
			"0    1 1 1       1 1 1    0",
			"0 0 010 01010,01010 010 0 0",
			"0 11   e 11 1,1 11 c   11 0",
			"0 010 0 0 010,010 0 0 010 0",
			"0 111>>>>>>>>>>>>>>>>,111 0",
			"0 0 0^0 0 0 0 0 0 0 0,0 0 0",
			"01 11^1  f   1  1 1 1,11 10",
			"010 0^010 010 0101010,0 010",
			"01 b ^  1 11 f 11 1  , b 10",
			"010 0^0 01010 010 010,0 010",
			"01 11^ f  1  1   f  1,11 10",
			"0 0 0^0 0 0 0 0 0 0 0,0 0 0",
			"0 111^<<<<<<<<<<<<<<<<111 0",
			"0 010 0 0 010^010 0 0 010 0",
			"0 11   c 11 1^1 11 e   11 0",
			"0 0 010 01010^01010 010 0 0",
			"0    1 1 1       1 1 1    0",
			"200000000000000000000000002"
		],
		Over: [[9, 5, "a"], [17, 13, "a"], [5, 9, "a"]]
	},
	{
		Name: "LOCK AND KEY",
		Hint: "Each key opens a door of its colour. Follow the chain!",
		Map:
		[
			"200000000000000000000000002",
			"0         1       11  1   0",
			"0 2222222 0 0 0 0 2222222 0",
			"0 2H11 d2     1   2 1  N2 0",
			"0 210 0 2 0d0 010 2 0 0 2 0",
			"012  d 1A   1 1 1 B1 e  210",
			"0 2 0 0121222D222 2 0 01210",
			"0 2  1112 2     212e 11 2 0",
			"0 2222222 2 0 0 2 2222222 0",
			"0  11  1 b2g 1 g2b 1   1 T0",
			"01222 222 2 0 0 2 222222210",
			"0 21  11212  1  2 2f  11210",
			"0121010121222D222 2 0 0 210",
			"0 211 1    11 11 1C1 f c210",
			"0 210101210 0 010 210 0 210",
			"0 2111112  11 111 21  1U2 0",
			"0 2222222 010 0 0 2222222 0",
			"0     1  1         11 1   0",
			"200000000000000000000000002"
		]
	},
	{
		Name: "THE FACTORY",
		Hint: "Frozen bombs ride the belts. Mind the speeding riders!",
		Map:
		[
			"200000000000000000000000002",
			"0   1  c 1       1 1  1   0",
			"0 01010 0 0 0 0 0 0 01010 0",
			"0  >>>>>>,  1 1  ,<<<<<<  0",
			"0 0^01010,0 0 0 0,01010^0 0",
			"01 ^ 11 1, d  1  ,1 11 ^ 10",
			"010^0 0 0,0 0 010,0 0 0^010",
			"011^ f 1 , 1 d 1 , e 1 ^110",
			"0 0^0 0 0,0 0 0 0,0 010^0 0",
			"0  ^1  11, b b b ,11  1^  0",
			"0 0^010 0,0 0 0 0,0 0 0^0 0",
			"011^ 1 e , 1 d 1 , 1 f ^110",
			"010^0 0 0,010 0 0,0 0 0^010",
			"01 ^ 11 1,  1  d ,1 11 ^ 10",
			"0 0^01010,0 0 0 0,01010^0 0",
			"0  ^<<<<<<  1 1  >>>>>>^  0",
			"0 01010 0 0 0 0 0 0 01010 0",
			"0   1  1 1       1 c  1   0",
			"200000000000000000000000002"
		],
		Over: [[3, 9, "I"], [23, 9, "I"], [6, 3, "i"], [20, 3, "i"], [6, 15, "i"], [20, 15, "i"], [3, 5, "a"], [23, 13, "a"]]
	},
	{
		Name: "SEWER VAULT",
		Hint: "Drains reach where you cannot. Keys open the rest.",
		Map:
		[
			"200000000000000000000000002",
			"0   111         1 1  1    0",
			"0 01010 0 0 0 01222222222 0",
			"0  11211 b 11 112  1 c H2 0",
			"0 0 2d2 0 0 0 0 210 0 01210",
			"0112 # 2   c 111A1  #   2 0",
			"0 012 2 010 01012 0 010 2 0",
			"01   21111 11   21 e 1 c2 0",
			"010 0 0 01010 0122222222210",
			"0T 111111#1  d 1 1 111 1  0",
			"0 010101010 0 0 222222222 0",
			"0 11 2  1   11112  g 111210",
			"0 012 210 0 0 0 2 0 0 0 210",
			"0 12 # 2 f 111 1B   #f  210",
			"0 012e2 0 0 0 01210 0 0 2 0",
			"0 11 2   b 11 1121 1 g  2 0",
			"0 0 0 010 0 0 0 222222222 0",
			"0     11 11     1   11    0",
			"200000000000000000000000002"
		]
	},
	{
		Name: "FINAL BLAST",
		Hint: "Cross the moat, storm the fortress. Good luck!",
		Map:
		[
			"200000000000000000000000002",
			"0   11 d 1       1 e 11   0",
			"0 010 0 0 010 010 0 0 010 0",
			"0  1133333333 3333333311  0",
			"0 0103>>>>>>>>>>>>>>,30 0 0",
			"01   3^             ,3 a 10",
			"0 0103^ 22222A22222 ,30 0 0",
			"0   13^ 2        H2 ,31   0",
			"0 0 03^ 2  f   f  2 ,30 0 0",
			"0 1T1 ^ 22222222222 ,  b  0",
			"0 0 03^ 2  I g I  2 ,30 0 0",
			"0   13^ 2 g     g 2 ,31   0",
			"0 0 03^ 22222B22222 ,30 0 0",
			"01 d 3^             ,3 c 10",
			"0 0 03^<<<<<<<<<<<<<<30 0 0",
			"0  1133333333 3333333311  0",
			"0 010 0 0 010 010 0 0 010 0",
			"0   11 e 1       1 d 11   0",
			"200000000000000000000000002"
		],
		Over: [[6, 7, "c"], [20, 11, "c"], [9, 4, "I"], [17, 14, "I"]]
	}
];

// After the last level: "You won!" (the original PF 2012 card)
var CAMPAIGN_OUTRO =
[
	"202333333333333333333333202",
	"0e03333333333333333333330e0",
	"202333332222332222233333202",
	"333333332333232333333333333",
	"333333332333232333333333333",
	"333333332222332222333333333",
	"333333332333332333333333333",
	"333333332333332333333333333",
	"333333332333332333333333333",
	"333333333333333333333333333",
	"333222333222333323333222333",
	"332333232   233223332333233",
	"333332332   232323333332333",
	"333323332 P 233323333323333",
	"333233332   233323333233333",
	"332333332   233323332333333",
	"332222233222332222232222233",
	"333333333333333333333333333",
	"333333333333333333333333333"
];

// Level number of the outro
var CAMPAIGN_END = CAMPAIGN_LEVELS.length;

var LEVEL_W = 27, LEVEL_H = 19;
var LEVEL_TILES = " 0123abcdefgPiI#^>,<THNUABCD";
var LEVEL_THREAT = { a: 1, b: 2, c: 4, d: 3, e: 3, f: 3, g: 5 };

// A copy: the game rewrites GameWorld.Walls as bricks burn and doors open.
function CampaignLevel(n)
{
	var lv = CAMPAIGN_LEVELS[n];

	if (!lv)
		return { Name: "", Hint: "", Map: CAMPAIGN_OUTRO.slice(), Over: [] };

	return { Name: lv.Name, Hint: lv.Hint, Map: lv.Map.slice(), Over: (lv.Over || []).map(function(o) { return o.slice(); }) };
}

// Every enemy, ice block, key... with its tile: [{ x, y, ch }], map first, then Over.
function LevelThings(level)
{
	var out = [];

	level.Map.forEach(function(row, y)
	{
		for (var x = 0; x < row.length; ++x)
			if ("abcdefgiITHNU#".indexOf(row[x]) >= 0)
				out.push({ x: x, y: y, ch: row[x] });
	});

	(level.Over || []).forEach(function(o) { out.push({ x: o[0], y: o[1], ch: o[2] }); });

	return out;
}

// Weighted enemy count: how hard a level is to clear.
function LevelThreat(level)
{
	return LevelThings(level).reduce(function(sum, t) { return sum + (LEVEL_THREAT[t.ch] || 0); }, 0);
}

// Player 1's spawn tile ("P", else the top-left corner); the others mirror it (ComputeSpawns).
function LevelSpawnBase(level)
{
	for (var y = 0; y < level.Map.length; ++y)
	{
		var x = level.Map[y].indexOf("P");

		if (x >= 0)
			return { x: x, y: y };
	}

	return { x: 1, y: 1 };
}

// Free for spawning a player: bare floor with nothing standing on it.
function LevelFree(level, x, y)
{
	if (x < 0 || y < 0 || x >= LEVEL_W || y >= LEVEL_H || level.Map[y][x] != " ")
		return false;

	return !(level.Over || []).some(function(o) { return o[0] == x && o[1] == y; });
}

// Flood fill over the tiles `open(ch)` allows, from `starts`: index -> steps.
function LevelFlood(map, starts, open, limit)
{
	var dist = {};
	var queue = [];

	starts.forEach(function(s) { dist[s.y * LEVEL_W + s.x] = 0; queue.push(s); });

	for (var i = 0; i < queue.length; ++i)
	{
		var c = queue[i];
		var d = dist[c.y * LEVEL_W + c.x];

		if (limit !== undefined && d >= limit)
			continue;

		[[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function(v)
		{
			var x = c.x + v[0], y = c.y + v[1], k = y * LEVEL_W + x;

			if (x < 0 || y < 0 || x >= LEVEL_W || y >= LEVEL_H || dist[k] !== undefined || !open(map[y][x]))
				return;

			dist[k] = d + 1;
			queue.push({ x: x, y: y });
		});
	}

	return dist;
}

// What is wrong with a level (empty: nothing). spawns: the player spawn tiles, [{ x, y }] (ComputeSpawns).
function LevelProblems(level, spawns)
{
	var map = level.Map;
	var problems = [];

	if (map.length != LEVEL_H || map.some(function(r) { return r.length != LEVEL_W; }))
		return ["map is not " + LEVEL_W + " x " + LEVEL_H];

	for (var y = 0; y < LEVEL_H; ++y)
	{
		for (var x = 0; x < LEVEL_W; ++x)
		{
			var ch = map[y][x];

			if (LEVEL_TILES.indexOf(ch) < 0)
				problems.push("unknown tile '" + ch + "' at " + x + "," + y);
			else if ((x == 0 || y == 0 || x == LEVEL_W - 1 || y == LEVEL_H - 1) && "023".indexOf(ch) < 0)
				problems.push("open border at " + x + "," + y);
		}
	}

	(level.Over || []).forEach(function(o)
	{
		if ("abcdefgiI".indexOf(o[2]) < 0 || " #^>,<".indexOf(map[o[1]][o[0]]) < 0)
			problems.push("bad Over '" + o[2] + "' at " + o[0] + "," + o[1]);
	});

	if (problems.length)
		return problems;

	var things = LevelThings(level);
	var keyOf = { A: "T", B: "H", C: "N", D: "U" };
	var key = function(t) { return t.y * LEVEL_W + t.x; };

	// Where players can get to: through bricks and ice (they burn), not walls; a door once its key is reachable.
	var held = "";
	var reach;

	for (var pass = 0; ; ++pass)
	{
		reach = LevelFlood(map, [spawns[0]], function(ch) { return "023".indexOf(ch) < 0 && ("ABCD".indexOf(ch) < 0 || held.indexOf(keyOf[ch]) >= 0); });

		if (pass == 0)
		{
			spawns.forEach(function(s, i)
			{
				if (reach[key(s)] === undefined)
					problems.push("player " + (i + 1) + " spawns cut off at " + s.x + "," + s.y);
			});
		}

		var now = things.filter(function(t) { return "THNU".indexOf(t.ch) >= 0 && reach[key(t)] !== undefined; }).map(function(t) { return t.ch; }).join("");

		if (now.length == held.length)
			break;

		held = now;
	}

	things.filter(function(t) { return "THNU".indexOf(t.ch) >= 0 && reach[key(t)] === undefined; }).forEach(function(t)
	{
		problems.push("key " + t.ch + " out of reach at " + t.x + "," + t.y);
	});

	"ABCD".split("").forEach(function(door)
	{
		if (map.some(function(r) { return r.indexOf(door) >= 0; }) && !things.some(function(t) { return t.ch == keyOf[door]; }))
			problems.push("door " + door + " has no key");
	});

	// An enemy players cannot reach must share a pen with a drain while players can reach some drain.
	var drainReached = things.some(function(t) { return t.ch == "#" && reach[key(t)] !== undefined; });
	var enemies = things.filter(function(t) { return LEVEL_THREAT[t.ch]; });

	if (!enemies.length)
		problems.push("no enemies");

	enemies.forEach(function(e)
	{
		if (reach[key(e)] !== undefined)
			return;

		var pen = LevelFlood(map, [e], function(ch) { return "023ABCD".indexOf(ch) < 0; });
		var drained = drainReached && things.some(function(t) { return t.ch == "#" && pen[key(t)] !== undefined; });

		if (!drained)
			problems.push("enemy " + e.ch + " can't be killed at " + e.x + "," + e.y);
	});

	// The first bomb is survivable: a free tile outside its blast within 4 steps, and no enemy close by.
	spawns.forEach(function(s, i)
	{
		if (!LevelFree(level, s.x, s.y))
			problems.push("player " + (i + 1) + " spawns on '" + map[s.y][s.x] + "' at " + s.x + "," + s.y);

		var walk = LevelFlood(map, [s], function(ch) { return " #^>,<THNUP".indexOf(ch) >= 0; }, 4);
		var escape = Object.keys(walk).some(function(k) { return walk[k] >= 2; });

		if (!escape)
			problems.push("player " + (i + 1) + " can't escape a first bomb at " + s.x + "," + s.y);

		// (players 7 and 8 start at the sides, wherever the enemies are: they have hearts to spare)
		enemies.forEach(function(e)
		{
			if (i < 6 && Math.abs(e.x - s.x) + Math.abs(e.y - s.y) <= 4)
				problems.push("enemy " + e.ch + " at " + e.x + "," + e.y + " too close to player " + (i + 1));
		});
	});

	return problems;
}

// The enemy type a skull lets out: one of the kinds the level started with (`present`: their type numbers, 0-6, as the level
// map lists them), so a skull never brings a monster the level does not have. A level with no enemies (a battle arena) has no
// such list: any of the seven kinds. random: () -> [0, 1).
function SkullEnemyType(present, random)
{
	var kinds = present && present.length ? present : [0, 1, 2, 3, 4, 5, 6];

	return kinds[Math.min(kinds.length - 1, Math.floor(random() * kinds.length))];
}

if (typeof module !== 'undefined')
	module.exports = { SkullEnemyType: SkullEnemyType, CAMPAIGN_LEVELS: CAMPAIGN_LEVELS, CAMPAIGN_END: CAMPAIGN_END, CampaignLevel: CampaignLevel, LevelThings: LevelThings,
		LevelThreat: LevelThreat, LevelSpawnBase: LevelSpawnBase, LevelFree: LevelFree, LevelProblems: LevelProblems };
