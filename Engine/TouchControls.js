// On-screen controls (virtual gamepad) for phones and tablets.
// They behave like a third keyboard with virtual keys (see TOUCH_LAYOUT in Input.js).

var TOUCH_MODES = ["auto", "on", "off"];

// Touch-primary device: coarse primary pointer and touch points, or a real touch was seen.
function DetectTouch(env)
{
	if (env.sawTouch)
		return true;

	return !!(env.coarse && env.maxTouchPoints > 0);
}

function ResolveTouchMode(mode, detected)
{
	if (mode == "on") return true;
	if (mode == "off") return false;

	return !!detected;
}

function NextTouchMode(mode, dir)
{
	var i = TOUCH_MODES.indexOf(mode);

	if (i < 0) i = 0;

	return TOUCH_MODES[(i + dir + TOUCH_MODES.length) % TOUCH_MODES.length];
}

// Finger offset from the pad centre -> 1 up, 2 right, 3 down, 4 left (0 = dead centre).
function DpadDirection(dx, dy, radius)
{
	var dead = radius * 0.25;

	if (Math.abs(dx) < dead && Math.abs(dy) < dead)
		return 0;

	if (Math.abs(dx) > Math.abs(dy))
		return dx > 0 ? 2 : 4;

	return dy > 0 ? 3 : 1;
}

function TouchControlsPrototype()
{
	var DIR_KEYS = [null, "Up", "Right", "Down", "Left"];

	var self = this;
	var mode = "auto";
	var active = false;
	var sawTouch = false;
	var built = false;
	var keys = {};
	var latch = {};
	var root = null;
	var dpad = null;

	this.Active = function() { return active; }

	this.Mode = function() { return mode; }

	function setKey(name, down)
	{
		if (down && !keys[name])
			latch[name] = true;

		keys[name] = down;
	}

	function holdButton(el, name)
	{
		el.addEventListener("pointerdown", function(e)
		{
			e.preventDefault();
			el.setPointerCapture(e.pointerId);
			setKey(name, true);
			latch[name] = true;
			el.classList.add("down");
		});

		function release()
		{
			setKey(name, false);
			el.classList.remove("down");
		}

		el.addEventListener("pointerup", release);
		el.addEventListener("pointercancel", release);
		el.addEventListener("lostpointercapture", release);
	}

	function makeButton(id, label, extraClass)
	{
		var el = document.createElement("div");
		el.id = id;
		el.className = "tc " + (extraClass || "");
		el.textContent = label;
		root.appendChild(el);
		return el;
	}

	function setDirection(dir)
	{
		for (var d = 1; d <= 4; ++d)
		{
			setKey(DIR_KEYS[d], d == dir);
			dpad.classList.toggle("d" + d, d == dir);
		}
	}

	function buildDpad()
	{
		dpad = makeButton("tcDpad", "", "");

		["▲", "▶", "▼", "◀"].forEach(function(glyph, i)
		{
			var a = document.createElement("span");
			a.className = "arrow a" + (i + 1);
			a.textContent = glyph;
			dpad.appendChild(a);
		});

		var pointerId = null;

		function update(e)
		{
			var r = dpad.getBoundingClientRect();
			setDirection(DpadDirection(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), r.width / 2));
		}

		dpad.addEventListener("pointerdown", function(e)
		{
			e.preventDefault();

			if (pointerId !== null)
				return;

			pointerId = e.pointerId;
			dpad.setPointerCapture(pointerId);
			update(e);
		});

		dpad.addEventListener("pointermove", function(e)
		{
			if (e.pointerId === pointerId)
				update(e);
		});

		function release(e)
		{
			if (e.pointerId !== pointerId)
				return;

			pointerId = null;
			setDirection(0);
		}

		dpad.addEventListener("pointerup", release);
		dpad.addEventListener("pointercancel", release);
	}

	function build()
	{
		if (built)
			return;

		built = true;

		root = document.createElement("div");
		root.id = "touch";
		document.body.appendChild(root);

		buildDpad();

		holdButton(makeButton("tcBomb", "BOMB", "round"), "Bomb");
		holdButton(makeButton("tcStart", "II", "small"), "Start");
		holdButton(makeButton("tcBack", "BACK", "small"), "Back");

		Input.TouchSource = self;

		// A real touch on a device that did not look touch-first (iPad desktop mode, hybrids).
		document.addEventListener("pointerdown", function(e)
		{
			if (e.pointerType == "touch" && !sawTouch)
			{
				sawTouch = true;
				self.Refresh();
			}
		});
	}

	function setActive(on)
	{
		if (on == active && built)
			return;

		build();
		active = on;
		keys = {};
		latch = {};
		root.classList.toggle("on", on);
		document.body.classList.toggle("touch", on);
	}

	this.Refresh = function()
	{
		var env =
		{
			maxTouchPoints: navigator.maxTouchPoints || 0,
			coarse: !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches),
			sawTouch: sawTouch
		};

		setActive(ResolveTouchMode(mode, DetectTouch(env)));
	}

	this.SetMode = function(m)
	{
		mode = m;
		this.Refresh();
	}

	// Called by Input once per frame. Returns null while the controls are hidden.
	this.Snapshot = function()
	{
		if (!active)
			return null;

		var snap = { Keys: {}, Latch: latch };

		for (var k in keys)
			snap.Keys[k] = keys[k];

		latch = {};

		return snap;
	}
}

if (typeof document !== 'undefined') var TouchControls = new TouchControlsPrototype();

if (typeof module !== 'undefined')
	module.exports = { DetectTouch: DetectTouch, ResolveTouchMode: ResolveTouchMode, NextTouchMode: NextTouchMode, DpadDirection: DpadDirection };
