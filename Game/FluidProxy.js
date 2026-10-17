// The fluid simulation running in a worker (FluidWorker.js), behind the same interface as FluidSolver: Burst / Splat /
// Clear / Step queue work for the worker, the winds and pictures are those of the latest frame it sent back (a frame or
// two old). Pure apart from the worker it is given, so Node tests can drive it with a fake one.
//
// makeWorker: () -> an object with postMessage(msg, transfer), onmessage and onerror (a Worker).
function FluidProxy(w, h, makeWorker)
{
	var n = w * h;
	var worker = makeWorker();
	var cmds = [];
	var gen = 0;               // bumped by every command: a frame that carries the current one has seen all of them
	var frameGen = -1;
	var inflight = false;      // a step request is out, its frame not back yet
	var pendingSteps = 0;
	var stepDt = 0;
	var solidDirty = true;
	var spare = [];            // spent frame buffers to hand back to the worker
	var fresh = false;
	var act = { Speed: 0, Smoke: 0, Heat: 0 };
	var smokeBytes = new Uint8ClampedArray(n * 4), glowBytes = new Uint8ClampedArray(n * 4);
	var self = this;

	this.W = w;
	this.H = h;
	this.Solid = new Uint8Array(n);
	this.U = new Float32Array(n);
	this.V = new Float32Array(n);
	this.Failed = false;

	worker.onmessage = function(e)
	{
		var f = e.data;

		if (!f || f.t != "frame")
			return;

		// the previous frame's buffers are free to be reused by the worker
		if (spare.length < 8)
			spare.push(self.U.buffer, self.V.buffer, smokeBytes.buffer, glowBytes.buffer);

		self.U = f.U;
		self.V = f.V;
		smokeBytes = f.smoke;
		glowBytes = f.glow;
		act = f.act;
		frameGen = f.gen;
		inflight = false;
		fresh = true;

		flush();
	};

	worker.onerror = function() { self.Failed = true; };

	worker.postMessage({ t: "init", w: w, h: h });

	function flush()
	{
		if (inflight || !pendingSteps)
			return;

		var transfer = spare.splice(0).filter(function(b) { return b.byteLength == n * 4; });
		var msg = { t: "step", gen: gen, steps: pendingSteps, dt: stepDt, cmds: cmds, solid: solidDirty ? self.Solid.slice() : null, recycle: transfer };

		cmds = [];
		pendingSteps = 0;
		solidDirty = false;
		inflight = true;

		worker.postMessage(msg, transfer);
	}

	this.Burst = function() { cmds.push(["b"].concat(Array.prototype.slice.call(arguments))); ++gen; }
	this.Splat = function() { cmds.push(["s"].concat(Array.prototype.slice.call(arguments))); ++gen; }

	this.Clear = function()
	{
		cmds = [["c"]];
		++gen;
		this.U.fill(0);
		this.V.fill(0);
		act = { Speed: 0, Smoke: 0, Heat: 0 };
		smokeBytes.fill(0);
		glowBytes.fill(0);
		fresh = true;
	}

	// One fluid step: asked of the worker as soon as it is free (a backlog is run as a few steps in one go).
	this.Step = function(dt)
	{
		stepDt = dt;
		pendingSteps = Math.min(3, pendingSteps + 1);
		flush();
	}

	this.MarkSolidChanged = function() { solidDirty = true; }

	this.Sample = function(f, x, y) { return FluidSampleField(f, w, h, x, y); }
	this.Activity = function() { return act; }

	// Quiet, and the latest frame is the result of everything asked so far
	this.Settled = function()
	{
		return frameGen == gen && !inflight && !pendingSteps && !cmds.length && FluidIsQuiet(act);
	}

	this.TakeFresh = function() { var f = fresh; fresh = false; return f; }

	this.RenderImages = function(smokeOut, glowOut)
	{
		smokeOut.set(smokeBytes);
		glowOut.set(glowBytes);
	}

	this.Dispose = function()
	{
		worker.onmessage = null;
		worker.onerror = null;

		if (worker.terminate)
			worker.terminate();
	}
}

if (typeof module !== 'undefined')
{
	var fluidModule = require('./Fluid.js');

	Object.assign(global, { FluidSampleField: fluidModule.FluidSampleField, FluidIsQuiet: fluidModule.FluidIsQuiet });
	module.exports = { FluidProxy: FluidProxy };
}
