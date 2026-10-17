// Per-player recolouring of the player sprites (sprite sheet row 0, frames 0-13).
// Only bright, near-grey pixels (the suit) are multiplied by the player colour;
// outlines, shadows, face and accessories keep their original colours.

var PLAYER_TINTS = [null, [74, 163, 255], [255, 90, 74], [79, 211, 95], [255, 214, 64], [190, 110, 255], [60, 220, 215], [255, 140, 200]];

// Flame colour of each player (index = player index; 0 is the white player), 0..1 red / green / blue. The explosion
// sprites and the fluid's glow use it.
var PLAYER_FLAME_COLORS = [[1, 0.92, 0.78], [0.29, 0.64, 1], [1, 0.35, 0.29], [0.31, 0.83, 0.37], [1, 0.84, 0.25], [0.75, 0.43, 1], [0.24, 0.86, 0.84], [1, 0.55, 0.78]];

// Sprite sheet frames of the explosion (centre, arms and tips, in four animation steps each)
var FLAME_FRAMES = [80, 81, 82, 83, 84, 85, 86, 100, 101, 102, 103, 104, 105, 106, 120, 121, 122, 123, 124, 125, 126, 140, 141, 142, 143, 144, 145, 146];

// Recolours orange flame pixels (RGBA bytes) to `color` (0..1 each): brightness is kept, the saturated (orange) part takes
// the colour and the white-hot core stays white.
function FlameRecolor(data, color)
{
	for (var i = 0; i < data.length; i += 4)
	{
		if (data[i + 3] == 0)
			continue;

		var mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]);
		var t = mx > 0 ? Math.min(1, (mx - mn) / mx * 1.25) : 0;

		for (var c = 0; c < 3; ++c)
			data[i + c] = Math.round(mx * (1 - t + color[c] * t));
	}
}

// data: RGBA bytes of an image `width` pixels wide; the first `regionW` x `regionH` pixels are tinted
// (defaults to the whole `width` x `height`).
function TintRegion(data, width, height, tint, regionW, regionH)
{
	regionW = regionW || width;
	regionH = regionH || height;

	for (var y = 0; y < regionH; ++y)
	{
		for (var x = 0; x < regionW; ++x)
		{
			var i = (y * width + x) * 4;

			if (data[i + 3] == 0)
				continue;

			var r = data[i], g = data[i + 1], b = data[i + 2];
			var mx = Math.max(r, g, b), mn = Math.min(r, g, b);

			if (mn >= 120 && mx - mn <= 10)
			{
				data[i] = Math.round(r * tint[0] / 255);
				data[i + 1] = Math.round(g * tint[1] / 255);
				data[i + 2] = Math.round(b * tint[2] / 255);
			}
		}
	}
}

// The sprite sheet cells (columns x rows) the FLAME_FRAMES fill, from the sheet's `columns`: { col, row, cols, rows } -
// null unless they exactly fill a rectangle (then the explosion block can be recoloured in one go).
function FlameBlock(columns)
{
	var c0 = Infinity, c1 = -1, r0 = Infinity, r1 = -1;

	FLAME_FRAMES.forEach(function(f)
	{
		var c = f % columns, r = Math.floor(f / columns);

		c0 = Math.min(c0, c); c1 = Math.max(c1, c);
		r0 = Math.min(r0, r); r1 = Math.max(r1, r);
	});

	var cols = c1 - c0 + 1, rows = r1 - r0 + 1;

	return cols * rows == FLAME_FRAMES.length ? { col: c0, row: r0, cols: cols, rows: rows } : null;
}

function TintPrototype()
{
	var cache = {};
	var flames = {};
	var regions = {};

	// The first 14 sprites of row 0 are the player animation frames.
	var PLAYER_FRAMES = 14;

	// The pixels of a block of the plain sprite sheet, read back once (reading back is the slow part of making a
	// recoloured copy); every copy starts from it.
	function region(name, x, y, w, h)
	{
		if (!regions[name])
		{
			var c = document.createElement("canvas");

			c.width = Renderer.SpriteSheet.Image.width;
			c.height = Renderer.SpriteSheet.Image.height;

			var cx = c.getContext("2d", { willReadFrequently: true });

			cx.drawImage(Renderer.SpriteSheet.Image, 0, 0);
			regions[name] = cx.getImageData(x, y, w, h);
		}

		return regions[name];
	}

	// A copy of the sprite sheet with `data` (w x h pixels) painted over its block at (x, y).
	function sheetWith(data, x, y)
	{
		var base = Renderer.SpriteSheet;
		var c = document.createElement("canvas");

		c.width = base.Image.width;
		c.height = base.Image.height;

		var cx = c.getContext("2d");

		cx.drawImage(base.Image, 0, 0);
		cx.putImageData(data, x, y);

		return SpriteSheet.FromCanvas(c, base.SpriteWidth, base.SpriteHeight, base.InnerOffsetX, base.InnerOffsetY);
	}

	function ready()
	{
		return Renderer.SpriteSheet && Renderer.SpriteSheet.IsLoaded;
	}

	this.GetSheet = function(index)
	{
		if (index <= 0 || !PLAYER_TINTS[index])
			return null;

		if (cache[index] !== undefined)
			return cache[index] || null;

		if (!ready())
			return null;

		try
		{
			var base = Renderer.SpriteSheet;
			var w = PLAYER_FRAMES * base.SpriteWidth, h = base.SpriteHeight;
			var from = region("players", 0, 0, w, h);
			var data = new ImageData(new Uint8ClampedArray(from.data), w, h);

			TintRegion(data.data, w, h, PLAYER_TINTS[index]);
			cache[index] = sheetWith(data, 0, 0);
		}
		catch (e)
		{
			// Canvas read-back blocked (e.g. file://): players keep the default colours.
			cache[index] = false;
		}

		return cache[index] || null;
	}

	// The sprite sheet with the explosion frames in the flame colour of player `index`; null if it cannot be made.
	this.GetFlameSheet = function(index)
	{
		var color = PLAYER_FLAME_COLORS[index];

		if (!color)
			return null;

		if (flames[index] !== undefined)
			return flames[index] || null;

		if (!ready())
			return null;

		try
		{
			var base = Renderer.SpriteSheet;
			var block = FlameBlock(base.SpriteCountX);

			if (!block)
				throw new Error("the explosion frames are not one block");

			var x = block.col * base.SpriteWidth, y = block.row * base.SpriteHeight, w = block.cols * base.SpriteWidth, h = block.rows * base.SpriteHeight;
			var from = region("flames", x, y, w, h);
			var data = new ImageData(new Uint8ClampedArray(from.data), w, h);

			FlameRecolor(data.data, color);
			flames[index] = sheetWith(data, x, y);
		}
		catch (e)
		{
			flames[index] = false;
		}

		return flames[index] || null;
	}

	// Makes the next recoloured sheet nobody has asked for yet (call it now and then while the game idles, so that the
	// first bomb of a player does not stall a frame making theirs). True while there is more to make.
	this.Prewarm = function()
	{
		if (!ready())
			return true;

		for (var i = 1; i < PLAYER_TINTS.length; ++i)
		{
			if (cache[i] === undefined)
			{
				this.GetSheet(i);
				return true;
			}
		}

		for (var j = 0; j < PLAYER_FLAME_COLORS.length; ++j)
		{
			if (flames[j] === undefined)
			{
				this.GetFlameSheet(j);
				return true;
			}
		}

		return false;
	}
}

if (typeof Engine !== 'undefined') var Tint = new TintPrototype();

if (typeof module !== 'undefined') module.exports = { TintRegion: TintRegion, PLAYER_TINTS: PLAYER_TINTS, PLAYER_FLAME_COLORS: PLAYER_FLAME_COLORS, FLAME_FRAMES: FLAME_FRAMES, FlameRecolor: FlameRecolor, FlameBlock: FlameBlock };
