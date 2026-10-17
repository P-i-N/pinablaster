// Battle mode: arena map, round/match rules, sudden-death order.

var BATTLE_SUDDEN_DEATH_AT = 120.0;
var BATTLE_SUDDEN_STEP = 0.12;

function BuildBattleArena()
{
	var W = 27, H = 19;
	var rows = [];
	var safe = {};

	// corner tile, plus its horizontal and vertical neighbour
	[[1, 1, 1, 1], [25, 1, -1, 1], [1, 17, 1, -1], [25, 17, -1, -1]].forEach(function(c)
	{
		safe[c[0] + "," + c[1]] = true;
		safe[(c[0] + c[2]) + "," + c[1]] = true;
		safe[c[0] + "," + (c[1] + c[3])] = true;
	});

	// players 5 and 6 start at the top / bottom centre: three tiles in a row plus one below / above the middle
	var mid = (W - 1) / 2, midY = (H - 1) / 2;

	[[mid, 1, 1], [mid, H - 2, -1]].forEach(function(c)
	{
		safe[(c[0] - 1) + "," + c[1]] = true;
		safe[c[0] + "," + c[1]] = true;
		safe[(c[0] + 1) + "," + c[1]] = true;
		safe[c[0] + "," + (c[1] + c[2])] = true;
	});

	// players 7 and 8 start at the left / right middle: three tiles in a column plus one beside the middle
	[[1, 1], [W - 2, -1]].forEach(function(c)
	{
		safe[c[0] + "," + (midY - 1)] = true;
		safe[c[0] + "," + midY] = true;
		safe[c[0] + "," + (midY + 1)] = true;
		safe[(c[0] + c[1]) + "," + midY] = true;
	});

	for (var y = 0; y < H; ++y)
	{
		var row = "";

		for (var x = 0; x < W; ++x)
		{
			var ch;

			if (x == 0 || y == 0 || x == W - 1 || y == H - 1)
				ch = ((x == 0 || x == W - 1) && (y == 0 || y == H - 1)) ? "2" : "0";
			else if (x % 2 == 0 && y % 2 == 0)
				ch = "0";
			else if (safe[x + "," + y])
				ch = " ";
			else
				ch = "1";

			row += ch;
		}

		rows.push(row);
	}

	return rows;
}

// The demo arena (8 CPU players): the battle arena with fewer bricks and something to watch in the middle - a loop of
// magic carpets that carries bombs round a pen of ice (one holding a frozen bomb), and four drains that pass
// every blast on to the others. The starting pockets of the battle arena are untouched. Legend: see Levels.js.
function BuildDemoArena()
{
	var rows = BuildBattleArena().map(function(r) { return r.split(""); });
	var W = rows[0].length, H = rows.length;

	function put(x, y, ch) { rows[y][x] = ch; }

	// fewer bricks, the same on all four sides
	for (var y = 1; y < H - 1; ++y)
	{
		for (var x = 1; x < W - 1; ++x)
		{
			var mx = Math.min(x, W - 1 - x), my = Math.min(y, H - 1 - y);

			if (rows[y][x] == "1" && (mx * 5 + my * 3) % 4 == 0)
				put(x, y, " ");
		}
	}

	// the pen: cleared inside, ice blocks in it, a frozen bomb in the middle
	for (var y = 7; y <= 11; ++y)
		for (var x = 10; x <= 16; ++x)
			if (rows[y][x] == "1")
				put(x, y, " ");

	[[11, 8], [15, 8], [11, 10], [15, 10]].forEach(function(p) { put(p[0], p[1], "i"); });
	put(13, 9, "I");

	// the loop of carpets round it, clockwise (right along the top, down the right side, left along the bottom, up the left side)
	for (var x = 9; x <= 16; ++x) put(x, 6, ">");
	for (var y = 6; y <= 11; ++y) put(17, y, ",");
	for (var x = 17; x >= 10; --x) put(x, 12, "<");
	for (var y = 12; y >= 7; --y) put(9, y, "^");

	// four drains
	[[6, 5], [20, 5], [6, 13], [20, 13]].forEach(function(p) { put(p[0], p[1], "#"); });

	return rows.map(function(r) { return r.join(""); });
}

// What a click at (x, y) (map pixels) does in the demo: { action, entity } or { action: "bomb", tx, ty }, or null.
//   a dead player: "revive"; a bomb (anybody's): "explode"; a skull power-up: "timeout" (it ends now, with a blast or an
//   enemy); another power-up: "pickup" (the nearest player takes it); an empty tile: "bomb" (put one there).
// entities: the game's entities; tileFree(tx, ty): is a bomb allowed on the tile?
function DemoClickAction(entities, x, y, tileW, tileH, tileFree, skullFrame)
{
	function at(e) { return x >= e.X && y >= e.Y && x < e.X + e.Width && y < e.Y + e.Height; }

	var found = { player: null, bomb: null, powerup: null };

	entities.forEach(function(e)
	{
		if (!at(e))
			return;

		if (e.Type == "Player" && e.IsDead) found.player = found.player || e;
		else if (e.Type == "Bomb" && e.Health > 0) found.bomb = found.bomb || e;
		else if (e.Type == "PowerUp" && e.Health > 0) found.powerup = found.powerup || e;
	});

	if (found.player)
		return { action: "revive", entity: found.player };

	if (found.bomb)
		return { action: "explode", entity: found.bomb };

	if (found.powerup)
		return { action: found.powerup.PowerUpType == skullFrame ? "timeout" : "pickup", entity: found.powerup };

	var tx = Math.floor(x / tileW), ty = Math.floor(y / tileH);

	return tileFree(tx, ty) ? { action: "bomb", tx: tx, ty: ty } : null;
}

// ---- the other battle levels -------------------------------------------------------------------------------------------
// All start from the classic arena (so the eight starting pockets stay open) and only change bricks and a few open tiles,
// the same on all four sides. Tile legend: see Levels.js (" " floor, "0" wall, "1" brick, "i" ice, "I" frozen bomb, "#" drain,
// "^" ">" "," "<" magic carpets).

function ArenaGrid()
{
	return BuildBattleArena().map(function(r) { return r.split(""); });
}

function ArenaRows(grid)
{
	return grid.map(function(r) { return r.join(""); });
}

// (x, y) and its three mirror images
function Mirror4(grid, x, y, ch)
{
	var W = grid[0].length, H = grid.length;

	grid[y][x] = ch;
	grid[y][W - 1 - x] = ch;
	grid[H - 1 - y][x] = ch;
	grid[H - 1 - y][W - 1 - x] = ch;
}

// Calls change(x, y, mx, my) for every brick; (mx, my) is the tile's distance from the nearest side, the same for mirror images.
function EachBrick(grid, change)
{
	var W = grid[0].length, H = grid.length;

	for (var y = 1; y < H - 1; ++y)
		for (var x = 1; x < W - 1; ++x)
			if (grid[y][x] == "1")
				change(x, y, Math.min(x, W - 1 - x), Math.min(y, H - 1 - y));
}

// Open Field: two bricks in three are gone - fast and exposed.
function BuildOpenField()
{
	var g = ArenaGrid();

	EachBrick(g, function(x, y, mx, my) { if ((mx * 5 + my * 7) % 3 != 0) g[y][x] = " "; });

	return ArenaRows(g);
}

// Ice Rink: a quarter of the bricks are ice blocks that slide when pushed, with four frozen bombs among them.
function BuildIceRink()
{
	var g = ArenaGrid();

	EachBrick(g, function(x, y, mx, my)
	{
		var h = (mx * 7 + my * 11) % 8;

		if (h < 2) g[y][x] = "i";
		else if (h == 2) g[y][x] = " ";
	});

	Mirror4(g, 9, 5, "I");

	return ArenaRows(g);
}

// Conveyor: belts of magic carpets along two rows (right on the upper, left on the lower) and two columns (down, up).
function BuildConveyor()
{
	var g = ArenaGrid();
	var W = g[0].length, H = g.length;

	for (var x = 1; x < W - 1; ++x) { g[5][x] = ">"; g[H - 1 - 5][x] = "<"; }
	for (var y = 3; y < H - 3; ++y) { g[y][7] = ","; g[y][W - 1 - 7] = "^"; }

	return ArenaRows(g);
}

// Sewers: five drains - one in the middle and one near each corner - and every bomb that goes off on one goes off on all.
function BuildSewers()
{
	var g = ArenaGrid();

	Mirror4(g, 5, 3, "#");
	g[9][13] = "#";

	return ArenaRows(g);
}

// The levels to choose from in the battle lobby ("Carousel" is also what the demo plays on).
var BATTLE_LEVELS =
[
	{ Name: "Classic", Build: BuildBattleArena },
	{ Name: "Open Field", Build: BuildOpenField },
	{ Name: "Carousel", Build: BuildDemoArena },
	{ Name: "Ice Rink", Build: BuildIceRink },
	{ Name: "Conveyor", Build: BuildConveyor },
	{ Name: "Sewers", Build: BuildSewers }
];

// Level `i` (any integer: it wraps) as map rows.
function BuildBattleLevel(i)
{
	var n = BATTLE_LEVELS.length;

	return BATTLE_LEVELS[((i % n) + n) % n].Build();
}

// Sudden death: the cells that will close within `horizon` seconds, in order, each with the time it closes: [{ x, y, t }].
// (battleTime, suddenTimer, suddenIndex: the game's clock, its step timer and the next cell of `order`, see SpiralOrder.)
function SuddenSchedule(battleTime, suddenTimer, suddenIndex, order, horizon)
{
	var started = battleTime > BATTLE_SUDDEN_DEATH_AT;
	var first = Math.max(0, started ? BATTLE_SUDDEN_STEP - suddenTimer : BATTLE_SUDDEN_DEATH_AT - battleTime + BATTLE_SUDDEN_STEP);
	var list = [];

	for (var k = 0; suddenIndex + k < order.length; ++k)
	{
		var t = first + k * BATTLE_SUDDEN_STEP;

		if (t > horizon)
			break;

		list.push({ x: order[suddenIndex + k].x, y: order[suddenIndex + k].y, t: t });
	}

	return list;
}

// Interior tiles, clockwise ring by ring, starting at the top-left.
function SpiralOrder(w, h)
{
	var cells = [];
	var x0 = 1, y0 = 1, x1 = w - 2, y1 = h - 2;

	while (x0 <= x1 && y0 <= y1)
	{
		for (var x = x0; x <= x1; ++x) cells.push({ x: x, y: y0 });
		for (var y = y0 + 1; y <= y1; ++y) cells.push({ x: x1, y: y });

		if (y1 > y0)
			for (var x = x1 - 1; x >= x0; --x) cells.push({ x: x, y: y1 });

		if (x1 > x0)
			for (var y = y1 - 1; y > y0; --y) cells.push({ x: x0, y: y });

		++x0; ++y0; --x1; --y1;
	}

	return cells;
}

function RoundOutcome(players)
{
	var alive = players.filter(function(p) { return !p.IsDead; });

	if (alive.length > 1)
		return null;

	return { winner: alive.length == 1 ? alive[0].Index : -1 };
}

function BattleRules(playerCount, target)
{
	this.Wins = [];

	for (var i = 0; i < playerCount; ++i)
		this.Wins.push(0);

	this.Round = 1;
	this.Target = target || 3;

	// Returns the match winner's index, or -1 when the match goes on.
	this.RecordRound = function(winner)
	{
		if (winner >= 0)
			++this.Wins[winner];

		if (winner >= 0 && this.Wins[winner] >= this.Target)
			return winner;

		++this.Round;

		return -1;
	}
}

// Sudden death: the living players whose centre is on the cell (x, y) that is closing - they are crushed (no heart or
// invulnerability saves them: otherwise players sealed inside the walls survive and the round never ends).
function CrushedPlayers(players, x, y, tileW, tileH)
{
	return players.filter(function(p)
	{
		return !p.IsDead && Math.floor((p.X + p.Width / 2) / tileW) == x && Math.floor((p.Y + p.Height / 2) / tileH) == y;
	});
}

// Battle is one-hit kills: no heart (4) and no extra life (6) power-ups.
function BattlePowerUpAllowed(type)
{
	return type != 4 && type != 6;
}

if (typeof module !== 'undefined')
	module.exports = { BuildBattleArena: BuildBattleArena, BuildDemoArena: BuildDemoArena, SuddenSchedule: SuddenSchedule, BATTLE_LEVELS: BATTLE_LEVELS, BuildBattleLevel: BuildBattleLevel, DemoClickAction: DemoClickAction, SpiralOrder: SpiralOrder, RoundOutcome: RoundOutcome, BattleRules: BattleRules,
		CrushedPlayers: CrushedPlayers, BattlePowerUpAllowed: BattlePowerUpAllowed };
