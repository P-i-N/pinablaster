// The mouse over the game canvas, in virtual (576x324) coordinates. The menus read it (Screens.js): hovering selects,
// a left click confirms, a right click goes back.

// Where a pointer at (clientX, clientY) is on the virtual canvas, given the canvas's on-screen box (getBoundingClientRect).
function ClientToVirtual(clientX, clientY, rect, virtualWidth, virtualHeight)
{
	if (!rect || rect.width <= 0 || rect.height <= 0)
		return { x: -1, y: -1, inside: false };

	var x = (clientX - rect.left) * virtualWidth / rect.width;
	var y = (clientY - rect.top) * virtualHeight / rect.height;

	return { x: x, y: y, inside: x >= 0 && y >= 0 && x < virtualWidth && y < virtualHeight };
}

var MOUSE_CLICK_LIFE = 3000;  // ms a click waits to be handled (the screen may be slow to come round to it)

function MousePrototype()
{
	Engine.RegisterModule(this);

	this.X = -1;
	this.Y = -1;
	this.Inside = false;

	var moved = false;
	var clicks = [];
	var self = this;

	function track(e)
	{
		var p = ClientToVirtual(e.clientX, e.clientY, Engine.Canvas.getBoundingClientRect(), Display.VirtualWidth, Display.VirtualHeight);

		if (p.x != self.X || p.y != self.Y)
			moved = true;

		self.X = p.x;
		self.Y = p.y;
		self.Inside = p.inside;
	}

	this.Init = function()
	{
		var canvas = Engine.Canvas;

		canvas.addEventListener("mousemove", track);
		canvas.addEventListener("mouseleave", function() { self.Inside = false; });

		canvas.addEventListener("mousedown", function(e)
		{
			track(e);
			clicks.push({ x: self.X, y: self.Y, button: e.button, at: performance.now() });

			if (clicks.length > 8)
				clicks.shift();
		});

		return true;
	}

	this.Tick = function(delta)
	{
	}

	// Did the pointer move since the last call?
	this.TakeMoved = function()
	{
		var m = moved;

		moved = false;

		return m;
	}

	// The oldest click not handled yet: { x, y, button (0 left, 2 right) }, or null.
	this.TakeClick = function()
	{
		var now = performance.now();

		while (clicks.length)
		{
			var c = clicks.shift();

			if (now - c.at <= MOUSE_CLICK_LIFE)
				return c;
		}

		return null;
	}

	// Forget clicks nobody was there to handle.
	this.Flush = function()
	{
		clicks.length = 0;
		moved = false;
	}

	this.SetCursor = function(pointer)
	{
		if (Engine.Canvas)
			Engine.Canvas.style.cursor = pointer ? "pointer" : "default";
	}
}

if (typeof Engine !== 'undefined') var Mouse = new MousePrototype();

if (typeof module !== 'undefined') module.exports = { ClientToVirtual: ClientToVirtual };
