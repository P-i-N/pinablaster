// Input: keyboard + gamepad merged into per-player action state.
// Nothing outside this file reads keyCode or the Gamepad API.

var INPUT_DEAD_ZONE = 0.5;

var KEY_LAYOUTS =
[
	{ Up: "ArrowUp", Right: "ArrowRight", Down: "ArrowDown", Left: "ArrowLeft", Bomb: "Space", Start: "Enter", Back: "Escape" },
	{ Up: "KeyW", Right: "KeyD", Down: "KeyS", Left: "KeyA", Bomb: "ShiftLeft", Start: null, Back: null }
];

// The on-screen controls act as a third keyboard with virtual key names.
var TOUCH_LAYOUT = { Up: "Up", Right: "Right", Down: "Down", Left: "Left", Bomb: "Bomb", Start: "Start", Back: "Back" };

// Stick/analog to one of the 4 grid directions (0 = none).
function SnapAxes(x, y, dead)
{
	if (Math.abs(x) < dead && Math.abs(y) < dead)
		return 0;

	if (Math.abs(x) > Math.abs(y))
		return x > 0 ? 2 : 4;

	return y > 0 ? 3 : 1;
}

// Standard-mapping gamepad: 12/13/14/15 = dpad up/down/left/right, 0 = A, 2 = X, 9 = Start, 1 = B, 8 = Back/Select.
function PadToAction(pad, dead)
{
	var b = pad.buttons;

	function down(i) { return !!(b[i] && b[i].pressed); }

	var dir = 0;

	if (down(12)) dir = 1;
	else if (down(15)) dir = 2;
	else if (down(13)) dir = 3;
	else if (down(14)) dir = 4;
	else dir = SnapAxes(pad.axes[0] || 0, pad.axes[1] || 0, dead);

	return { Dir: dir, Bomb: down(0) || down(2), Start: down(9), Back: down(1) || down(8) };
}

function KeysToAction(keys, layout)
{
	var dir = 0;

	if (keys[layout.Up]) dir = 1;
	if (keys[layout.Right]) dir = 2;
	if (keys[layout.Down]) dir = 3;
	if (keys[layout.Left]) dir = 4;

	return { Dir: dir, Bomb: !!keys[layout.Bomb], Start: layout.Start ? !!keys[layout.Start] : false, Back: layout.Back ? !!keys[layout.Back] : false };
}

function InputPrototype()
{
	var self = this;

	this.KeysDown = {};
	this.Latch = {};
	this.Bindings = [];
	this.Raw = {};
	this.OnPadChange = null;

	var prev = {};

	function finish(id, action, latch, layout)
	{
		var p = prev[id] || { Dir: 0, Bomb: false, Start: false, Back: false };

		action.BombPressed = (action.Bomb && !p.Bomb) || !!(latch && layout && latch[layout.Bomb]);
		action.StartPressed = (action.Start && !p.Start) || !!(latch && layout && layout.Start && latch[layout.Start]);
		action.BackPressed = (action.Back && !p.Back) || !!(latch && layout && layout.Back && latch[layout.Back]);
		action.DirPressed = action.Dir != 0 && action.Dir != p.Dir;

		return action;
	}

	function keyAction(id, keys, latch, layout)
	{
		var action = KeysToAction(keys, layout);

		// A tap shorter than one poll still counts as a direction press for this poll.
		if (action.Dir == 0 && latch)
			action.Dir = KeysToAction(latch, layout).Dir;

		return finish(id, action, latch, layout);
	}

	// touch: null (no on-screen controls) or { Keys: {name: true}, Latch: {name: true} }
	// virtuals: { id: { Keys, Latch } } for other virtual devices (remote players: "net<slot>")
	this.Poll = function(keys, pads, latch, touch, virtuals)
	{
		var raw = {};

		for (var i = 0; i < KEY_LAYOUTS.length; ++i)
			raw["kb" + i] = keyAction("kb" + i, keys, latch, KEY_LAYOUTS[i]);

		for (var j = 0; j < pads.length; ++j)
		{
			var p = pads[j];

			if (p && p.connected !== false)
				raw["pad" + p.index] = finish("pad" + p.index, PadToAction(p, INPUT_DEAD_ZONE), null, null);
		}

		if (touch)
			raw.touch = keyAction("touch", touch.Keys, touch.Latch, TOUCH_LAYOUT);

		for (var id in (virtuals || {}))
			raw[id] = keyAction(id, virtuals[id].Keys, virtuals[id].Latch, TOUCH_LAYOUT);

		this.Raw = raw;
		prev = raw;
	}

	this.Bind = function(playerIndex, binding)
	{
		this.Bindings[playerIndex] = binding;
	}

	this.Unbind = function(playerIndex)
	{
		this.Bindings[playerIndex] = null;
	}

	this.Player = function(i)
	{
		var out = { Dir: 0, Bomb: false, BombPressed: false, Start: false, StartPressed: false, Back: false, BackPressed: false, DirPressed: false, Connected: false };
		var bind = this.Bindings[i];

		if (!bind)
			return out;

		var srcs = [];

		if (bind.Keyboard != null && this.Raw["kb" + bind.Keyboard])
			srcs.push(this.Raw["kb" + bind.Keyboard]);

		if (bind.Pad === "any")
		{
			for (var id in this.Raw)
				if (id.indexOf("pad") == 0)
					srcs.push(this.Raw[id]);
		}
		else if (bind.Pad != null && this.Raw["pad" + bind.Pad])
			srcs.push(this.Raw["pad" + bind.Pad]);

		if (bind.Touch && this.Raw.touch)
			srcs.push(this.Raw.touch);

		if (bind.Net != null && this.Raw["net" + bind.Net])
			srcs.push(this.Raw["net" + bind.Net]);

		for (var s = 0; s < srcs.length; ++s)
		{
			var a = srcs[s];

			if (out.Dir == 0) out.Dir = a.Dir;
			out.Bomb = out.Bomb || a.Bomb;
			out.BombPressed = out.BombPressed || a.BombPressed;
			out.Start = out.Start || a.Start;
			out.StartPressed = out.StartPressed || a.StartPressed;
			out.Back = out.Back || a.Back;
			out.BackPressed = out.BackPressed || a.BackPressed;
			out.DirPressed = out.DirPressed || a.DirPressed;
		}

		out.Connected = (bind.Keyboard != null) || srcs.length > 0;

		return out;
	}

	this.Sources = function()
	{
		var list = [];

		for (var id in this.Raw)
		{
			if (id.indexOf("net") == 0)
				continue;

			if (id.indexOf("kb") == 0)
				list.push({ Id: id, Keyboard: parseInt(id.substr(2)), Action: this.Raw[id] });
			else if (id == "touch")
				list.push({ Id: id, Touch: true, Action: this.Raw[id] });
			else
				list.push({ Id: id, Pad: parseInt(id.substr(3)), Action: this.Raw[id] });
		}

		return list;
	}

	// Menu navigation: edges from every device at once (any keyboard, any pad).
	this.Menu = function()
	{
		var m = { Up: false, Down: false, Left: false, Right: false, Confirm: false, Back: false, Any: false };

		for (var id in this.Raw)
		{
			// Remote players never navigate this machine's menus.
			if (id.indexOf("net") == 0)
				continue;

			var a = this.Raw[id];

			if (a.DirPressed)
			{
				if (a.Dir == 1) m.Up = true;
				if (a.Dir == 2) m.Right = true;
				if (a.Dir == 3) m.Down = true;
				if (a.Dir == 4) m.Left = true;
			}

			if (a.BombPressed || a.StartPressed) m.Confirm = true;
			if (a.BackPressed) m.Back = true;
		}

		m.Any = m.Up || m.Down || m.Left || m.Right || m.Confirm || m.Back;

		return m;
	}

	function getPads()
	{
		return (navigator.getGamepads ? navigator.getGamepads() : []) || [];
	}

	function isGameKey(code)
	{
		for (var i = 0; i < KEY_LAYOUTS.length; ++i)
			for (var k in KEY_LAYOUTS[i])
				if (KEY_LAYOUTS[i][k] == code)
					return true;

		return false;
	}

	// Set by TouchControls: an object with Snapshot() -> { Keys, Latch } or null.
	this.TouchSource = null;

	// id -> object with Snapshot() -> { Keys, Latch } | null (e.g. remote players in a LAN game)
	this.Virtuals = {};

	this.Update = function()
	{
		var virtuals = {};

		for (var id in this.Virtuals)
		{
			var snap = this.Virtuals[id].Snapshot();

			if (snap)
				virtuals[id] = snap;
		}

		this.Poll(this.KeysDown, getPads(), this.Latch, this.TouchSource ? this.TouchSource.Snapshot() : null, virtuals);
		this.Latch = {};
	}

	this.Init = function()
	{
		document.addEventListener("keydown", function(e)
		{
			self.KeysDown[e.code] = true;

			if (!e.repeat)
				self.Latch[e.code] = true;

			if (isGameKey(e.code))
				e.preventDefault();
		});

		document.addEventListener("keyup", function(e)
		{
			self.KeysDown[e.code] = false;
		});

		window.addEventListener("blur", function()
		{
			self.KeysDown = {};
		});

		window.addEventListener("gamepadconnected", function(e)
		{
			if (self.OnPadChange) self.OnPadChange(e.gamepad.index, true, e.gamepad.id);
		});

		window.addEventListener("gamepaddisconnected", function(e)
		{
			if (self.OnPadChange) self.OnPadChange(e.gamepad.index, false, e.gamepad.id);
		});
	}
}

var Input = new InputPrototype();

if (typeof module !== 'undefined')
	module.exports = { InputPrototype: InputPrototype, SnapAxes: SnapAxes, PadToAction: PadToAction, KeysToAction: KeysToAction, KEY_LAYOUTS: KEY_LAYOUTS, INPUT_DEAD_ZONE: INPUT_DEAD_ZONE };
