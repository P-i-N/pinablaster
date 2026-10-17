// Remote player input (host side) and the sender that feeds it (guest side). Pure: no DOM.

// A virtual input device for one remote slot. Looks like touch controls to Input:
// Snapshot() -> { Keys, Latch }. Held keys expire if the guest goes silent, so a
// dropped connection never leaves a player running into a wall forever.
function RemoteInput(timeoutMs, clock)
{
	var keys = {};
	var latch = {};
	var last = null;

	this.Receive = function(held, pressed)
	{
		keys = {};

		for (var i = 0; i < held.length; ++i)
			keys[held[i]] = true;

		for (var j = 0; j < pressed.length; ++j)
			latch[pressed[j]] = true;

		last = clock();
	}

	this.Snapshot = function()
	{
		if (last !== null && clock() - last > timeoutMs)
			keys = {};

		var snap = { Keys: {}, Latch: latch };

		for (var k in keys)
			snap.Keys[k] = true;

		latch = {};

		return snap;
	}
}

// Decides when a guest has to send its input for a slot: on change, on any fresh press,
// and as a heartbeat so the host knows the keys are still held.
function InputSender(heartbeatMs)
{
	var state = {};

	function sig(list)
	{
		return list.slice().sort().join(",");
	}

	this.Next = function(slot, held, pressed, nowMs)
	{
		var s = state[slot];
		var key = sig(held);

		if (s && s.key === key && pressed.length == 0 && nowMs - s.at < heartbeatMs)
			return null;

		state[slot] = { key: key, at: nowMs };

		return { t: "input", slot: slot, k: held, l: pressed };
	}
}

// A player's Input.Player() state -> the key names a guest sends (movement and bomb only;
// pause / menu buttons stay on the guest's own machine).
function ActionToKeys(act)
{
	var names = [null, "Up", "Right", "Down", "Left"];
	var held = [];
	var pressed = [];

	if (act.Dir)
		held.push(names[act.Dir]);

	if (act.Bomb)
		held.push("Bomb");

	if (act.DirPressed && act.Dir)
		pressed.push(names[act.Dir]);

	if (act.BombPressed)
		pressed.push("Bomb");

	return { held: held, pressed: pressed };
}

if (typeof module !== 'undefined')
	module.exports = { RemoteInput: RemoteInput, InputSender: InputSender, ActionToKeys: ActionToKeys };
