// A tile grid of "what blocks here", kept in step with the level and with the movable things that block (ice blocks):
// ask it instead of testing the walls and every entity again and again. Pure: no DOM, so Node can test it.
//
// Level walls are re-read only for the rows whose text changed; entities flagged `BlocksFluid` are re-stamped every Update
// (a sliding ice block covers two tiles while it moves). Version goes up whenever the answer for any tile changed.
var COLLISION_WALL = 1;
var COLLISION_ENTITY = 2;

function IsWallChar(c)
{
	return (c >= "0" && c <= "9") || (c >= "A" && c <= "D");
}

function CollisionGrid(tilesX, tilesY, blockWidth, blockHeight)
{
	var n = tilesX * tilesY;
	var rows = new Array(tilesY);
	var next = new Uint8Array(n);

	this.TilesX = tilesX;
	this.TilesY = tilesY;
	this.Walls = new Uint8Array(n);
	this.Blockers = new Uint8Array(n);
	this.Version = 0;

	// walls: the level's rows; entities: anything with BlocksFluid (X, Y, optional Width / Height). Returns true if something changed.
	this.Update = function(walls, entities)
	{
		var changed = false;

		for (var ty = 0; ty < tilesY; ++ty)
		{
			if (rows[ty] === walls[ty])
				continue;

			rows[ty] = walls[ty];
			changed = true;

			for (var tx = 0; tx < tilesX; ++tx)
				this.Walls[ty * tilesX + tx] = IsWallChar(walls[ty][tx]) ? 1 : 0;
		}

		next.fill(0);

		for (var i = 0; i < entities.length; ++i)
		{
			var e = entities[i];

			if (!e.BlocksFluid)
				continue;

			var x0 = Math.floor(e.X / blockWidth), x1 = Math.floor((e.X + (e.Width || blockWidth) - 1) / blockWidth);
			var y0 = Math.floor(e.Y / blockHeight), y1 = Math.floor((e.Y + (e.Height || blockHeight) - 1) / blockHeight);

			for (var y = Math.max(0, y0); y <= Math.min(tilesY - 1, y1); ++y)
				for (var x = Math.max(0, x0); x <= Math.min(tilesX - 1, x1); ++x)
					next[y * tilesX + x] = 1;
		}

		for (var i = 0; i < n; ++i)
		{
			if (next[i] != this.Blockers[i])
			{
				this.Blockers.set(next);
				changed = true;
				break;
			}
		}

		if (changed)
			++this.Version;

		return changed;
	}

	this.IsSolidTile = function(tx, ty)
	{
		if (tx < 0 || ty < 0 || tx >= tilesX || ty >= tilesY)
			return true;

		var i = ty * tilesX + tx;

		return (this.Walls[i] | this.Blockers[i]) != 0;
	}

	this.IsSolidPx = function(x, y)
	{
		return this.IsSolidTile(Math.floor(x / blockWidth), Math.floor(y / blockHeight));
	}
}

if (typeof module !== 'undefined') module.exports = { CollisionGrid: CollisionGrid, IsWallChar: IsWallChar };
