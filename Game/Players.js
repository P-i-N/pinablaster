// Roster helpers and the PlayerManager singleton.

// Most players on one screen / in one LAN room
var MAX_PLAYERS = 8;

function CenterDistSq(p, x, y)
{
	var dx = (p.X + p.Width / 2) - x;
	var dy = (p.Y + p.Height / 2) - y;
	return dx * dx + dy * dy;
}

function NearestPlayer(players, x, y)
{
	var best = null, bestD = Infinity, bestAlive = null, bestAliveD = Infinity;

	for (var i = 0; i < players.length; ++i)
	{
		var p = players[i];
		var d = CenterDistSq(p, x, y);

		if (d < bestD) { bestD = d; best = p; }
		if (!p.IsDead && d < bestAliveD) { bestAliveD = d; bestAlive = p; }
	}

	return bestAlive ? bestAlive : best;
}

function NeediestPlayer(players)
{
	var best = null, bestScore = Infinity;

	for (var i = 0; i < players.length; ++i)
	{
		var p = players[i];

		if (p.IsDead) continue;

		var score = p.TotalBombs * p.Power;

		if (score < bestScore) { bestScore = score; best = p; }
	}

	if (best) return best;

	return players.length > 0 ? players[0] : null;
}

function ComputeSpawns(isFree, w, h, bx, by, count)
{
	// players 1-4: the four corners (mirrors of the base tile); 5-6: top and bottom centre; 7-8: left and right middle
	var mid = Math.floor(w / 2), midY = Math.floor(h / 2);
	var candidates = [[bx, by], [w - 1 - bx, by], [bx, h - 1 - by], [w - 1 - bx, h - 1 - by], [mid, by], [mid, h - 1 - by],
		[bx, midY], [w - 1 - bx, midY]];
	var used = {};
	var result = [];

	function key(x, y) { return x + "," + y; }

	function nearestFree(cx, cy)
	{
		for (var d = 1; d <= w + h; ++d)
		{
			for (var dy = -d; dy <= d; ++dy)
			{
				var span = d - Math.abs(dy);
				var dxs = span == 0 ? [0] : [-span, span];

				for (var k = 0; k < dxs.length; ++k)
				{
					var x = cx + dxs[k], y = cy + dy;

					if (isFree(x, y) && !used[key(x, y)])
						return { x: x, y: y };
				}
			}
		}

		return { x: cx, y: cy };
	}

	for (var i = 0; i < count && i < candidates.length; ++i)
	{
		var c = { x: candidates[i][0], y: candidates[i][1] };

		if (!isFree(c.x, c.y) || used[key(c.x, c.y)])
			c = nearestFree(c.x, c.y);

		used[key(c.x, c.y)] = true;
		result.push(c);
	}

	return result;
}

// Players 7 and 8 start in the middle of the left / right side, where the maps have no room kept free for them:
// the bricks within two tiles of their spawns are cleared so that they can get away from their first bomb.
// Returns new map rows (the input is not changed).
function ClearSpawnPockets(rows, spawns, from)
{
	var out = rows.slice();

	for (var i = from; i < spawns.length; ++i)
	{
		for (var dy = -2; dy <= 2; ++dy)
		{
			for (var dx = -2; dx <= 2; ++dx)
			{
				var x = spawns[i].x + dx, y = spawns[i].y + dy;

				if (Math.abs(dx) + Math.abs(dy) <= 2 && out[y] && out[y][x] == "1")
					out[y] = out[y].substr(0, x) + " " + out[y].substr(x + 1);
			}
		}
	}

	return out;
}

function DefaultRoster(count)
{
	if (count <= 1)
		return [{ Keyboard: 0, Pad: "any", Touch: true }];

	// two keyboards plus gamepads
	var all = [{ Keyboard: 0, Pad: 0 }, { Keyboard: 1, Pad: 1 }, { Keyboard: null, Pad: 2 }, { Keyboard: null, Pad: 3 },
		{ Keyboard: null, Pad: 4 }, { Keyboard: null, Pad: 5 }, { Keyboard: null, Pad: 6 }, { Keyboard: null, Pad: 7 }];

	return all.slice(0, Math.min(count, MAX_PLAYERS));
}

// True when nobody can play on: everyone is dead and has no life left to respawn with.
function AllOut(players)
{
	if (players.length == 0)
		return false;

	for (var i = 0; i < players.length; ++i)
		if (!players[i].IsDead || players[i].Lifes > 0)
			return false;

	return true;
}

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

function PlayerManagerPrototype()
{
	this.Players = [];
	this.KeyFlags = 0;

	this.Reset = function()
	{
		this.Players = [];
		this.KeyFlags = 0;
	}

	this.Register = function(player)
	{
		this.Players.push(player);
	}

	this.Nearest = function(x, y)
	{
		return NearestPlayer(this.Players, x, y);
	}

	this.Neediest = function()
	{
		return NeediestPlayer(this.Players);
	}

	this.Alive = function()
	{
		var list = [];

		for (var i = 0; i < this.Players.length; ++i)
			if (!this.Players[i].IsDead)
				list.push(this.Players[i]);

		return list;
	}
}

var PlayerManager = new PlayerManagerPrototype();

if (typeof module !== 'undefined')
	module.exports = { NearestPlayer: NearestPlayer, NeediestPlayer: NeediestPlayer, ComputeSpawns: ComputeSpawns, ClearSpawnPockets: ClearSpawnPockets, DefaultRoster: DefaultRoster, AllOut: AllOut, HumanPlayers: HumanPlayers, PlayerLabel: PlayerLabel };
