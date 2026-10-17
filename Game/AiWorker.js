// One computer player's thinking off the main thread. This file is the worker script (Worker("Game/AiWorker.js")) and, with
// AiWorkerCore, the part Node tests can drive directly. The main thread side is AiController (AiBrain.js): every bot has a
// worker of its own, so the planning of eight bots runs on eight cores and never delays a game frame.
//
// Messages in:  { t: "plan", id, view, me, level }   view: the tile view (AiBuildView), me: AiSelf (with its memory), level: "easy" | ...
// Messages out: { t: "plan", id, plan }              plan: what AiDecide returned
//               { t: "error", id, message }

// decide(view, me, level, rng) -> plan; levels: AI_LEVELS; rng: () -> [0, 1)
function AiWorkerCore(post, decide, levels, rng)
{
	this.Handle = function(msg)
	{
		if (!msg || msg.t != "plan")
			return;

		try
		{
			post({ t: "plan", id: msg.id, plan: decide(msg.view, msg.me, levels[msg.level] || levels.normal, rng) });
		}
		catch (e)
		{
			post({ t: "error", id: msg.id, message: String(e && e.stack || e) });
		}
	}
}

if (typeof module !== 'undefined')
	module.exports = { AiWorkerCore: AiWorkerCore };

// Inside a worker: load the planner and serve messages.
if (typeof importScripts == 'function' && typeof document == 'undefined')
{
	importScripts("AiWorld.js", "AiBrain.js");

	var aiWorkerCore = new AiWorkerCore(function(msg) { postMessage(msg); }, AiDecide, AI_LEVELS, Math.random);

	onmessage = function(e) { aiWorkerCore.Handle(e.data); };
}
