// Grid based Navier-Stokes fluid ("stable fluids", Stam): semi-Lagrangian advection, pressure projection,
// vorticity confinement. Pure maths, no DOM, so it can be unit tested in Node. Cosmetic only: nothing in the game reads it.
//
// Units: cells and seconds. Solid cells (walls, bricks) are no-flow obstacles. Cells outside the grid count as solid.
// Bilinear sample of a w x h field at cell coordinates (cell centres at +0.5).
function FluidSampleField(f, w, h, x, y)
{
	x -= 0.5; y -= 0.5;

	if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
	if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;

	var ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy;
	var i = iy * w + ix;

	return (f[i] * (1 - fx) + f[i + 1] * fx) * (1 - fy) + (f[i + w] * (1 - fx) + f[i + w + 1] * fx) * fy;
}

// Is a fluid with this Activity() (see FluidSolver) quiet enough to stop stepping it?
function FluidIsQuiet(a)
{
	return !(a.Speed > 0.05 || a.Smoke > 0.4 || a.Heat > 0.2);
}

function FluidSolver(w, h)
{
	var n = w * h;

	this.W = w;
	this.H = h;
	this.U = new Float32Array(n);
	this.V = new Float32Array(n);
	this.Smoke = new Float32Array(n);
	this.Heat = new Float32Array(n);
	this.HeatR = new Float32Array(n);       // the heat's colour: heat * red / green / blue (so mixed flames blend)
	this.HeatG = new Float32Array(n);
	this.HeatB = new Float32Array(n);
	this.Solid = new Uint8Array(n);
	this.Expansion = new Float32Array(n);   // gas being created here (1 / s): makes air push outwards, like a blast

	this.Damping = 2.4;         // velocity decay per second
	this.SmokeFade = 1.5;       // smoke decay per second
	this.HeatFade = 1.4;        // heat decay per second
	this.Vorticity = 1.5;       // swirl strength
	this.ExpansionFade = 4.0;   // a blast's expansion lasts about 1 / this seconds
	this.Iterations = 14;       // pressure solver iterations

	var u0 = new Float32Array(n), v0 = new Float32Array(n), s0 = new Float32Array(n), h0 = new Float32Array(n);
	var r0 = new Float32Array(n), g0 = new Float32Array(n), b0 = new Float32Array(n);
	var p = new Float32Array(n), div = new Float32Array(n), curl = new Float32Array(n);
	var self = this;

	this.Clear = function()
	{
		this.U.fill(0); this.V.fill(0); this.Smoke.fill(0); this.Heat.fill(0); this.HeatR.fill(0); this.HeatG.fill(0); this.HeatB.fill(0); this.Expansion.fill(0); p.fill(0);
	}

	this.IsSolid = function(x, y)
	{
		return x < 0 || y < 0 || x >= w || y >= h || this.Solid[y * w + x] != 0;
	}

	// Largest speed (cells / s) and total smoke: lets the caller skip stepping an idle fluid.
	this.Activity = function()
	{
		var m = 0, s = 0, hh = 0;

		for (var i = 0; i < n; ++i)
		{
			var sp = Math.abs(this.U[i]) + Math.abs(this.V[i]);

			if (sp > m) m = sp;

			s += this.Smoke[i];
			hh += this.Heat[i];
		}

		return { Speed: m, Smoke: s, Heat: hh };
	}

	// The same interface as FluidProxy (the simulation running in a worker), so callers do not care which they have.
	var fresh = false;

	this.Settled = function() { return FluidIsQuiet(this.Activity()); }
	this.TakeFresh = function() { var f = fresh; fresh = false; return f; }
	this.MarkSolidChanged = function() { }
	this.Dispose = function() { }

	// The picture of the fluid: smoke (dark, translucent) and glow (additive) as RGBA bytes, one pixel per cell.
	this.RenderImages = function(smokeBytes, glowBytes)
	{
		for (var i = 0, o = 0; i < n; ++i, o += 4)
		{
			var sm = this.Smoke[i];

			smokeBytes[o] = 18; smokeBytes[o + 1] = 17; smokeBytes[o + 2] = 16;
			smokeBytes[o + 3] = sm > 0.02 ? Math.min(200, sm * 300) : 0;

			// each colour channel glows by its own share of the heat (a hot spot saturates towards white)
			glowBytes[o] = 255 * (1 - Math.exp(-this.HeatR[i] * 1.4));
			glowBytes[o + 1] = 255 * (1 - Math.exp(-this.HeatG[i] * 1.4));
			glowBytes[o + 2] = 255 * (1 - Math.exp(-this.HeatB[i] * 1.4));
			glowBytes[o + 3] = 255;
		}
	}

	// Adds a soft round impulse (velocity, smoke, heat) around (cx, cy) in cell coordinates.
	this.Splat = function(cx, cy, radius, vx, vy, smoke, heat, color)
	{
		var x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(w - 1, Math.ceil(cx + radius));
		var y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(h - 1, Math.ceil(cy + radius));

		for (var y = y0; y <= y1; ++y)
		{
			for (var x = x0; x <= x1; ++x)
			{
				var i = y * w + x;

				if (this.Solid[i])
					continue;

				var dx = x + 0.5 - cx, dy = y + 0.5 - cy;
				var f = 1 - Math.sqrt(dx * dx + dy * dy) / radius;

				if (f <= 0)
					continue;

				f *= f;

				this.U[i] += vx * f;
				this.V[i] += vy * f;
				this.Smoke[i] += smoke * f;
				this.AddHeat(i, heat * f, color);
			}
		}
	}

	var FLAME = [1, 0.45, 0.08];

	// Heat of a colour ([r, g, b] in 0..1, default orange flame) into cell i.
	this.AddHeat = function(i, heat, color)
	{
		var c = color || FLAME;

		this.Heat[i] += heat;
		this.HeatR[i] += heat * c[0];
		this.HeatG[i] += heat * c[1];
		this.HeatB[i] += heat * c[2];
	}

	// Radial burst: air pushed away from (cx, cy). `expand` (1 / s) is gas created there: the pressure solver then
	// pushes the air out through whatever openings there are (a projection alone would cancel a purely radial push).
	this.Burst = function(cx, cy, radius, speed, smoke, heat, expand, color)
	{
		var x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(w - 1, Math.ceil(cx + radius));
		var y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(h - 1, Math.ceil(cy + radius));

		for (var y = y0; y <= y1; ++y)
		{
			for (var x = x0; x <= x1; ++x)
			{
				var i = y * w + x;

				if (this.Solid[i])
					continue;

				var dx = x + 0.5 - cx, dy = y + 0.5 - cy;
				var d = Math.sqrt(dx * dx + dy * dy);
				var f = 1 - d / radius;

				if (f <= 0)
					continue;

				f *= f;

				var inv = d > 0.001 ? 1 / d : 0;

				this.Expansion[i] += (expand || 0) * f;
				this.U[i] += dx * inv * speed * f;
				this.V[i] += dy * inv * speed * f;
				this.Smoke[i] += smoke * f;
				this.AddHeat(i, heat * f, color);
			}
		}
	}

	this.Sample = function(f, x, y)
	{
		return FluidSampleField(f, w, h, x, y);
	}

	// Semi-Lagrangian advection of several fields at once: the back-traced position (and its bilinear weights) is worked
	// out once per cell and reused for every field. pairs: [[dst, src], ...]
	var adv = new Int32Array(n), aw00 = new Float32Array(n), aw10 = new Float32Array(n), aw01 = new Float32Array(n), aw11 = new Float32Array(n);

	function advect(pairs, dt)
	{
		var U = self.U, V = self.V, solid = self.Solid;

		for (var y = 0, i = 0; y < h; ++y)
		{
			for (var x = 0; x < w; ++x, ++i)
			{
				if (solid[i]) { adv[i] = -1; continue; }

				var sx = x - dt * U[i], sy = y - dt * V[i];

				if (sx < 0) sx = 0; else if (sx > w - 1.001) sx = w - 1.001;
				if (sy < 0) sy = 0; else if (sy > h - 1.001) sy = h - 1.001;

				var ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy;

				adv[i] = iy * w + ix;
				aw00[i] = (1 - fx) * (1 - fy);
				aw10[i] = fx * (1 - fy);
				aw01[i] = (1 - fx) * fy;
				aw11[i] = fx * fy;
			}
		}

		for (var k = 0; k < pairs.length; ++k)
		{
			var dst = pairs[k][0], src = pairs[k][1];

			for (var j = 0; j < n; ++j)
			{
				var c = adv[j];

				dst[j] = c < 0 ? 0 : src[c] * aw00[j] + src[c + 1] * aw10[j] + src[c + w] * aw01[j] + src[c + w + 1] * aw11[j];
			}
		}
	}

	function enforceSolids()
	{
		var solid = self.Solid;

		for (var i = 0; i < n; ++i)
		{
			if (solid[i])
			{
				self.U[i] = 0; self.V[i] = 0; self.Smoke[i] = 0; self.Heat[i] = 0; self.HeatR[i] = 0; self.HeatG[i] = 0; self.HeatB[i] = 0; self.Expansion[i] = 0;
			}
		}
	}

	// Open neighbours of each cell as bits (1 left, 2 right, 4 up, 8 down) and their count: solid cells and the grid edge
	// are closed. Rebuilt on every Project (the caller may have changed Solid).
	var nbMask = new Uint8Array(n), nbCount = new Uint8Array(n);

	function buildNeighbours()
	{
		var solid = self.Solid;

		for (var y = 0, i = 0; y < h; ++y)
		{
			for (var x = 0; x < w; ++x, ++i)
			{
				var m = 0;

				if (!solid[i])
				{
					if (x > 0 && !solid[i - 1]) m |= 1;
					if (x < w - 1 && !solid[i + 1]) m |= 2;
					if (y > 0 && !solid[i - w]) m |= 4;
					if (y < h - 1 && !solid[i + w]) m |= 8;
				}

				nbMask[i] = m;
				nbCount[i] = (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
			}
		}
	}

	// Makes the flow divergence free (or, with Expansion, divergent exactly as much as the gas created there). The
	// pressure keeps its last values as the starting guess, so a few iterations are enough step after step.
	this.Project = function()
	{
		var U = this.U, V = this.V, solid = this.Solid, E = this.Expansion;

		buildNeighbours();

		for (var i = 0; i < n; ++i)
		{
			var m = nbMask[i];

			if (solid[i]) { p[i] = 0; div[i] = 0; continue; }

			div[i] = 0.5 * (((m & 2) ? U[i + 1] : 0) - ((m & 1) ? U[i - 1] : 0) + ((m & 8) ? V[i + w] : 0) - ((m & 4) ? V[i - w] : 0)) - E[i];
		}

		for (var it = 0; it < this.Iterations; ++it)
		{
			for (var i = 0; i < n; ++i)
			{
				var c = nbCount[i];

				if (!c) continue;

				var m = nbMask[i], sum = 0;

				if (m & 1) sum += p[i - 1];
				if (m & 2) sum += p[i + 1];
				if (m & 4) sum += p[i - w];
				if (m & 8) sum += p[i + w];

				p[i] = (sum - div[i]) / c;
			}
		}

		for (var i = 0; i < n; ++i)
		{
			if (solid[i]) { U[i] = 0; V[i] = 0; continue; }

			var m = nbMask[i];
			var pl = (m & 1) ? p[i - 1] : p[i], pr = (m & 2) ? p[i + 1] : p[i];
			var pu = (m & 4) ? p[i - w] : p[i], pd = (m & 8) ? p[i + w] : p[i];

			U[i] -= 0.5 * (pr - pl);
			V[i] -= 0.5 * (pd - pu);
		}
	}

	// Mean absolute divergence of the fluid cells (a test / debugging helper).
	this.Divergence = function()
	{
		var U = this.U, V = this.V, sum = 0, cnt = 0;

		for (var y = 0, i = 0; y < h; ++y)
		{
			for (var x = 0; x < w; ++x, ++i)
			{
				if (this.Solid[i]) continue;

				var ul = this.IsSolid(x - 1, y) ? 0 : U[i - 1], ur = this.IsSolid(x + 1, y) ? 0 : U[i + 1];
				var vu = this.IsSolid(x, y - 1) ? 0 : V[i - w], vd = this.IsSolid(x, y + 1) ? 0 : V[i + w];

				sum += Math.abs(0.5 * (ur - ul + vd - vu));
				++cnt;
			}
		}

		return cnt ? sum / cnt : 0;
	}

	function confineVorticity(dt)
	{
		var U = self.U, V = self.V, solid = self.Solid;

		for (var y = 1; y < h - 1; ++y)
		{
			for (var x = 1; x < w - 1; ++x)
			{
				var i = y * w + x;

				curl[i] = solid[i] ? 0 : 0.5 * ((V[i + 1] - V[i - 1]) - (U[i + w] - U[i - w]));
			}
		}

		for (var y = 2; y < h - 2; ++y)
		{
			for (var x = 2; x < w - 2; ++x)
			{
				var i = y * w + x;

				if (solid[i]) continue;

				var gx = 0.5 * (Math.abs(curl[i + 1]) - Math.abs(curl[i - 1]));
				var gy = 0.5 * (Math.abs(curl[i + w]) - Math.abs(curl[i - w]));
				var len = Math.sqrt(gx * gx + gy * gy) + 1e-5;

				U[i] += dt * self.Vorticity * (gy / len) * curl[i];
				V[i] -= dt * self.Vorticity * (gx / len) * curl[i];
			}
		}
	}

	this.Step = function(dt)
	{
		var damp = Math.exp(-this.Damping * dt), sf = Math.exp(-this.SmokeFade * dt), hf = Math.exp(-this.HeatFade * dt);

		confineVorticity(dt);

		var ef = Math.exp(-this.ExpansionFade * dt);

		for (var i = 0; i < n; ++i)
			this.Expansion[i] *= ef;

		advect([[u0, this.U], [v0, this.V], [s0, this.Smoke], [h0, this.Heat], [r0, this.HeatR], [g0, this.HeatG], [b0, this.HeatB]], dt);

		for (var i = 0; i < n; ++i)
		{
			this.U[i] = u0[i] * damp;
			this.V[i] = v0[i] * damp;
			this.Smoke[i] = s0[i] * sf;
			this.Heat[i] = h0[i] * hf;
			this.HeatR[i] = r0[i] * hf;
			this.HeatG[i] = g0[i] * hf;
			this.HeatB[i] = b0[i] * hf;
		}

		this.Project();
		enforceSolids();
		fresh = true;
	}
}

if (typeof module !== 'undefined') module.exports = { FluidSolver: FluidSolver, FluidSampleField: FluidSampleField, FluidIsQuiet: FluidIsQuiet };
