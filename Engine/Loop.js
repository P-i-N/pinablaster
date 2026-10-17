// Fixed-step accumulator. Pure: no DOM, so it can be unit tested in Node.
function FixedStepLoop(stepSec, maxStepsPerFrame)
{
	this.StepSec = stepSec;
	this.MaxSteps = maxStepsPerFrame || 10;

	var acc = 0.0;

	// Feed elapsed seconds, get the number of simulation steps to run now.
	this.Advance = function(dtSec)
	{
		if (dtSec < 0) dtSec = 0;
		acc += dtSec;

		var steps = Math.floor(acc / this.StepSec + 1e-9);

		if (steps > this.MaxSteps)
		{
			steps = this.MaxSteps;
			acc = 0.0;
		}
		else
			acc -= steps * this.StepSec;

		if (acc < 0) acc = 0;

		return steps;
	}

	this.Reset = function()
	{
		acc = 0.0;
	}
}

if (typeof module !== 'undefined') module.exports = { FixedStepLoop: FixedStepLoop };
