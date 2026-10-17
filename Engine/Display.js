// Scales the fixed 576x324 virtual canvas to the window, 16:9 letterboxed.

var VIRTUAL_WIDTH = 576;
var VIRTUAL_HEIGHT = 324;

// scale = CSS pixels per virtual pixel. With snap, the scale is an integer in
// *device* pixels so the pixel art stays crisp on high-DPI screens.
function ComputeLayout(winW, winH, dpr, snap)
{
	dpr = dpr || 1;

	var deviceScale = Math.min(winW * dpr / VIRTUAL_WIDTH, winH * dpr / VIRTUAL_HEIGHT);

	if (snap && deviceScale >= 1)
		deviceScale = Math.floor(deviceScale);

	var scale = deviceScale / dpr;

	return {
		scale: scale,
		cssW: Math.max(1, Math.round(VIRTUAL_WIDTH * scale)),
		cssH: Math.max(1, Math.round(VIRTUAL_HEIGHT * scale))
	};
}

function DisplayPrototype()
{
	Engine.RegisterModule(this);

	this.VirtualWidth = VIRTUAL_WIDTH;
	this.VirtualHeight = VIRTUAL_HEIGHT;
	this.IntegerScale = false;

	var self = this;

	this.Resize = function()
	{
		var l = ComputeLayout(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, this.IntegerScale);
		Engine.Canvas.style.width = l.cssW + "px";
		Engine.Canvas.style.height = l.cssH + "px";
	}

	this.ToggleFullscreen = function()
	{
		var el = document.documentElement;

		if (document.fullscreenElement)
		{
			document.exitFullscreen();
		}
		else if (el.requestFullscreen)
		{
			// Refused (e.g. not a user gesture): stay windowed.
			el.requestFullscreen().catch(function() {});
		}
	}

	this.Init = function()
	{
		Engine.Canvas.width = VIRTUAL_WIDTH;
		Engine.Canvas.height = VIRTUAL_HEIGHT;
		Engine.Context.imageSmoothingEnabled = false;

		window.addEventListener("resize", function() { self.Resize(); });
		document.addEventListener("fullscreenchange", function() { self.Resize(); });

		document.addEventListener("keydown", function(e)
		{
			if (e.code == "KeyF" && !e.repeat)
				self.ToggleFullscreen();
		});

		var button = document.getElementById("fsButton");

		if (button)
			button.addEventListener("click", function() { self.ToggleFullscreen(); });

		this.Resize();
	}

	this.Tick = function(delta)
	{
	}
}

// Engine is absent under `node --test`; only ComputeLayout is exported there.
if (typeof Engine !== 'undefined') var Display = new DisplayPrototype();

if (typeof module !== 'undefined') module.exports = { ComputeLayout: ComputeLayout };
