// Engine class prototype
function EnginePrototype()
{
	this.Modules = [];
	this.Canvas = null;
	this.Context = null;
	this.Application = null;
	this.TickSpeed = 0.0;
	this.Time = 0.0;
	this.Keys = [];
	this.PauseModules = false;
	this.Paused = false;
	this.Debug = /[?&]debug\b/.test(window.location.search);

	var loop = null;
	var lastNow = 0;
	var instance = this;

	this.RegisterModule = function(module)
	{
		if (this.Modules.contains(module))
			return;

		this.Modules.push(module);
	}

	this.UnregisterModule = function(module)
	{
		return this.Modules.remove(module);
	}

	this.InternalTick = function()
	{
		if (!this.PauseModules)
		{
			for (var i = 0; i < this.Modules.length; ++i)
				this.Modules[i].Tick(this.TickSpeed);
		}

		if (this.Application != null)
			this.Application.Tick(this.TickSpeed);

		this.Time += this.TickSpeed;
	}

	// One animation frame: run due simulation steps, then draw once. (In turbo the turbo loop does all of it.)
	this.Frame = function(nowMs)
	{
		window.requestAnimationFrame(function(t) { instance.Frame(t); });

		if (!this.Turbo)
			this.Advance(nowMs, true);
	}

	// One fixed simulation step with its input and screen updates (driven by the turbo loop or by Sim).
	this.Step = function()
	{
		Input.Update();

		if (this.Application != null && this.Application.FrameUpdate)
			this.Application.FrameUpdate();

		if (!this.Paused)
			this.InternalTick();
	}

	this.Draw = function()
	{
		if (this.Application != null && this.Application.Draw)
			this.Application.Draw();
	}

	// Turbo: simulate as fast as possible - no sound, no waiting for animation frames, a frame drawn every
	// opts.drawEvery steps. opts: { drawEvery: 60, sliceMs: 12, run: true }; run: false = turbo state only,
	// the caller steps the game itself (Sim).
	this.Turbo = false;

	var turbo = null;
	var turboChannel = null;

	this.SetTurbo = function(on, opts)
	{
		opts = opts || {};
		turbo = null;
		this.Turbo = !!on;

		if (!on)
		{
			// back to real time: don't make up for the time spent in turbo
			lastNow = performance.now();

			if (loop)
				loop.Reset();

			return;
		}

		if (opts.run === false)
			return;

		var runner = new TurboRunner(function() { instance.Step(); }, function() { instance.Draw(); }, opts.drawEvery || 60, opts.sliceMs || 12);

		turbo = runner;

		// MessageChannel tasks keep coming in hidden tabs, unlike timers and animation frames
		if (!turboChannel)
			turboChannel = new MessageChannel();

		turboChannel.port1.onmessage = function()
		{
			if (turbo !== runner)
				return;

			runner.RunSlice(function() { return performance.now(); });
			turboChannel.port2.postMessage(0);
		};

		turboChannel.port2.postMessage(0);
	}

	// Input, due simulation steps and (optionally) drawing. Also driven by the background
	// ticker when the tab is hidden, because hidden tabs get no animation frames.
	this.Advance = function(nowMs, draw)
	{
		var dt = (nowMs - lastNow) * 0.001;
		lastNow = nowMs;

		// Tab was hidden or the machine hiccuped: don't fast-forward the game.
		if (dt > 0.25) dt = 0.25;
		if (dt < 0) dt = 0;

		Input.Update();

		if (this.Application != null && this.Application.FrameUpdate)
			this.Application.FrameUpdate();

		var steps = loop.Advance(dt);

		// A step can open a screen that pauses the game: stop stepping right then.
		for (var i = 0; i < steps && !this.Paused; ++i)
			this.InternalTick();

		if (draw && this.Application != null && this.Application.Draw)
			this.Application.Draw();
	}

	// A LAN host must keep simulating while its tab is in the background.
	var ticker = null;

	this.UseBackgroundTicker = function(on)
	{
		if (!on)
		{
			if (ticker)
				ticker.terminate();

			ticker = null;
			return;
		}

		if (ticker || typeof Worker == "undefined")
			return;

		try
		{
			var src = "setInterval(function() { postMessage(0); }, 16);";
			ticker = new Worker(URL.createObjectURL(new Blob([src], { type: "application/javascript" })));
			ticker.onmessage = function()
			{
				if (document.hidden && !instance.Turbo)
					instance.Advance(performance.now(), false);
			};
		}
		catch (e)
		{
			ticker = null;
		}
	}

	this.KeyDown = function(e)
	{
		this.Keys[e.keyCode] = true;

		if (this.Application)
			this.Application.KeyDown(e);
	}

	this.KeyUp = function(e)
	{
		this.Keys[e.keyCode] = false;

		if (this.Application)
			this.Application.KeyUp(e);
	}

	this.Run = function(canvas, app, tickSpeedMs)
	{
		this.Canvas = canvas;
		this.Context = canvas.getContext("2d");
		this.Application = app;
		this.TickSpeed = tickSpeedMs * 0.001;

		for (var i = 0; i < this.Modules.length; ++i)
			if (this.Modules[i].Init() == false)
				return false;

		if (this.Application != null)
			if (this.Application.Init() == false)
				return false;

		for (var i = 0; i < 256; ++i)
			this.Keys.push(false);

		document.addEventListener("keydown", function(e) { instance.KeyDown(e); });
		document.addEventListener("keyup", function(e) { instance.KeyUp(e); });

		Input.Init();
		AudioMixer.Init();

		loop = new FixedStepLoop(this.TickSpeed, 10);
		lastNow = performance.now();
		window.requestAnimationFrame(function(t) { instance.Frame(t); });

		// ?sim: start in turbo (fast-forward) mode
		if (/[?&]sim\b/.test(window.location.search))
			this.SetTurbo(true);

		return true;
	}

	// A LAN host forwards its sounds so guests hear them too.
	function forward(code)
	{
		if (typeof Net != "undefined" && Net.Role == "host" && Net.SoundQueue.length < 60)
			Net.SoundQueue.push(code);
	}

	this.PlaySound = function(id)
	{
		if (this.Turbo)
			return;

		AudioMixer.Play(id);
		forward(id);
	}

	this.StopSound = function(id)
	{
		if (this.Turbo)
			return;

		AudioMixer.Stop(id);
		forward("!" + id);
	}
}

var Engine = new EnginePrototype();
