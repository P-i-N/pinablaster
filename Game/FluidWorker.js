// The fluid simulation off the main thread. This file is the worker script (Worker("Game/FluidWorker.js")) and, with
// FluidWorkerCore, the part Node tests can drive directly. The main thread side is FluidProxy (FluidProxy.js).
//
// Messages in:  { t: "init", w, h }
//               { t: "step", gen, steps, dt, cmds, solid, recycle }
//                   cmds: ["b", ...Burst args] / ["s", ...Splat args] / ["c"] (clear), applied in order; solid: a Uint8Array copy
//                   of the obstacle cells when they changed (else null); recycle: spent buffers handed back for reuse.
// Messages out: { t: "frame", gen, act, U, V, smoke, glow }  (typed arrays; their buffers are transferred, not copied)

function FluidWorkerCore(post, makeSolver)
{
	var solver = null;
	var n = 0;

	function take(spare, bytes)
	{
		for (var i = 0; i < spare.length; ++i)
			if (spare[i].byteLength == bytes)
				return spare.splice(i, 1)[0];

		return new ArrayBuffer(bytes);
	}

	this.Handle = function(msg)
	{
		if (msg.t == "init")
		{
			solver = makeSolver(msg.w, msg.h);
			n = msg.w * msg.h;
			return;
		}

		if (msg.t != "step" || !solver)
			return;

		if (msg.solid)
			solver.Solid.set(msg.solid);

		for (var i = 0; i < msg.cmds.length; ++i)
		{
			var c = msg.cmds[i];

			if (c[0] == "b") solver.Burst.apply(solver, c.slice(1));
			else if (c[0] == "s") solver.Splat.apply(solver, c.slice(1));
			else if (c[0] == "c") solver.Clear();
		}

		for (var s = 0; s < msg.steps; ++s)
			solver.Step(msg.dt);

		var spare = (msg.recycle || []).slice();
		var frame = { t: "frame", gen: msg.gen, act: solver.Activity() };

		frame.U = new Float32Array(take(spare, n * 4));
		frame.V = new Float32Array(take(spare, n * 4));
		frame.smoke = new Uint8ClampedArray(take(spare, n * 4));
		frame.glow = new Uint8ClampedArray(take(spare, n * 4));
		frame.U.set(solver.U);
		frame.V.set(solver.V);
		solver.RenderImages(frame.smoke, frame.glow);

		post(frame, [frame.U.buffer, frame.V.buffer, frame.smoke.buffer, frame.glow.buffer]);
	}
}

if (typeof module !== 'undefined')
	module.exports = { FluidWorkerCore: FluidWorkerCore };

// Inside a worker: load the solver and serve messages.
if (typeof importScripts == 'function' && typeof document == 'undefined')
{
	importScripts("Fluid.js");

	var fluidWorkerCore = new FluidWorkerCore(function(msg, transfer) { postMessage(msg, transfer); }, function(w, h) { return new FluidSolver(w, h); });

	onmessage = function(e) { fluidWorkerCore.Handle(e.data); };
}
