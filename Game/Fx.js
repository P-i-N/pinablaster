// Visual effects driven by a fluid simulation: wind from explosions and moving entities, smoke and glow,
// brick fragments and ice shards that fly on that wind and bounce off walls. Purely cosmetic and purely an observer:
// it reads the entities and the walls, never writes to the game, and uses its own random numbers, so seeded Sim runs,
// the AI and LAN snapshots are unaffected. A LAN guest runs it too, fed by the entities and walls of the snapshots.
//
// FxController is pure (everything it needs comes through `env`) so Node can test it; FxPrototype wires it to the game.

var FX_CELLS_PER_TILE = 4;
var FX_SKULL_FRAME = 165;    // sprite frame of the skull power-up (160 + power-up type 5)
var FX_STEP = 0.02;          // fluid / particle step (s)
var FX_BRICK_WAIT = 0.6;     // a broken brick waits this long for its explosion to show up (LAN guests see walls first)

// env: { Walls(): string[], BlockWidth, BlockHeight, Entities(): entity[], BrickColors(): string[],
//        CreateFluid(w, h) (optional: a FluidSolver, or a FluidProxy to run it in a worker),
//        OwnerIndex(explosion) -> index of the player whose flames these are, -1 for nobody (optional),
//        Scorch(x, y, alpha, radius) (optional: darken the ground there), ClearScorch() (optional) }
function FxController(env)
{
	var BW = env.BlockWidth, BH = env.BlockHeight;
	var cw = BW / FX_CELLS_PER_TILE, ch = BH / FX_CELLS_PER_TILE;

	var walls = env.Walls();
	var tilesX = walls[0].length, tilesY = walls.length;

	this.Grid = new CollisionGrid(tilesX, tilesY, BW, BH);
	this.Fluid = env.CreateFluid ? env.CreateFluid(tilesX * FX_CELLS_PER_TILE, tilesY * FX_CELLS_PER_TILE) : new FluidSolver(tilesX * FX_CELLS_PER_TILE, tilesY * FX_CELLS_PER_TILE);
	this.Particles = new ParticleSystem(1400);
	this.Clock = 0;
	this.Dirty = false;     // the fluid changed since it was last drawn

	var self = this;
	var fluid = this.Fluid;
	var acc = 0;
	var rngState = 0x9E3779B9;
	var prevWalls = null;
	var blastTiles = {};    // "tx,ty" -> time of the latest explosion there
	var seenBlasts = {};    // ids of explosions that already pushed the air
	var tracked = {};       // id -> { type, x, y, t, vx, vy, ct }
	var pending = [];       // broken bricks waiting for an explosion
	var fresh = true;       // first look at a (new) level: remember, don't react
	var active = false;

	function rnd()
	{
		rngState = (rngState + 0x6D2B79F5) | 0;

		var t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	function range(a, b) { return a + (b - a) * rnd(); }

	var gridVersion = -1;

	// level walls and ice blocks, as the collision grid sees them
	this.SolidAtPx = function(x, y)
	{
		return self.Grid.IsSolidPx(x, y);
	}

	this.Reset = function()
	{
		fluid.Clear();
		this.Particles.Clear();
		blastTiles = {};
		seenBlasts = {};
		tracked = {};
		pending = [];
		fresh = true;
		active = false;
		this.Dirty = true;

		if (env.ClearScorch)
			env.ClearScorch();
	}

	// Keeps the fluid's obstacle cells in step with the collision grid (only when it changed).
	function updateSolids()
	{
		self.Grid.Update(env.Walls(), env.Entities());

		if (self.Grid.Version == gridVersion)
			return;

		gridVersion = self.Grid.Version;

		for (var ty = 0; ty < tilesY; ++ty)
		{
			for (var tx = 0; tx < tilesX; ++tx)
			{
				var s = self.Grid.IsSolidTile(tx, ty) ? 1 : 0;

				for (var cy = 0; cy < FX_CELLS_PER_TILE; ++cy)
					for (var cx = 0; cx < FX_CELLS_PER_TILE; ++cx)
						fluid.Solid[(ty * FX_CELLS_PER_TILE + cy) * fluid.W + tx * FX_CELLS_PER_TILE + cx] = s;
			}
		}

		fluid.MarkSolidChanged();
	}

	// Compare with the previous walls: a brick that turned into anything else was destroyed.
	function syncWalls()
	{
		var cur = env.Walls();

		if (cur.length != tilesY || cur[0].length != tilesX)
			return;

		var changed = 0, broken = [];

		for (var ty = 0; ty < tilesY; ++ty)
		{
			if (prevWalls && prevWalls[ty] === cur[ty])
				continue;

			for (var tx = 0; tx < tilesX; ++tx)
			{
				var c = cur[ty][tx], p = prevWalls ? prevWalls[ty][tx] : c;

				if (c == p)
					continue;

				++changed;

				if (p == "1" && c != "1")
					broken.push([tx, ty]);
			}
		}

		walls = cur;

		if (!prevWalls || changed > 80)
		{
			// a new level (or the first look): start clean
			self.Reset();
			broken = [];
		}

		prevWalls = cur.slice();

		for (var i = 0; i < broken.length; ++i)
			pending.push({ tx: broken[i][0], ty: broken[i][1], t: self.Clock });
	}

	function blastNear(tx, ty)
	{
		var keys = [tx + "," + ty, (tx - 1) + "," + ty, (tx + 1) + "," + ty, tx + "," + (ty - 1), tx + "," + (ty + 1)];

		for (var i = 0; i < keys.length; ++i)
			if (blastTiles[keys[i]] !== undefined && self.Clock - blastTiles[keys[i]] < FX_BRICK_WAIT)
				return true;

		return false;
	}

	function windAt(x, y, out)
	{
		var cx = x / cw, cy = y / ch;

		out[0] = fluid.Sample(fluid.U, cx, cy) * cw;
		out[1] = fluid.Sample(fluid.V, cx, cy) * ch;
	}

	this.WindAt = windAt;

	function color(list, fallback)
	{
		return list && list.length ? list[Math.floor(rnd() * list.length)] : fallback;
	}

	// Particles live this much of the life they are given (they vanish twice as fast)
	var PARTICLE_LIFE_SCALE = 0.5;

	function addParticle(p)
	{
		p.life *= PARTICLE_LIFE_SCALE;

		return self.Particles.Add(p);
	}

	function spawnFragments(tx, ty)
	{
		var colors = env.BrickColors();
		var n = Math.floor(range(44, 64)), w = [0, 0];

		for (var i = 0; i < n; ++i)
		{
			var x = (tx + rnd()) * BW, y = (ty + rnd()) * BH;
			var a = rnd() * Math.PI * 2, sp = range(20, 110);

			windAt(x, y, w);

			addParticle(
			{
				x: x, y: y, vx: w[0] * 0.5 + Math.cos(a) * sp, vy: w[1] * 0.5 + Math.sin(a) * sp,
				z: range(2, 10), vz: range(40, 150), life: range(3, 6.5), size: range(0.8, 2.2),
				color: color(colors, "#a0522d"), kind: "brick", light: range(0.6, 1.4)
			});
		}

		fluid.Splat((tx + 0.5) * FX_CELLS_PER_TILE, (ty + 0.5) * FX_CELLS_PER_TILE, FX_CELLS_PER_TILE, 0, 0, 0.7, 0.2);
	}

	function spawnShards(x, y)
	{
		var w = [0, 0];

		for (var i = 0; i < 24; ++i)
		{
			var a = rnd() * Math.PI * 2, sp = range(20, 90);
			var px = x + BW / 2 + range(-6, 6), py = y + BH / 2 + range(-6, 6);

			windAt(px, py, w);

			addParticle(
			{
				x: px, y: py, vx: w[0] * 0.4 + Math.cos(a) * sp, vy: w[1] * 0.4 + Math.sin(a) * sp,
				z: range(2, 8), vz: range(40, 120), life: range(1.5, 3.5), size: range(0.7, 1.6),
				color: rnd() < 0.5 ? "#dff6ff" : "#8fd3f4", kind: "ice", light: range(0.8, 1.6)
			});
		}

		fluid.Splat((x + BW / 2) / cw, (y + BH / 2) / ch, FX_CELLS_PER_TILE * 0.875, 0, 0, 0.3, 0);
	}

	function spawnSparkles(x, y, embers)
	{
		var w = [0, 0];

		for (var i = 0; i < 18; ++i)
		{
			var a = rnd() * Math.PI * 2, sp = range(15, 60);
			var px = x + BW / 2, py = y + BH / 2;

			windAt(px, py, w);

			addParticle(
			{
				x: px, y: py, vx: w[0] * 0.3 + Math.cos(a) * sp, vy: w[1] * 0.3 + Math.sin(a) * sp,
				z: range(4, 10), vz: range(30, 90), life: range(0.6, 1.3), size: range(0.8, 1.4),
				color: embers ? (rnd() < 0.5 ? "#ffb347" : "#ff6a1a") : (rnd() < 0.5 ? "#fff6a0" : "#ffffff"), kind: "spark", light: 1
			});
		}
	}

	// Blue dust from a broken pickup (a skull letting out an enemy also gets a gust of wind).
	function spawnDust(x, y, count, gust)
	{
		var w = [0, 0];

		for (var i = 0; i < count; ++i)
		{
			var a = rnd() * Math.PI * 2, sp = range(15, 95);
			var px = x + BW / 2 + range(-4, 4), py = y + BH / 2 + range(-4, 4);

			windAt(px, py, w);

			addParticle(
			{
				x: px, y: py, vx: w[0] * 0.4 + Math.cos(a) * sp, vy: w[1] * 0.4 + Math.sin(a) * sp,
				z: range(2, 12), vz: range(20, 110), life: range(1.2, 3.2), size: range(0.8, 1.8),
				color: ["#bfe6ff", "#7ec8f5", "#4aa3e8", "#2f7fd0"][Math.floor(rnd() * 4)], kind: "dust", light: range(0.6, 1.5)
			});
		}

		if (gust)
		{
			fluid.Burst((x + BW / 2) / cw, (y + BH / 2) / ch, FX_CELLS_PER_TILE * 1.125, 3 * FX_CELLS_PER_TILE / 4, 0, 0, 20);
			active = true;
		}
	}

	function enemyBornAt(born, v)
	{
		for (var i = 0; i < born.length; ++i)
			if (Math.abs(born[i].x - v.x) < BW && Math.abs(born[i].y - v.y) < BH)
				return true;

		return false;
	}

	function movesAir(type)
	{
		return type == "Player" || type == "Enemy" || type == "Bomb" || type == "IceBlock" || type == "Shot" || type == "MagicCarpet";
	}

	function observeEntities()
	{
		var list = env.Entities(), seen = {}, now = self.Clock;
		var vanished = [];
		var flames = [], born = [];

		// where the flames are: a blast with more flames (a bigger power) burns brighter
		for (var i = 0; i < list.length; ++i)
			if (list[i].Type == "Explosion")
				flames.push([Math.floor((list[i].X + BW / 2) / BW), Math.floor((list[i].Y + BH / 2) / BH)]);

		for (var i = 0; i < list.length; ++i)
		{
			var e = list[i], id = e.ID;

			if (id === undefined || id === null || id === 0)
				continue;

			seen[id] = true;

			var t = tracked[id];

			if (!t)
			{
				t = tracked[id] = { type: e.Type, x: e.X, y: e.Y, t: now, vx: 0, vy: 0, ct: -1, skull: false };

				if (e.Type == "Enemy")
					born.push(t);
			}
			else
			{
				t.type = e.Type;

				if (e.X != t.x || e.Y != t.y)
				{
					var dt = Math.max(now - t.t, 0.008);

					t.vx = (e.X - t.x) / dt;
					t.vy = (e.Y - t.y) / dt;
					t.x = e.X; t.y = e.Y; t.t = now;
				}
				else if (now - t.t > 0.12)
				{
					t.vx = 0; t.vy = 0;
				}
			}

			if (e.Type == "PowerUp" && e.Sprite && e.Sprite.GetActualFrame)
				t.skull = e.Sprite.GetActualFrame() == FX_SKULL_FRAME;

			if (fresh)
			{
				if (e.Type == "Explosion")
					seenBlasts[id] = true;

				continue;
			}

			var cx = (e.X + BW / 2) / cw, cy = (e.Y + BH / 2) / ch;

			if (e.Type == "Explosion")
			{
				if (!seenBlasts[id])
				{
					seenBlasts[id] = true;
					blastTiles[Math.floor((e.X + BW / 2) / BW) + "," + Math.floor((e.Y + BH / 2) / BH)] = now;

					var ex = Math.floor((e.X + BW / 2) / BW), ey = Math.floor((e.Y + BH / 2) / BH), n = 0;

					for (var k = 0; k < flames.length; ++k)
						if ((flames[k][0] == ex && Math.abs(flames[k][1] - ey) <= 6) || (flames[k][1] == ey && Math.abs(flames[k][0] - ex) <= 6))
							++n;

					// every flame tile darkens the ground a little; the middle of a blast (the most flames around) the most
					if (env.Scorch)
						env.Scorch(e.X + BW / 2, e.Y + BH / 2, 0.016 * Math.min(n, 25), BW * 1.4);

					var owner = env.OwnerIndex ? env.OwnerIndex(e) : -1;

					fluid.Burst(cx, cy, FX_CELLS_PER_TILE * 1.375, 2.5 * FX_CELLS_PER_TILE / 4, 0.5 + 0.13 * Math.min(n, 25), 0.6 * (0.4 + 0.15 * Math.min(n, 25)), 18, owner >= 0 ? PLAYER_FLAME_COLORS[owner % PLAYER_FLAME_COLORS.length] : null);
					active = true;
				}
			}
			else if (movesAir(e.Type))
			{
				var speed = Math.abs(t.vx) + Math.abs(t.vy);

				if (speed > 4 && now - t.t < 0.12)
				{
					// push the air along: a gentle wake behind anything that moves
					var k = 0.006 / cw;
					var dust = (e.Type == "Player" || e.Type == "Enemy") ? 0.02 : 0;

					fluid.Splat(cx, cy, FX_CELLS_PER_TILE * 0.65, t.vx * k, t.vy * k, dust, 0);
					active = true;
				}
			}
			else if (e.Type == "PowerUp" && rnd() < 0.15)
			{
				fluid.Splat(cx, cy, FX_CELLS_PER_TILE * 0.45, 0, 0, 0.02, 0);
			}

			if (e.Type == "Bomb" && rnd() < 0.2)
			{
				fluid.Splat(cx, cy - FX_CELLS_PER_TILE / 4, FX_CELLS_PER_TILE * 0.3, 0, -2 * FX_CELLS_PER_TILE / 4, 0.06, 0.05);
				active = true;
			}
		}

		if (!fresh)
		{
			for (var id in tracked)
				if (!seen[id])
					vanished.push(tracked[id]);
		}

		for (var id in tracked)
			if (!seen[id])
				delete tracked[id];

		// bookkeeping only for what is still around, so a long game doesn't grow the tables
		for (var id in seenBlasts)
			if (!seen[id])
				delete seenBlasts[id];

		if (vanished.length < 40)
		{
			for (var i = 0; i < vanished.length; ++i)
			{
				var v = vanished[i], tx = Math.floor((v.x + BW / 2) / BW), ty = Math.floor((v.y + BH / 2) / BH);

				if (v.type == "IceBlock")
					spawnShards(v.x, v.y);
				else if (v.type == "PowerUp")
				{
					var burnt = blastNear(tx, ty);

					// a skull that broke open (or blew up) and any pickup a blast destroys crumble into blue dust
					if (v.skull && enemyBornAt(born, v))
					{
						spawnDust(v.x, v.y, 96, true);
					}
					else
					{
						if (burnt)
							spawnDust(v.x, v.y, v.skull ? 96 : 56, false);

						spawnSparkles(v.x, v.y, burnt);
					}
				}
			}
		}

		fresh = false;
	}

	function resolveBricks()
	{
		for (var i = pending.length - 1; i >= 0; --i)
		{
			var b = pending[i];

			if (blastNear(b.tx, b.ty))
			{
				spawnFragments(b.tx, b.ty);
				pending.splice(i, 1);
				active = true;
			}
			else if (self.Clock - b.t > FX_BRICK_WAIT)
				pending.splice(i, 1);
		}
	}

	function step()
	{
		syncWalls();
		updateSolids();
		observeEntities();
		resolveBricks();

		for (var k in blastTiles)
			if (self.Clock - blastTiles[k] > FX_BRICK_WAIT * 2)
				delete blastTiles[k];

		if (active)
		{
			fluid.Step(FX_STEP);
			active = !fluid.Settled();
		}

		// a new picture of the fluid (with a worker it arrives some time after the step was asked for)
		if (fluid.TakeFresh())
			self.Dirty = true;

		if (self.Particles.List.length)
			self.Particles.Step(FX_STEP, windAt, function(x, y) { return self.SolidAtPx(x, y); });
	}

	// Called every game tick with the tick length (s); runs fixed fluid steps.
	this.Tick = function(delta)
	{
		this.Clock += delta;
		acc += delta;

		var n = 0;

		while (acc >= FX_STEP && n < 3)
		{
			acc -= FX_STEP;
			++n;
			step();
		}

		if (acc > FX_STEP * 3)
			acc = 0;
	}
}

if (typeof module !== 'undefined') module.exports = { FxController: FxController, FX_CELLS_PER_TILE: FX_CELLS_PER_TILE, FX_STEP: FX_STEP };

// ----- Browser side: rendering and the hookup to the game -----

function FxPrototype()
{
	Engine.RegisterModule(this);

	this.Controller = null;

	var smokeCanvas = null, smokeCtx = null, smokeData = null;
	var glowCanvas = null, glowCtx = null, glowData = null;
	var brickColors = null;
	var useWorker = true;
	var scorchCanvas = null, scorchCtx = null;
	var drawnClock = -1;

	function enabled()
	{
		return Settings.Values.effects !== false && !Engine.Turbo;
	}

	// The colours of the real brick sprite, so a broken brick crumbles into brick-coloured bits.
	function sampleBrickColors()
	{
		var sheet = Renderer.SpriteSheet;

		if (!sheet || !sheet.IsLoaded)
			return null;

		try
		{
			var c = document.createElement("canvas");
			var ctx;
			var size = GameWorld.BlockWidth, idx = GameWorld.WallSpriteOffset + 1;

			c.width = size; c.height = size;
			ctx = c.getContext("2d");
			ctx.drawImage(sheet.Image, (idx % sheet.SpriteCountX) * sheet.SpriteWidth + sheet.InnerOffsetX, Math.floor(idx / sheet.SpriteCountX) * sheet.SpriteHeight + sheet.InnerOffsetY, size, size, 0, 0, size, size);

			var data = ctx.getImageData(0, 0, size, size).data, out = [];

			for (var i = 0; i < data.length; i += 4)
				if (data[i + 3] > 200)
					out.push("rgb(" + data[i] + "," + data[i + 1] + "," + data[i + 2] + ")");

			return out.length ? out : null;
		}
		catch (e)
		{
			return null;
		}
	}

	// The fluid in a worker thread when the browser allows it, else on this thread
	function createFluid(w, h)
	{
		if (useWorker && typeof Worker != "undefined" && typeof FluidProxy != "undefined")
		{
			try
			{
				return new FluidProxy(w, h, function() { return new Worker("Game/FluidWorker.js"); });
			}
			catch (e)
			{
				useWorker = false;
			}
		}

		return new FluidSolver(w, h);
	}

	function build()
	{
		var self = this;

		if (this.Controller)
			this.Controller.Fluid.Dispose();

		scorchCanvas = document.createElement("canvas");
		scorchCanvas.width = GameWorld.Walls[0].length * GameWorld.BlockWidth;
		scorchCanvas.height = GameWorld.Walls.length * GameWorld.BlockHeight;
		scorchCtx = scorchCanvas.getContext("2d");

		this.Controller = new FxController(
		{
			Walls: function() { return GameWorld.Walls; },
			BlockWidth: GameWorld.BlockWidth,
			BlockHeight: GameWorld.BlockHeight,
			Entities: function() { return GameEntityManager.Entities; },
			CreateFluid: createFluid,
			OwnerIndex: function(e) { return e.OwnerPlayer !== undefined ? e.OwnerPlayer : ExplosionOwnerIndex(e); },
			Scorch: function(x, y, alpha, radius)
			{
				var g = scorchCtx.createRadialGradient(x, y, 0, x, y, radius);

				g.addColorStop(0, "rgba(0,0,0," + alpha + ")");
				g.addColorStop(1, "rgba(0,0,0,0)");
				scorchCtx.fillStyle = g;
				scorchCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
			},
			ClearScorch: function() { scorchCtx.clearRect(0, 0, scorchCanvas.width, scorchCanvas.height); },
			BrickColors: function()
			{
				if (!brickColors)
					brickColors = sampleBrickColors() || [];

				return brickColors;
			}
		});

		var f = this.Controller.Fluid;

		smokeCanvas = document.createElement("canvas"); smokeCanvas.width = f.W; smokeCanvas.height = f.H;
		glowCanvas = document.createElement("canvas"); glowCanvas.width = f.W; glowCanvas.height = f.H;
		smokeCtx = smokeCanvas.getContext("2d"); glowCtx = glowCanvas.getContext("2d");
		smokeData = smokeCtx.createImageData(f.W, f.H);
		glowData = glowCtx.createImageData(f.W, f.H);
	}

	this.Init = function() { return true; }

	var prewarming = true;

	this.Tick = function(delta)
	{
		// recoloured sprite sheets, one per tick, while the game has nothing better to do
		if (prewarming && typeof Tint != "undefined")
			prewarming = Tint.Prewarm();

		if (!enabled() || !GameWorld.Walls.length || !GameWorld.Walls[0] || !GameWorld.BlockWidth)
			return;

		var w = GameWorld.Walls;

		// a worker that failed to start or died: carry on on this thread
		if (this.Controller && this.Controller.Fluid.Failed)
			useWorker = false;

		if (!this.Controller || this.Controller.Fluid.Failed || this.Controller.Fluid.W != w[0].length * FX_CELLS_PER_TILE || this.Controller.Fluid.H != w.length * FX_CELLS_PER_TILE)
			build.call(this);

		this.Controller.Tick(delta);
	}

	function refreshImages(f)
	{
		f.RenderImages(smokeData.data, glowData.data);

		smokeCtx.putImageData(smokeData, 0, 0);
		glowCtx.putImageData(glowData, 0, 0);
	}

	// The ground darkened by earlier blasts: drawn right over the ground, under everything else.
	this.DrawScorch = function(ctx)
	{
		if (!this.Controller || !enabled() || !scorchCanvas)
			return;

		ctx.globalAlpha = 0.8;
		ctx.drawImage(scorchCanvas, 0, 0);
		ctx.globalAlpha = 1;
	}

	// Fragments, shards and sparks: drawn between the ground and the walls, under the entities.
	this.DrawParticles = function(ctx)
	{
		var c = this.Controller;

		if (!c || !enabled())
			return;

		var list = c.Particles.List;

		for (var i = 0; i < list.length; ++i)
		{
			var p = list[i];
			var a = Math.min(1, (p.maxLife - p.age) * 1.5);
			var s = 1;

			// shadow on the floor, the piece itself raised by its height
			if (p.kind != "spark" && p.z > 0.5)
			{
				ctx.globalAlpha = 0.25 * a;
				ctx.fillStyle = "#000";
				ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2 + 1), s, 1);
			}

			ctx.globalAlpha = a;
			ctx.fillStyle = p.color;
			ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - p.z * 0.6 - s / 2), s, s);
		}

		ctx.globalAlpha = 1;
	}

	// Smoke and glow: drawn over the ground and walls, under the explosions and the other entities.
	this.DrawSmoke = function(ctx)
	{
		var c = this.Controller;

		if (!c || !enabled())
			return;

		var f = c.Fluid;

		if (c.Dirty)
		{
			refreshImages(f);
			c.Dirty = false;
		}

		var W = f.W * GameWorld.BlockWidth / FX_CELLS_PER_TILE, H = f.H * GameWorld.BlockHeight / FX_CELLS_PER_TILE;

		if (smokeCanvas)
		{
			var old = ctx.imageSmoothingEnabled;

			ctx.imageSmoothingEnabled = true;
			ctx.drawImage(smokeCanvas, 0, 0, W, H);

			ctx.globalCompositeOperation = "lighter";
			ctx.globalAlpha = 0.85;
			ctx.drawImage(glowCanvas, 0, 0, W, H);
			ctx.globalCompositeOperation = "source-over";
			ctx.globalAlpha = 1;
			ctx.imageSmoothingEnabled = old;
		}
	}
}

if (typeof Engine !== 'undefined') var Fx = new FxPrototype();
