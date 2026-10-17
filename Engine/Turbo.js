// Fast-forward ("turbo") helpers for simulations. Pure: no DOM, so they can be unit tested in Node.

// Runs as many fixed steps as fit in `sliceMs` of wall time (at least one), drawing every `drawEvery` steps.
function TurboRunner(step, draw, drawEvery, sliceMs)
{
	var sinceDraw = 0;

	this.Steps = 0;

	// now: () -> milliseconds. Returns the number of steps run.
	this.RunSlice = function(now)
	{
		var start = now(), n = 0;

		do
		{
			step();
			++n;

			if (++sinceDraw >= drawEvery)
			{
				sinceDraw = 0;
				draw();
			}
		}
		while (now() - start < sliceMs);

		this.Steps += n;

		return n;
	}
}

// Seeded random numbers in [0, 1) (mulberry32): with the same seed a simulation plays the same game.
function SeededRandom(seed)
{
	var a = seed >>> 0;

	return function()
	{
		a = (a + 0x6D2B79F5) >>> 0;

		var t = a;

		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

if (typeof module !== 'undefined')
	module.exports = { TurboRunner: TurboRunner, SeededRandom: SeededRandom };
