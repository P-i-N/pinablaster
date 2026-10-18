// Cracks in the bricks that live through nearby blasts.
//
// Game side: a brick right next to a blast's flames takes a hit (once per blast). Hits add up, and the brick shows more
// and more cracks. From the second hit on a piece may chip off: the power-up the brick hides is rolled there and then
// (GeneratePowerUp hands out that one when the brick breaks) and it shows through the hole. The state lives in
// GameWorld.Cracks and rides along with the walls in LAN snapshots.
//
// Look: one hidden random Voronoi pattern covers the whole map (so a crack runs on into the next brick). A hit uncovers
// more of its lines, starting from the side the blasts came from; a chip knocks one or two of its cells out.
// Everything here but DrawBrickCracks is pure (no DOM), so Node can test it.

var CRACK_MAX_DAMAGE = 4;
var CRACK_CHIP_CHANCE = 0.35;   // per hit, from the second hit on (once per brick)
var CRACK_CELL = 7;             // px between the pattern's sites
// how far (0-1) the lines have spread at each damage
var CRACK_REVEAL = [0, 0.3, 0.52, 0.74, 0.95];

// state: { seed, tiles: { tile index: { d: hits, ix, iy: where the blasts came from (summed), chip: 0 / 1, pu: power-up type behind a chip (-1 none) } } }
function NewCracks(seed)
{
	return { seed: seed >>> 0, tiles: {} };
}

// A seed for the pattern that leaves the game's random numbers alone (seeded runs play the same with or without cracks)
var crackSeedCounter = 0;

function CrackSeed()
{
	return (Date.now() * 2654435761 + (++crackSeedCounter) * 40503) >>> 0;
}

function crackHash(seed, a, b, c)
{
	var h = (seed ^ Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) >>> 0;

	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);

	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// The bricks next to these flame tiles ([[tx, ty], ...], one blast) each take a hit.
// walls: the level rows; rand: the game's random numbers (chips); roll(): the power-up for a chip (-1 nothing).
// Returns true when a brick's look changed.
function CrackBlast(cracks, walls, flames, rand, roll)
{
	var w = walls[0].length, h = walls.length, seen = {}, hits = [], changed = false;
	var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];

	for (var i = 0; i < flames.length; ++i)
	{
		for (var d = 0; d < 4; ++d)
		{
			var tx = flames[i][0] + dirs[d][0], ty = flames[i][1] + dirs[d][1];

			if (tx < 0 || ty < 0 || tx >= w || ty >= h || walls[ty][tx] != "1")
				continue;

			var k = ty * w + tx;

			if (!seen[k])
				hits.push(seen[k] = { k: k, ix: 0, iy: 0 });

			seen[k].ix += dirs[d][0];
			seen[k].iy += dirs[d][1];
		}
	}

	for (var i = 0; i < hits.length; ++i)
	{
		var c = cracks.tiles[hits[i].k];

		if (!c)
			c = cracks.tiles[hits[i].k] = { d: 0, ix: 0, iy: 0, chip: 0, pu: -1 };

		if (c.d < CRACK_MAX_DAMAGE)
		{
			++c.d;
			c.ix = Math.max(-3, Math.min(3, c.ix + hits[i].ix));
			c.iy = Math.max(-3, Math.min(3, c.iy + hits[i].iy));
			changed = true;
		}

		if (!c.chip && c.d >= 2 && rand() < CRACK_CHIP_CHANCE)
		{
			c.chip = 1;
			c.pu = roll();
			changed = true;
		}
	}

	return changed;
}

// The brick at tile index k is gone: what a chip showed behind it (undefined: it was never chipped, roll one)
function TakeCrack(cracks, k)
{
	var c = cracks ? cracks.tiles[k] : null;

	if (!c)
		return undefined;

	delete cracks.tiles[k];

	return c.chip ? c.pu : undefined;
}

// Where in a bw x bh brick (px from its corner) the blasts hit it: the middle of the side they came from
function crackOrigin(c, bw, bh)
{
	var len = Math.sqrt(c.ix * c.ix + c.iy * c.iy);

	if (!len)
		return [bw / 2, bh / 2];

	// (ix, iy) points from the blast into the brick
	return [bw / 2 - c.ix / len * bw * 0.5, bh / 2 - c.iy / len * bh * 0.5];
}

// The pattern's cell under map pixel (px, py): the nearest site of a jittered grid
function crackCell(seed, px, py)
{
	var gx = Math.floor(px / CRACK_CELL), gy = Math.floor(py / CRACK_CELL), best = Infinity, id = 0;

	for (var y = gy - 1; y <= gy + 1; ++y)
	{
		for (var x = gx - 1; x <= gx + 1; ++x)
		{
			var sx = (x + 0.1 + 0.8 * crackHash(seed, x, y, 1)) * CRACK_CELL - px;
			var sy = (y + 0.1 + 0.8 * crackHash(seed, x, y, 2)) * CRACK_CELL - py;
			var dd = sx * sx + sy * sy;

			if (dd < best)
			{
				best = dd;
				id = (y + 1) * 65536 + x + 1;
			}
		}
	}

	return id;
}

// The pixels of brick (tx, ty) (bw x bh px) for crack state c:
// { lines: pixel indices (y * bw + x) of the visible cracks, chip: Uint8Array mask of the hole (null if none), rim: pixel indices around the hole }
function CrackPixels(seed, tx, ty, bw, bh, c)
{
	var ox = tx * bw, oy = ty * bh;
	var ids = new Int32Array((bw + 1) * (bh + 1));

	for (var y = 0; y <= bh; ++y)
		for (var x = 0; x <= bw; ++x)
			ids[y * (bw + 1) + x] = crackCell(seed, ox + x + 0.5, oy + y + 0.5);

	var o = crackOrigin(c, bw, bh), reveal = CRACK_REVEAL[Math.min(c.d, CRACK_MAX_DAMAGE)];
	var far = Math.sqrt(bw * bw + bh * bh);
	var out = { lines: [], chip: null, rim: [] };

	// the cells knocked out: the one where the blasts hit and, now and then, the one between it and the middle
	var chipped = {};

	if (c.chip)
	{
		var mx = bw / 2 + (o[0] - bw / 2) * 0.2, my = bh / 2 + (o[1] - bh / 2) * 0.2;

		chipped[crackCell(seed, ox + mx, oy + my)] = true;

		if (crackHash(seed, tx, ty, 3) < 0.5)
			chipped[crackCell(seed, ox + bw / 2 + (o[0] - bw / 2) * 0.7, oy + bh / 2 + (o[1] - bh / 2) * 0.7)] = true;

		out.chip = new Uint8Array(bw * bh);

		for (var y = 0; y < bh; ++y)
			for (var x = 0; x < bw; ++x)
				if (chipped[ids[y * (bw + 1) + x]])
					out.chip[y * bw + x] = 1;
	}

	for (var y = 0; y < bh; ++y)
	{
		for (var x = 0; x < bw; ++x)
		{
			var i = y * bw + x;

			if (out.chip && out.chip[i])
				continue;

			var a = ids[y * (bw + 1) + x], r = ids[y * (bw + 1) + x + 1], b = ids[(y + 1) * (bw + 1) + x];

			if (out.chip && ((x > 0 && out.chip[i - 1]) || (x < bw - 1 && out.chip[i + 1]) || (y > 0 && out.chip[i - bw]) || (y < bh - 1 && out.chip[i + bw])))
			{
				out.rim.push(i);
				continue;
			}

			if (a == r && a == b)
				continue;

			// a line is a pair of neighbouring cells; it shows when its spot is close enough to where the blasts hit
			var n = a != r ? r : b;
			var lo = Math.min(a, n), hi = Math.max(a, n);
			var dx = x + 0.5 - o[0], dy = y + 0.5 - o[1];
			var t = 0.6 * Math.sqrt(dx * dx + dy * dy) / far + 0.3 * crackHash(seed, lo, hi, 4) + 0.1 * crackHash(seed, ox + x, oy + y, 5);

			if (t < reveal)
				out.lines.push(i);
		}
	}

	return out;
}

// Draws brick (tx, ty)'s cracks (and the hole, with the ground and the power-up behind it) at (bx, by) on ctx.
// sheet: the sprite sheet; ground: the ground sprite.
function DrawBrickCracks(ctx, sheet, ground, seed, tx, ty, bx, by, bw, bh, c)
{
	var px = CrackPixels(seed, tx, ty, bw, bh, c);

	if (px.chip)
	{
		ctx.save();
		ctx.beginPath();

		for (var i = 0; i < px.chip.length; ++i)
			if (px.chip[i])
				ctx.rect(bx + i % bw, by + Math.floor(i / bw), 1, 1);

		ctx.clip();
		ctx.clearRect(bx, by, bw, bh);
		sheet.DrawSpriteByIndex(ctx, bx, by, ground);

		if (c.pu >= 0)
			sheet.DrawSpriteByIndex(ctx, bx, by, c.pu == 7 ? 97 : 160 + c.pu);

		// in the brick's shade
		ctx.fillStyle = "rgba(0,0,0,0.3)";
		ctx.fillRect(bx, by, bw, bh);
		ctx.restore();

		ctx.fillStyle = "rgba(25,12,6,0.55)";

		for (var i = 0; i < px.rim.length; ++i)
			ctx.fillRect(bx + px.rim[i] % bw, by + Math.floor(px.rim[i] / bw), 1, 1);
	}

	var line = new Uint8Array(bw * bh);

	for (var i = 0; i < px.lines.length; ++i)
		line[px.lines[i]] = 1;

	for (var i = 0; i < px.lines.length; ++i)
	{
		var x = px.lines[i] % bw, y = Math.floor(px.lines[i] / bw);

		ctx.fillStyle = "rgba(20,8,4,0.75)";
		ctx.fillRect(bx + x, by + y, 1, 1);

		// a lit lower edge
		if (y < bh - 1 && !line[px.lines[i] + bw] && !(px.chip && px.chip[px.lines[i] + bw]))
		{
			ctx.fillStyle = "rgba(255,225,190,0.22)";
			ctx.fillRect(bx + x, by + y + 1, 1, 1);
		}
	}
}

if (typeof module !== 'undefined')
	module.exports = { NewCracks: NewCracks, CrackSeed: CrackSeed, CrackBlast: CrackBlast, TakeCrack: TakeCrack, CrackPixels: CrackPixels,
		CRACK_MAX_DAMAGE: CRACK_MAX_DAMAGE, CRACK_CELL: CRACK_CELL };
