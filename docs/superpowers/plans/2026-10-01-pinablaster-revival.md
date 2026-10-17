# PiN'a'Blaster Revival Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revive the 2011 HTML5 Dynablaster-style game with 16:9 scaling and fullscreen, Web Audio mixing, gamepad support, and local 1-4 player co-op and battle modes.

**Architecture:** Modernize in place. Keep the existing engine and entity classes (`function X(){}` + `X.prototype = new GameEntity`, global singletons). Add focused new modules (`Input`, `AudioMixer`, `Display`, `Hud`, `Screens`, `Players`, `Battle`) that are DOM-light where possible, so pure logic can be tested with `node --test`. The loop becomes `requestAnimationFrame` plus a fixed 10ms simulation step.

**Tech Stack:** Plain ES5/ES2015 browser JS, no build step, no jQuery. Canvas 2D, Web Audio API, Gamepad API, Fullscreen API. Tests: `node --test` (Node 22). Manual/visual verification: `python -m http.server 8000` plus the in-app browser.

## Global Constraints

- No build step, no bundler, no npm dependencies. Static files only. `index.html` loads classic `<script>` tags in order.
- No git: the user said to work in place (no commits, no branches). Plan steps have no commit steps. Do not run `git init`.
- Virtual canvas is exactly 576x324 (16:9). Map is 27x19 tiles at 17px = 459x323 and sits at the full height.
- Simulation step is 10ms (`TickSpeed = 0.01` s); entity speeds are pixels per step, so movement speed must not change.
- Players: 1-4. Keyboard: P1 arrows + Space; P2 WASD + Left Shift. P3/P4 gamepad only.
- Gamepad: D-pad and left stick, dead zone, snapped to 4 directions. A = bomb, Start = pause/join.
- Debug hotkeys (editor `E`, debug draw `D`, level skip `1-9`, `R`, `+`/`-`) only work with `?debug` in the URL.
- Audio: Web Audio; one `AudioBufferSourceNode` per play; buses master -> sfx/music; voice cap per sound with oldest-voice stealing; +/- 4% pitch variation on repeated sounds.
- Battle: one symmetric 27x19 arena, 4 corner spawns, first to 3 round wins, sudden death after 120 s.
- Settings (volumes, integer scaling) persist in `localStorage`, always wrapped in try/catch.
- Fix the typo "Counot" in the init error message.
- New files are classic scripts; every pure-logic file ends with `if (typeof module !== 'undefined') module.exports = {...};` so `node --test` can `require` it.

## File Structure

New files:

| File | Responsibility |
|---|---|
| `Engine/Loop.js` | `FixedStepLoop`: pure accumulator (`Advance(dtSec) -> steps`) plus rAF wiring |
| `Engine/Input.js` | Keyboard + gamepad merged into per-player action state; pure helpers `SnapAxes`, `StickToDirection` |
| `Engine/AudioMixer.js` | Web Audio: decode, buses, voice pool (`VoicePool` is pure and testable) |
| `Engine/Display.js` | Virtual 576x324 canvas scaling, letterbox math (`ComputeLayout` is pure), fullscreen |
| `Engine/Tint.js` | Per-player sprite tinting via offscreen canvas cache |
| `Game/Players.js` | `PlayerManager`: roster, spawn points, nearest-player lookup, alive/lives rules |
| `Game/Hud.js` | Side-panel HUD cards (1 per player) |
| `Game/Screens.js` | Title, lobby, pause, result screens; menu navigation |
| `Game/Battle.js` | Battle arena map, round/match state machine (`BattleRules` is pure) |
| `tests/*.test.js` | `node --test` suites |

Modified files: `index.html`, `style.css`, `Main.js`, `Engine/Engine.js`, `Engine/Renderer.js`, `Engine/GameWorld.js`, `Game/PiNaBlaster.js`, `Game/Player.js`, `Game/Enemy.js`, `Game/Explosion.js`, `Game/Bomb.js`, `Library/Utils.js`.

Removed: jQuery (`Library/jQuery.js` no longer loaded; file may stay on disk), all `<audio>` tags.

Run tests: `node --test tests/` from the project root. Serve: `python -m http.server 8000` then open `http://localhost:8000/`.

---

### Task 1: Fixed-step loop, jQuery removal, split update/draw, debug gating

**Files:**
- Create: `Engine/Loop.js`, `tests/loop.test.js`
- Modify: `Engine/Engine.js` (full replacement), `Engine/Renderer.js` (Tick -> Draw), `Main.js` (full replacement), `index.html` (script tags), `Game/PiNaBlaster.js` (split Tick/Draw, gate debug keys, remove `console.log`), `Game/Explosion.js:32` (remove `console.log`)

**Interfaces:**
- Produces: `FixedStepLoop(stepSec, maxStepsPerFrame)` with `.Advance(dtSec) -> int` (steps to run now) and `.Reset()`.
- Produces: `Engine.Debug` (bool, true when URL has `?debug`), `Engine.Paused` (bool; when true simulation steps are skipped but `Application.Draw` still runs), `Engine.Frame(nowMs)`.
- Produces: `Renderer.Draw()` (the old `Renderer.Tick` body); `Renderer.Tick` becomes a no-op so the module registry still works.
- Produces: application hooks `Application.Tick(delta)` (simulation only), `Application.Draw()` (drawing only).

- [ ] **Step 1: Write the failing test**

Create `tests/loop.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { FixedStepLoop } = require('../Engine/Loop.js');

test('runs whole steps and keeps the remainder', () => {
  const l = new FixedStepLoop(0.01, 10);
  assert.strictEqual(l.Advance(0.025), 2);
  assert.strictEqual(l.Advance(0.005), 1);
  assert.strictEqual(l.Advance(0.004), 0);
});

test('does not lose steps to float error', () => {
  const l = new FixedStepLoop(0.01, 100);
  let total = 0;
  for (let i = 0; i < 100; i++) total += l.Advance(0.016);
  assert.strictEqual(total, 160);
});

test('clamps the catch-up burst and drops the backlog', () => {
  const l = new FixedStepLoop(0.01, 5);
  assert.strictEqual(l.Advance(10), 5);
  assert.strictEqual(l.Advance(0), 0);
});

test('negative dt is treated as zero; Reset clears the remainder', () => {
  const l = new FixedStepLoop(0.01, 5);
  assert.strictEqual(l.Advance(-1), 0);
  l.Advance(0.009);
  l.Reset();
  assert.strictEqual(l.Advance(0.002), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/loop.test.js`
Expected: FAIL with `Cannot find module '../Engine/Loop.js'`.

- [ ] **Step 3: Implement `Engine/Loop.js`**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/loop.test.js`
Expected: 4 passing.

- [ ] **Step 5: Replace `Engine/Engine.js`**

```js
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

	// One animation frame: run due simulation steps, then draw once.
	this.Frame = function(nowMs)
	{
		window.requestAnimationFrame(function(t) { instance.Frame(t); });

		var dt = (nowMs - lastNow) * 0.001;
		lastNow = nowMs;

		// Tab was hidden or the machine hiccuped: don't fast-forward the game.
		if (dt > 0.25) dt = 0.25;

		var steps = loop.Advance(dt);

		if (!this.Paused)
		{
			for (var i = 0; i < steps; ++i)
				this.InternalTick();
		}

		if (this.Application != null && this.Application.Draw)
			this.Application.Draw();
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

		loop = new FixedStepLoop(this.TickSpeed, 10);
		lastNow = performance.now();
		window.requestAnimationFrame(function(t) { instance.Frame(t); });

		return true;
	}

	// Replaced by AudioMixer in the audio task; kept so entity code is unchanged.
	this.PlaySound = function(id)
	{
		var tag = document.getElementById(id);

		if (tag != null)
		{
			tag.currentTime = 0;
			tag.play();
		}
	}

	this.StopSound = function(id)
	{
		var tag = document.getElementById(id);

		if (tag != null)
			tag.pause();
	}
}

var Engine = new EnginePrototype();
```

`Module.Init()` returning `undefined` is `!= false`, so modules without a return value pass (same as before).

- [ ] **Step 6: Edit `Engine/Renderer.js`**

Replace `this.Tick = function(delta)` (current lines 43-58) with a no-op tick plus `Draw`:

```js
	// Registered as a module, but drawing now happens once per frame in Draw().
	this.Tick = function(delta)
	{
	}

	this.Draw = function()
	{
		context.fillStyle = "#000000";
		context.fillRect(0, 0, width, height);

		context.drawImage(GameWorld.CacheImage, 0, 0);

		this.DrawSpriteLayer(-2);
		this.DrawSpriteLayer(-1);
		this.DrawSpriteLayer(0);
		this.DrawSpriteLayer(1);
		this.DrawSpriteLayer(2);

		if (this.EnableDebugDraw)
			this.DebugDraw();
	}
```

- [ ] **Step 7: Replace `Main.js`**

```js
document.addEventListener("DOMContentLoaded", function()
{
	var canvas = document.getElementById("mainCanvas");

	if (Engine.Run(canvas, new PiNaBlaster(), 10) == false)
	{
		// Something bad happened!
		alert("Could not initialize engine! :-(");
		return;
	}
});
```

(The proper error screen replaces `alert` in Task 9.)

- [ ] **Step 8: Edit `index.html`**

Delete the line `<script src="Library/jQuery.js"></script>`. Add `<script src="Engine/Loop.js"></script>` as the first line under `<!-- Engine core -->`.

- [ ] **Step 9: Split `Game/PiNaBlaster.js` into Tick and Draw, gate debug keys**

1. Add this method (put it before `this.Tick`):

```js
	this.Draw = function()
	{
		Renderer.Draw();

		if (this.LevelNumber == 7)
		{
			if (this.Blinker > 1.0)
				this.DrawSmallText("You won! Thanks for playing!", 160, 335);

			return;
		}

		if (this.EditMode)
			return;

		this.DrawHud();
	}
```

2. Move the HUD drawing statements out of `GameTick` (from `var ss = Renderer.SpriteSheet;` through the key-icon `for` loop, current lines 271-356) unchanged into a new `this.DrawHud = function() { ... }`.
3. `GameTick` keeps only the input, respawn and level-advance logic (current lines 358-397).
4. `EditModeTick` and `PF2012Tick` become empty bodies (delete their `Renderer.Tick(delta)` calls and the text draw in `PF2012Tick`).
5. In `KeyDown`, delete `console.log(key);` and replace the if/else-if chain at current lines 463-492 with:

```js
		if (Engine.Debug)
		{
			if (key == 69) this.SwitchEditMode();
			else if (key == 82) { this.Player.IsDead = false; this.Player.Sprite.Frames = [0]; }
			else if (key == 68) Renderer.EnableDebugDraw = !Renderer.EnableDebugDraw;
			else if (key == 107) { ++this.Player.Bombs; ++this.Player.Power; }
			else if (key == 109)
			{
				this.Player.Bombs = Math.max(1, this.Player.Bombs - 1);
				this.Player.Power = Math.max(1, this.Player.Power - 1);
			}
			else if (key >= 49 && key < 60) this.SetLevel(key - 49);
		}
```

6. In `Game/Explosion.js` delete `console.log(overlapFactor);` (line 32).

- [ ] **Step 10: Verify in the browser**

Run (background): `python -m http.server 8000`, open `http://localhost:8000/` in the in-app browser.
Expected: level 6 renders, arrow keys move the player, Space drops a bomb that explodes after 2 s, the console has no errors and no per-keypress logs. `E` does nothing; on `http://localhost:8000/?debug`, `E` freezes entities (edit mode). Running `grep -rn "jQuery" Engine Game Main.js index.html` finds nothing.

---

### Task 2: Input module (keyboard + gamepad) and single-player wiring

**Files:**
- Create: `Engine/Input.js`, `tests/input.test.js`
- Modify: `Engine/Engine.js` (init + per-frame update), `Game/Player.js` (add `ApplyInputDirection`), `Game/PiNaBlaster.js` (read `Input.Player(0)` instead of `Engine.Keys`), `index.html` (script tag)

**Interfaces:**
- Consumes: `Engine.Frame` from Task 1.
- Produces: global `Input` (an `InputPrototype` instance) with:
  - `Input.Init()` - registers DOM listeners (keyboard, blur, gamepad connect/disconnect).
  - `Input.Update()` - once per animation frame; polls devices, computes edges.
  - `Input.Poll(keys, pads, latch)` - pure core of `Update` (used by tests). `keys` is `{code: true}`, `pads` is an array of Gamepad-like objects (nulls allowed), `latch` is `{code: true}` for key-down events since the last poll.
  - `Input.Bind(playerIndex, binding)` where `binding = {Keyboard: 0|1|null, Pad: <index>|'any'|null}`; `Input.Unbind(playerIndex)`.
  - `Input.Player(i)` -> `{Dir, Bomb, BombPressed, Start, StartPressed, Back, BackPressed, DirPressed, Connected}`. `Dir` is 0 none, 1 up, 2 right, 3 down, 4 left (same codes as `GameEntity.Direction`).
  - `Input.Menu()` -> `{Up, Down, Left, Right, Confirm, Back, Any}` edge flags merged over every device (Confirm = fire or start; Back = Escape / pad B / pad Select); used by all menus.
  - `Input.Sources()` -> array of `{Id, Keyboard|Pad, Action}` for every live raw source (`kb0`, `kb1`, `pad<i>`); used by the lobby.
  - `Input.OnPadChange` - optional `function(index, connected, id)` callback.
  - pure helpers `SnapAxes(x, y, dead)`, `PadToAction(pad, dead)`, `KeysToAction(keys, layout)`, constant `KEY_LAYOUTS`, `INPUT_DEAD_ZONE`.
- Produces: `Player.ApplyInputDirection(dir)`.
- Produces: optional application hook `Application.FrameUpdate()`, called once per animation frame (even when `Engine.Paused`) after `Input.Update()` and before simulation steps.

- [ ] **Step 1: Write the failing tests**

Create `tests/input.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const I = require('../Engine/Input.js');

function pad(index, opts) {
  opts = opts || {};
  const buttons = [];
  for (let i = 0; i < 17; i++) buttons.push({ pressed: false });
  (opts.down || []).forEach(i => buttons[i].pressed = true);
  return { index: index, connected: true, buttons: buttons, axes: opts.axes || [0, 0, 0, 0] };
}

test('SnapAxes: dead zone and dominant axis', () => {
  assert.strictEqual(I.SnapAxes(0.2, -0.3, 0.5), 0);
  assert.strictEqual(I.SnapAxes(0.9, 0.2, 0.5), 2);
  assert.strictEqual(I.SnapAxes(-0.9, 0.2, 0.5), 4);
  assert.strictEqual(I.SnapAxes(0.1, -0.9, 0.5), 1);
  assert.strictEqual(I.SnapAxes(0.1, 0.9, 0.5), 3);
  assert.strictEqual(I.SnapAxes(0.7, 0.7, 0.5), 3); // tie goes vertical
});

test('PadToAction: dpad beats stick, A or X = bomb, button 9 = start', () => {
  assert.deepStrictEqual(I.PadToAction(pad(0, { down: [12] }), 0.5), { Dir: 1, Bomb: false, Start: false, Back: false });
  assert.deepStrictEqual(I.PadToAction(pad(0, { down: [15, 0] , axes: [-1, 0]}), 0.5), { Dir: 2, Bomb: true, Start: false, Back: false });
  assert.strictEqual(I.PadToAction(pad(0, { axes: [0, 1] }), 0.5).Dir, 3);
  assert.strictEqual(I.PadToAction(pad(0, { down: [2] }), 0.5).Bomb, true);
  assert.strictEqual(I.PadToAction(pad(0, { down: [9] }), 0.5).Start, true);
});

test('Back: Escape on keyboard 0, B or Select on a pad', () => {
  assert.strictEqual(I.KeysToAction({ Escape: true }, I.KEY_LAYOUTS[0]).Back, true);
  assert.strictEqual(I.KeysToAction({ Escape: true }, I.KEY_LAYOUTS[1]).Back, false);
  assert.strictEqual(I.PadToAction(pad(0, { down: [1] }), 0.5).Back, true);
  assert.strictEqual(I.PadToAction(pad(0, { down: [8] }), 0.5).Back, true);
});

test('KeysToAction uses the layout table', () => {
  const L0 = I.KEY_LAYOUTS[0], L1 = I.KEY_LAYOUTS[1];
  assert.strictEqual(I.KeysToAction({ ArrowUp: true }, L0).Dir, 1);
  assert.strictEqual(I.KeysToAction({ KeyD: true, ShiftLeft: true }, L1).Dir, 2);
  assert.strictEqual(I.KeysToAction({ KeyD: true, ShiftLeft: true }, L1).Bomb, true);
  assert.strictEqual(I.KeysToAction({ ArrowUp: true }, L1).Dir, 0);
});

test('Player(): keyboard and pad merge, keyboard wins direction', () => {
  const inp = new I.InputPrototype();
  inp.Bind(0, { Keyboard: 0, Pad: 0 });
  inp.Poll({}, [pad(0, { down: [14] })], {});
  assert.strictEqual(inp.Player(0).Dir, 4);
  inp.Poll({ ArrowUp: true }, [pad(0, { down: [14] })], {});
  assert.strictEqual(inp.Player(0).Dir, 1);
});

test('Player(): Pad "any" listens to every pad; unbound player is idle', () => {
  const inp = new I.InputPrototype();
  inp.Bind(0, { Keyboard: null, Pad: 'any' });
  inp.Poll({}, [null, pad(1, { down: [13] })], {});
  assert.strictEqual(inp.Player(0).Dir, 3);
  assert.strictEqual(inp.Player(1).Dir, 0);
  assert.strictEqual(inp.Player(1).Connected, false);
});

test('edges: BombPressed fires once per press; latch catches taps between polls', () => {
  const inp = new I.InputPrototype();
  inp.Bind(0, { Keyboard: 0, Pad: null });
  inp.Poll({ Space: true }, [], {});
  assert.strictEqual(inp.Player(0).BombPressed, true);
  inp.Poll({ Space: true }, [], {});
  assert.strictEqual(inp.Player(0).BombPressed, false);
  assert.strictEqual(inp.Player(0).Bomb, true);
  inp.Poll({}, [], { Space: true }); // pressed and released between two polls
  assert.strictEqual(inp.Player(0).BombPressed, true);
  assert.strictEqual(inp.Player(0).Bomb, false);
});

test('DirPressed fires when direction changes to non-zero', () => {
  const inp = new I.InputPrototype();
  inp.Bind(0, { Keyboard: 0, Pad: null });
  inp.Poll({ ArrowLeft: true }, [], {});
  assert.strictEqual(inp.Player(0).DirPressed, true);
  inp.Poll({ ArrowLeft: true }, [], {});
  assert.strictEqual(inp.Player(0).DirPressed, false);
  inp.Poll({}, [], {});
  assert.strictEqual(inp.Player(0).DirPressed, false);
});

test('Menu(): merges edges from every device', () => {
  const inp = new I.InputPrototype();
  inp.Poll({ ArrowDown: true }, [pad(0, { down: [0] })], {});
  const m = inp.Menu();
  assert.strictEqual(m.Down, true);
  assert.strictEqual(m.Confirm, true);
  assert.strictEqual(m.Up, false);
  assert.strictEqual(m.Any, true);
  inp.Poll({ ArrowDown: true }, [pad(0, { down: [0] })], {});
  assert.strictEqual(inp.Menu().Any, false); // held keys do not repeat
  inp.Poll({}, [], { Escape: true });
  assert.strictEqual(inp.Menu().Back, true);
});

test('Sources(): lists keyboards and connected pads', () => {
  const inp = new I.InputPrototype();
  inp.Poll({}, [pad(2, {})], {});
  const ids = inp.Sources().map(s => s.Id).sort();
  assert.deepStrictEqual(ids, ['kb0', 'kb1', 'pad2']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/input.test.js`
Expected: FAIL with `Cannot find module '../Engine/Input.js'`.

- [ ] **Step 3: Implement `Engine/Input.js`**

```js
// Input: keyboard + gamepad merged into per-player action state.
// Nothing outside this file reads keyCode or the Gamepad API.

var INPUT_DEAD_ZONE = 0.5;

var KEY_LAYOUTS =
[
	{ Up: "ArrowUp", Right: "ArrowRight", Down: "ArrowDown", Left: "ArrowLeft", Bomb: "Space", Start: "Enter", Back: "Escape" },
	{ Up: "KeyW", Right: "KeyD", Down: "KeyS", Left: "KeyA", Bomb: "ShiftLeft", Start: null, Back: null }
];

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

	this.Poll = function(keys, pads, latch)
	{
		var raw = {};

		for (var i = 0; i < KEY_LAYOUTS.length; ++i)
			raw["kb" + i] = finish("kb" + i, KeysToAction(keys, KEY_LAYOUTS[i]), latch, KEY_LAYOUTS[i]);

		for (var j = 0; j < pads.length; ++j)
		{
			var p = pads[j];

			if (p && p.connected !== false)
				raw["pad" + p.index] = finish("pad" + p.index, PadToAction(p, INPUT_DEAD_ZONE), null, null);
		}

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
			if (id.indexOf("kb") == 0)
				list.push({ Id: id, Keyboard: parseInt(id.substr(2)), Action: this.Raw[id] });
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

	this.Update = function()
	{
		this.Poll(this.KeysDown, getPads(), this.Latch);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/input.test.js`
Expected: 10 passing.

- [ ] **Step 5: Wire into `Engine/Engine.js`**

In `Run`, just before `loop = new FixedStepLoop(...)`, add `Input.Init();`. In `Frame`, directly after the `if (dt > 0.25) dt = 0.25;` line, add:

```js
		Input.Update();

		if (this.Application != null && this.Application.FrameUpdate)
			this.Application.FrameUpdate();
```

In `index.html`, add `<script src="Engine/Input.js"></script>` right after the `Engine/Loop.js` line.

- [ ] **Step 6: Add `ApplyInputDirection` to `Game/Player.js`**

Insert before `this.Poop = function()`:

```js
	// Translate a held direction (0 = none) into movement requests.
	this.ApplyInputDirection = function(dir)
	{
		if (this.IsDead || dir == 0)
		{
			this.Direction = 0;
			this.NextDirection = 0;
			return;
		}

		if ((this.Direction == 0 && this.NextDirection == 0) || dir != this.Direction)
			this.EnableDirection(dir);
	}
```

- [ ] **Step 7: Use `Input` in `Game/PiNaBlaster.js`**

1. In `this.Init`, after `this.SetLevel(6);` is NOT right (SetLevel creates the player); add before `this.SetLevel(6);`: `Input.Bind(0, { Keyboard: 0, Pad: "any" });`.
2. In `GameTick`, replace from `var isAnyMovement = ...` through the end of the `if (Engine.Keys[32] && ...) { ... }` block (current lines 358-392 of the original file) with:

```js
		var act = Input.Player(0);

		this.Player.ApplyInputDirection(act.Dir);

		// (ignore the bomb button for a limited time after player spawns)
		if (act.Bomb && this.Player.Time > 0.5)
		{
			if (!this.Player.IsDead)
			{
				this.Player.Poop();
			}
			else
			{
				if (this.Player.Lifes > 0)
				{
					--this.Player.Lifes;

					this.RespawnPlayer();
				}
			}
		}
```

3. In `KeyDown`, delete the `if (this.Player.IsDead) return; switch (key) { case 38: ... }` tail (arrow-key `EnableDirection` calls); in `KeyUp`, delete the whole `switch` (movement is polled now). Leave both functions defined (the engine calls them).

- [ ] **Step 8: Verify in the browser**

Serve and open `http://localhost:8000/`.
Expected: arrow keys move exactly as before (including turning at corners while holding), Space drops bombs, arrow keys and Space do not scroll the page. Then simulate a pad using the browser JS console:

```js
navigator.getGamepads = () => [{index:0, connected:true, axes:[1,0], buttons:Array.from({length:17},()=>({pressed:false}))}];
```

Expected: the player walks right with no keyboard input. Restore with `delete navigator.getGamepads` (falls back to native) and confirm it stops. Run `node --test tests/` - all passing.

---

### Task 3: Web Audio mixer

**Files:**
- Create: `Engine/AudioMixer.js`, `tests/audiomixer.test.js`
- Modify: `Engine/Engine.js` (`Run`, `PlaySound`, `StopSound`), `index.html` (add script, delete all `<audio>` tags)

**Interfaces:**
- Consumes: the existing sound ids used by entity code, unchanged: `audioBombDrop`, `audioExplosion1-5`, `audioPickUp`, `audioPoop`, `audioHit`, `audioDie`, `audioShield`, `audioShot`, `audioShoopDaWhoop`, `audioDoor`, `audioKey`, `audioOutro`, `audioIcebreak1-4`.
- Produces: global `AudioMixer` with `Init()`, `Resume()`, `Play(id)`, `Stop(id)`, `SetVolume(bus, v)` (`bus` is `"master" | "sfx" | "music"`, `v` is 0..1), `GetVolume(bus)`, `ActiveVoices(id)`, `IsReady()`.
- Produces pure helpers `VoicePool(caps, defaultCap)` (`.Add(id, voice) -> stolenVoice|null`, `.Remove(id, voice)`, `.Count(id)`), `GroupOf(id)`, `JitterRate(r, amount)`.
- `Engine.PlaySound(id)` / `Engine.StopSound(id)` keep their signatures and forward to `AudioMixer`.

- [ ] **Step 1: Write the failing tests**

Create `tests/audiomixer.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { VoicePool, GroupOf, JitterRate } = require('../Engine/AudioMixer.js');

test('GroupOf strips the trailing variant number', () => {
  assert.strictEqual(GroupOf('audioExplosion3'), 'audioExplosion');
  assert.strictEqual(GroupOf('audioIcebreak1'), 'audioIcebreak');
  assert.strictEqual(GroupOf('audioDoor'), 'audioDoor');
});

test('VoicePool steals the oldest voice once the cap is reached', () => {
  const pool = new VoicePool({ audioExplosion: 2 }, 4);
  const a = {}, b = {}, c = {};
  assert.strictEqual(pool.Add('audioExplosion1', a), null);
  assert.strictEqual(pool.Add('audioExplosion2', b), null);
  assert.strictEqual(pool.Add('audioExplosion5', c), a); // variants share one group
  assert.strictEqual(pool.Count('audioExplosion1'), 2);
});

test('VoicePool uses the default cap and Remove frees a slot', () => {
  const pool = new VoicePool({}, 2);
  const a = {}, b = {}, c = {};
  pool.Add('audioKey', a);
  pool.Add('audioKey', b);
  pool.Remove('audioKey', a);
  assert.strictEqual(pool.Add('audioKey', c), null);
  assert.strictEqual(pool.Count('audioKey'), 2);
});

test('JitterRate stays within +/- amount', () => {
  assert.strictEqual(JitterRate(0.5, 0.04), 1);
  assert.ok(Math.abs(JitterRate(0, 0.04) - 0.96) < 1e-9);
  assert.ok(Math.abs(JitterRate(1, 0.04) - 1.04) < 1e-9);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/audiomixer.test.js`
Expected: FAIL with `Cannot find module '../Engine/AudioMixer.js'`.

- [ ] **Step 3: Implement `Engine/AudioMixer.js`**

```js
// Web Audio mixer: decoded buffers, one source node per play, buses, voice cap.

var SOUND_FILES =
{
	audioBombDrop: "bomb_drop",
	audioExplosion1: "explosion_1", audioExplosion2: "explosion_2", audioExplosion3: "explosion_3",
	audioExplosion4: "explosion_4", audioExplosion5: "explosion_5",
	audioPickUp: "pick_up", audioPoop: "poop", audioHit: "hit", audioDie: "die",
	audioShield: "shield", audioShot: "shot", audioShoopDaWhoop: "shoop_da_whoop",
	audioDoor: "door", audioKey: "key", audioOutro: "outro",
	audioIcebreak1: "icebreak_1", audioIcebreak2: "icebreak_2", audioIcebreak3: "icebreak_3", audioIcebreak4: "icebreak_4"
};

var MUSIC_IDS = { audioOutro: true };

var VOICE_CAPS = { audioExplosion: 6, audioIcebreak: 3, audioPoop: 3 };
var DEFAULT_VOICE_CAP = 4;
var PITCH_JITTER = 0.04;

function GroupOf(id)
{
	return id.replace(/\d+$/, "");
}

function JitterRate(r, amount)
{
	return 1 + (r * 2 - 1) * amount;
}

function VoicePool(caps, defaultCap)
{
	var voices = {};

	function list(id)
	{
		var g = GroupOf(id);
		if (!voices[g]) voices[g] = [];
		return voices[g];
	}

	function cap(id)
	{
		var c = caps[GroupOf(id)];
		return c ? c : defaultCap;
	}

	// Returns the oldest voice that must be stopped to make room, or null.
	this.Add = function(id, voice)
	{
		var l = list(id);
		var stolen = null;

		if (l.length >= cap(id))
			stolen = l.shift();

		l.push(voice);
		return stolen;
	}

	this.Remove = function(id, voice)
	{
		var l = list(id);
		var i = l.indexOf(voice);
		if (i >= 0) l.splice(i, 1);
	}

	this.Count = function(id)
	{
		return list(id).length;
	}
}

function AudioMixerPrototype()
{
	var ctx = null;
	var master = null, sfx = null, music = null;
	var buffers = {};
	var playing = {};
	var pool = new VoicePool(VOICE_CAPS, DEFAULT_VOICE_CAP);
	var volumes = { master: 0.8, sfx: 1.0, music: 0.6 };

	this.IsReady = function() { return ctx != null; }

	this.GetVolume = function(bus) { return volumes[bus]; }

	this.SetVolume = function(bus, v)
	{
		v = Math.max(0, Math.min(1, v));
		volumes[bus] = v;

		if (!ctx) return;

		var node = bus == "master" ? master : (bus == "sfx" ? sfx : music);
		node.gain.value = v;
	}

	this.ActiveVoices = function(id) { return pool.Count(id); }

	function load(id, base)
	{
		function get(ext)
		{
			return fetch("Media/" + base + "." + ext)
				.then(function(r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
				.then(function(data) { return ctx.decodeAudioData(data); });
		}

		return get("wav").catch(function() { return get("mp3"); })
			.then(function(buf) { buffers[id] = buf; })
			.catch(function() { /* this sound stays silent */ });
	}

	this.Resume = function()
	{
		if (ctx && ctx.state == "suspended")
			ctx.resume();
	}

	this.Init = function()
	{
		var AC = window.AudioContext || window.webkitAudioContext;

		if (!AC)
			return false;

		ctx = new AC();

		var limiter = ctx.createDynamicsCompressor();
		limiter.threshold.value = -14;
		limiter.knee.value = 12;
		limiter.ratio.value = 8;
		limiter.attack.value = 0.003;
		limiter.release.value = 0.2;
		limiter.connect(ctx.destination);

		master = ctx.createGain();
		sfx = ctx.createGain();
		music = ctx.createGain();
		sfx.connect(master);
		music.connect(master);
		master.connect(limiter);

		master.gain.value = volumes.master;
		sfx.gain.value = volumes.sfx;
		music.gain.value = volumes.music;

		for (var id in SOUND_FILES)
			load(id, SOUND_FILES[id]);

		var self = this;
		["keydown", "pointerdown", "touchstart"].forEach(function(name)
		{
			document.addEventListener(name, function() { self.Resume(); });
		});

		return true;
	}

	this.Play = function(id)
	{
		var buf = buffers[id];

		if (!ctx || !buf || ctx.state != "running")
			return;

		var isMusic = !!MUSIC_IDS[id];
		var src = ctx.createBufferSource();
		src.buffer = buf;
		src.loop = isMusic;

		if (!isMusic)
			src.playbackRate.value = JitterRate(Math.random(), PITCH_JITTER);

		src.connect(isMusic ? music : sfx);

		var stolen = pool.Add(id, src);
		if (stolen) { try { stolen.stop(); } catch (e) {} }

		if (!playing[id]) playing[id] = [];
		playing[id].push(src);

		src.onended = function()
		{
			pool.Remove(id, src);
			playing[id].remove(src);
		};

		src.start();
	}

	// Stop every active voice of exactly this id (used for the music loop).
	this.Stop = function(id)
	{
		var l = playing[id];

		if (!l) return;

		for (var i = 0; i < l.length; ++i)
		{
			try { l[i].stop(); } catch (e) {}
		}
	}
}

var AudioMixer = new AudioMixerPrototype();

if (typeof module !== 'undefined')
	module.exports = { VoicePool: VoicePool, GroupOf: GroupOf, JitterRate: JitterRate };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/audiomixer.test.js`
Expected: 4 passing.

- [ ] **Step 5: Wire into the engine and page**

In `Engine/Engine.js`:
- In `Run`, next to `Input.Init();` add `AudioMixer.Init();` (a `false` return just means no sound; do not abort).
- Replace `PlaySound` and `StopSound` bodies:

```js
	this.PlaySound = function(id)
	{
		AudioMixer.Play(id);
	}

	this.StopSound = function(id)
	{
		AudioMixer.Stop(id);
	}
```

In `index.html`: delete every `<audio>...</audio>` block (the `<!-- Media files -->` section) and add `<script src="Engine/AudioMixer.js"></script>` after the `Input.js` line.

- [ ] **Step 6: Verify in the browser**

Serve and open the game; press an arrow key once (this unlocks audio).
Expected: bomb drop and explosion sounds play. Then run in the console:

```js
for (let i = 0; i < 12; i++) AudioMixer.Play('audioExplosion' + (1 + i % 5));
AudioMixer.ActiveVoices('audioExplosion1')
```

Expected: returns `6` (the cap), with no errors, and overlapping explosions are audible together. Drop two bombs close together: the second explosion no longer cuts the first. On `?debug`, press `8` to reach the outro level: music loops; leaving the level (`1`) stops it. `grep -c "<audio" index.html` returns `0`.

---

### Task 4: 16:9 virtual canvas, scaling, fullscreen, side-panel HUD

**Files:**
- Create: `Engine/Display.js`, `Game/Hud.js`, `tests/display.test.js`
- Modify: `index.html` (page structure, canvas size, script tags), `style.css` (full replacement), `Engine/Renderer.js` (map offset), `Engine/SpriteSheet.js` (scaled draw), `Game/PiNaBlaster.js` (`DrawHud`, `DrawSmallText`, "You won" text position)

**Interfaces:**
- Consumes: `Engine.Canvas`, `Engine.Context`, `Renderer.SpriteSheet`, module `Init()` protocol.
- Produces: global `Display` with `Init()`, `Tick()` (no-op), `Resize()`, `ToggleFullscreen()`, `IntegerScale` (bool property, default false), constants `Display.VirtualWidth = 576`, `Display.VirtualHeight = 324`.
- Produces pure `ComputeLayout(winW, winH, dpr, snap)` -> `{ scale, cssW, cssH }` where `scale` is the CSS scale factor (virtual px -> CSS px).
- Produces: `Renderer.MapOffsetX = 58`, `Renderer.MapOffsetY = 0` (map is drawn translated by this).
- Produces: `SpriteSheet.DrawSpriteScaled(context, x, y, index, scale)`.
- Produces: global `Hud` with `Text(ctx, text, x, y, align)`, `DrawCard(ctx, player, label, color, x, y, blink)`, `Draw(ctx, players, title, keyFlags, blink)`, constant `PLAYER_COLORS` (`["#e8e8e8", "#4aa3ff", "#ff5a4a", "#4fd35f"]`). `players` is an array of objects with the existing `Player` fields (`Lifes`, `Hearts`, `InvulnerableTime`, `IsDead`, `TotalBombs`, `Power`, `SkateTime`, `PushableBombsTime`, `SuperBombsTime`, `BadLuckTime`).

- [ ] **Step 1: Write the failing tests**

Create `tests/display.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { ComputeLayout } = require('../Engine/Display.js');

test('fills a 16:9 window exactly', () => {
  const l = ComputeLayout(1920, 1080, 1, false);
  assert.ok(Math.abs(l.scale - 1920 / 576) < 1e-9);
  assert.strictEqual(l.cssW, 1920);
  assert.strictEqual(l.cssH, 1080);
});

test('integer snap works in device pixels (dpr 1)', () => {
  const l = ComputeLayout(1920, 1080, 1, true);
  assert.strictEqual(l.scale, 3);
  assert.strictEqual(l.cssW, 1728);
  assert.strictEqual(l.cssH, 972);
});

test('integer snap works in device pixels (dpr 2)', () => {
  const l = ComputeLayout(1920, 1080, 2, true);
  assert.strictEqual(l.scale, 3); // 6 device px per virtual px
  assert.strictEqual(l.cssW, 1728);
});

test('letterboxes on a squarer window (width-limited)', () => {
  const l = ComputeLayout(1000, 1000, 1, false);
  assert.strictEqual(l.cssW, 1000);
  assert.strictEqual(l.cssH, 563);
});

test('ultrawide is height-limited', () => {
  const l = ComputeLayout(3440, 1440, 1, false);
  assert.strictEqual(l.cssH, 1440);
  assert.strictEqual(l.cssW, 2560);
});

test('never snaps below 1x, never returns zero', () => {
  const l = ComputeLayout(400, 300, 1, true);
  assert.ok(l.scale > 0 && l.scale < 1);
  assert.strictEqual(l.cssW, 400);
  const z = ComputeLayout(0, 0, 1, false);
  assert.ok(z.cssW >= 1 && z.cssH >= 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/display.test.js`
Expected: FAIL with `Cannot find module '../Engine/Display.js'`.

- [ ] **Step 3: Implement `Engine/Display.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/display.test.js`
Expected: 6 passing.

- [ ] **Step 5: Replace `index.html` body structure and `style.css`**

In `index.html`, replace everything from `<body ...>` down to (not including) the `<!-- Libraries -->` comment with:

```html
	<body oncontextmenu="return false;">

		<div id="stage">
			<canvas id="mainCanvas" width="576" height="324">
				Your browser does not support HTML 5 canvas.
			</canvas>
			<button id="fsButton" type="button" title="Fullscreen (F)" aria-label="Toggle fullscreen">&#x26F6;</button>
		</div>

```

Add `<meta name="viewport" content="width=device-width, initial-scale=1" />` in `<head>`. Add `<script src="Engine/Display.js"></script>` after `Engine/Renderer.js` and `<script src="Game/Hud.js"></script>` before `Game/PiNaBlaster.js`.

Replace `style.css` entirely:

```css
html, body
{
	margin: 0;
	height: 100%;
	background-color: #000000;
	color: #EEEEEE;
	font-family: 'Trebuchet MS', Tahoma, Arial;
	overflow: hidden;
}

#stage
{
	position: relative;
	width: 100vw;
	height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
}

canvas#mainCanvas
{
	image-rendering: pixelated;
	image-rendering: crisp-edges;
	display: block;
	background: #000000;
}

#fsButton
{
	position: absolute;
	right: 8px;
	bottom: 8px;
	width: 34px;
	height: 34px;
	font-size: 20px;
	line-height: 1;
	color: #EEEEEE;
	background: rgba(0, 0, 0, 0.55);
	border: 1px solid #555555;
	border-radius: 4px;
	cursor: pointer;
	opacity: 0.0;
	transition: opacity 0.2s;
}

#stage:hover #fsButton,
#fsButton:focus-visible
{
	opacity: 0.8;
}
```

- [ ] **Step 6: Map offset in `Engine/Renderer.js`**

Add `this.MapOffsetX = 58; this.MapOffsetY = 0;` next to `this.EnableDebugDraw`. Replace `Draw` with:

```js
	this.Draw = function()
	{
		context.fillStyle = "#000000";
		context.fillRect(0, 0, width, height);

		context.save();
		context.translate(this.MapOffsetX, this.MapOffsetY);

		context.drawImage(GameWorld.CacheImage, 0, 0);

		this.DrawSpriteLayer(-2);
		this.DrawSpriteLayer(-1);
		this.DrawSpriteLayer(0);
		this.DrawSpriteLayer(1);
		this.DrawSpriteLayer(2);

		if (this.EnableDebugDraw)
			this.DebugDraw();

		context.restore();
	}
```

- [ ] **Step 7: Scaled sprite draw in `Engine/SpriteSheet.js`**

Add after `DrawSpriteByIndex`:

```js
	this.DrawSpriteScaled = function(context, x, y, index, scale)
	{
		if (index < 0)
			return;

		context.drawImage
		(
			this.Image,
			(index % this.SpriteCountX) * this.SpriteWidth, Math.floor(index / this.SpriteCountX) * this.SpriteHeight, this.SpriteWidth, this.SpriteHeight,
			x - this.InnerOffsetX * scale, y - this.InnerOffsetY * scale, this.SpriteWidth * scale, this.SpriteHeight * scale
		);
	}
```

- [ ] **Step 8: Create `Game/Hud.js`**

```js
// Side-panel HUD. Virtual canvas is 576x324; the map sits in the middle,
// leaving a 58px panel on each side.

var PLAYER_COLORS = ["#e8e8e8", "#4aa3ff", "#ff5a4a", "#4fd35f"];

function HudPrototype()
{
	var PANEL_W = 58;
	var CARD_W = 52;
	var TOP_BAND = 24;
	var CARD_H = 148;
	var PITCH = 16;

	this.Text = function(ctx, text, x, y, align)
	{
		ctx.textAlign = align || "left";
		ctx.textBaseline = "middle";
		ctx.font = "Bold 10px Trebuchet MS";

		ctx.fillStyle = "#000000";
		ctx.fillText(text, x + 1, y);
		ctx.fillText(text, x - 1, y);
		ctx.fillText(text, x, y - 1);
		ctx.fillText(text, x, y + 1);

		ctx.fillStyle = "#FFFFFF";
		ctx.fillText(text, x, y);
		ctx.textAlign = "left";
	}

	// Timers blink during their last 5 seconds.
	function timerVisible(time, blink)
	{
		return time > 5.0 || blink;
	}

	this.DrawCard = function(ctx, p, label, color, x, y, blink)
	{
		var ss = Renderer.SpriteSheet;

		ctx.fillStyle = color;
		ctx.fillRect(x, y, CARD_W, 11);
		this.Text(ctx, label, x + CARD_W / 2, y + 6, "center");

		var ry = y + 14;

		// Lifes
		ss.DrawSpriteByIndex(ctx, x, ry, 194);
		this.Text(ctx, "x" + p.Lifes.toString(), x + 12, ry + 12);
		ry += PITCH;

		// Hearts
		if (p.Hearts > 0 || p.InvulnerableTime > 0.0 || (blink && !p.IsDead))
		{
			for (var i = 0; i < 3; ++i)
				ss.DrawSpriteByIndex(ctx, x + 3 + i * 7, ry, 198);
		}

		for (var i = 0; i < p.Hearts; ++i)
			ss.DrawSpriteByIndex(ctx, x + 3 + i * 7, ry, 178);

		if (p.InvulnerableTime > 0.0 && blink && p.Hearts < 3)
			ss.DrawSpriteByIndex(ctx, x + 3 + p.Hearts * 7, ry, 178);

		ry += PITCH;

		// Bombs
		ss.DrawSpriteByIndex(ctx, x, ry, 61);
		this.Text(ctx, "x" + p.TotalBombs.toString(), x + 12, ry + 12);
		ry += PITCH;

		// Power
		ss.DrawSpriteByIndex(ctx, x, ry, 174);
		this.Text(ctx, "x" + p.Power.toString(), x + 12, ry + 12);
		ry += PITCH;

		// Timed power-ups
		var timers = [[p.SkateTime, 176], [p.PushableBombsTime, 177], [p.SuperBombsTime, 195], [p.BadLuckTime, 179]];

		for (var t = 0; t < timers.length; ++t)
		{
			if (timers[t][0] > 0.0)
			{
				if (timerVisible(timers[t][0], blink))
				{
					ss.DrawSpriteByIndex(ctx, x, ry, timers[t][1]);
					this.Text(ctx, parseInt(timers[t][0] + 0.5).toString(), x + 20, ry + 12);
				}

				ry += PITCH;
			}
		}
	}

	// title: text for the top-left band; keyFlags: bitmask of collected keys (top-right band).
	this.Draw = function(ctx, players, title, keyFlags, blink)
	{
		var ss = Renderer.SpriteSheet;
		var rightX = Display.VirtualWidth - PANEL_W;

		this.Text(ctx, title, 3, 12);

		for (var i = 0, n = 0, flag = 1; i < 4; ++i, flag *= 2)
		{
			if (keyFlags & flag)
			{
				ss.DrawSpriteScaled(ctx, rightX + 3 + n * 13, 4, 98 + i * 20, 0.6);
				++n;
			}
		}

		for (var s = 0; s < players.length && s < 4; ++s)
		{
			var x = (s % 2 == 0) ? 3 : rightX + 3;
			var y = TOP_BAND + Math.floor(s / 2) * CARD_H;

			this.DrawCard(ctx, players[s], "P" + (s + 1), PLAYER_COLORS[s], x, y, blink);
		}
	}
}

var Hud = new HudPrototype();
```

- [ ] **Step 9: Use `Hud` from `Game/PiNaBlaster.js`**

Replace the body of `DrawHud` (created in Task 1) with:

```js
	this.DrawHud = function()
	{
		Hud.Draw(Engine.Context, [this.Player], "LEVEL " + (this.LevelNumber + 1), this.Player.KeyFlags, this.Blinker > 1.0);
	}
```

Replace `DrawSmallText` with a delegate and move the "You won" text onto the map:

```js
	this.DrawSmallText = function(text, x, y)
	{
		Hud.Text(Engine.Context, text, x, y, "center");
	}
```

and in `Draw`, change the call to `this.DrawSmallText("You won! Thanks for playing!", Display.VirtualWidth / 2, 316);`.

- [ ] **Step 10: Verify visually**

Serve and open `http://localhost:8000/`. Use `mcp__Claude_Browser__resize_window` for 1920x1080, 1000x1000, 375x667 (mobile preset) and 3440x1440 (custom), take a screenshot at each.
Expected: the 16:9 canvas is centered and letterboxed with black bars; pixels are crisp (not blurred); the map is centered with a 58px panel each side; the left panel shows `LEVEL 7`, then a white `P1` card with lifes, hearts, bombs and power rows; picking up keys shows key icons top-right of the right panel. If any card row overlaps or clips, tune `PITCH`, `TOP_BAND`, and the `+12`/`+20` text offsets in `Hud.js` until clean. Press `F`: the page enters fullscreen and fills the screen; `F` again exits; hovering the page shows the fullscreen button and clicking it toggles too. In the console run `Display.IntegerScale = true; Display.Resize()` and confirm the canvas CSS size is a whole multiple of 576x324 at dpr 1. Run `node --test tests/` - all passing.

---

### Task 5: PlayerManager and multi-player-safe targeting (still one player)

Replaces every use of the `GameWorld.PlayerEntity` singleton so Task 6 can spawn several players. Behaviour with one player stays the same, except for the three bug fixes listed in Step 7.

**Files:**
- Create: `Game/Players.js`, `tests/players.test.js`
- Modify: `Game/Player.js` (register with manager, shared keys, idle-facing fix), `Game/Enemy.js` (targeting + laser power-up bug), `Game/Explosion.js` (`GeneratePowerUp`), `Game/PiNaBlaster.js` (reset manager per level), `index.html` (script tag)

**Interfaces:**
- Produces pure helpers (also exported for tests):
  - `NearestPlayer(players, x, y)` -> player or `null`. Living players first (squared distance between box centres); if none are alive, the nearest of all; `null` when the list is empty.
  - `NeediestPlayer(players)` -> living player with the lowest `TotalBombs * Power` (ties: first in list); falls back to `players[0]`; `null` when empty.
  - `ComputeSpawns(isFree, w, h, bx, by, count)` -> `[{x, y}]` tile coordinates. Candidates are the base tile and its mirrors (x, y, both); a candidate that is not free or already used is replaced by the nearest free unused tile (rings by Manhattan distance, within a ring ordered by row then column).
- Produces global `PlayerManager`: `Players` (array of `Player` entities), `KeyFlags` (team-shared key bitmask), `Reset()`, `Register(player)`, `Nearest(x, y)`, `Neediest()`, `Alive()` (living players).
- Changes `Player`: `Player.KeyFlags` becomes a property that reads/writes `PlayerManager.KeyFlags`; new fields `Index` (0-3, default 0), `SpawnX`, `SpawnY`.

- [ ] **Step 1: Write the failing tests**

Create `tests/players.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { NearestPlayer, NeediestPlayer, ComputeSpawns } = require('../Game/Players.js');

function pl(x, y, dead, bombs, power) {
  return { X: x, Y: y, Width: 17, Height: 17, IsDead: !!dead, TotalBombs: bombs || 1, Power: power || 1 };
}

test('NearestPlayer prefers the nearest living player', () => {
  const a = pl(0, 0), b = pl(100, 0);
  assert.strictEqual(NearestPlayer([a, b], 90, 0), b);
  b.IsDead = true;
  assert.strictEqual(NearestPlayer([a, b], 90, 0), a);
});

test('NearestPlayer falls back to dead players, then null', () => {
  const a = pl(0, 0, true), b = pl(100, 0, true);
  assert.strictEqual(NearestPlayer([a, b], 90, 0), b);
  assert.strictEqual(NearestPlayer([], 0, 0), null);
});

test('NeediestPlayer picks the weakest living player', () => {
  const a = pl(0, 0, false, 3, 3), b = pl(0, 0, false, 1, 2), c = pl(0, 0, true, 1, 1);
  assert.strictEqual(NeediestPlayer([a, b, c]), b);
  assert.strictEqual(NeediestPlayer([c]), c);
  assert.strictEqual(NeediestPlayer([]), null);
});

function grid(n, blocked) {
  blocked = blocked || [];
  return (x, y) => x >= 0 && y >= 0 && x < n && y < n && !blocked.some(b => b[0] == x && b[1] == y);
}

test('ComputeSpawns mirrors the base tile into the other corners', () => {
  assert.deepStrictEqual(ComputeSpawns(grid(5), 5, 5, 1, 1, 4),
    [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 1, y: 3 }, { x: 3, y: 3 }]);
});

test('ComputeSpawns only returns as many spawns as requested', () => {
  assert.strictEqual(ComputeSpawns(grid(5), 5, 5, 1, 1, 2).length, 2);
});

test('ComputeSpawns moves a blocked mirror to the nearest free tile', () => {
  assert.deepStrictEqual(ComputeSpawns(grid(5, [[3, 1]]), 5, 5, 1, 1, 2),
    [{ x: 1, y: 1 }, { x: 3, y: 0 }]);
});

test('ComputeSpawns avoids duplicate tiles when mirrors coincide', () => {
  assert.deepStrictEqual(ComputeSpawns(grid(5), 5, 5, 2, 2, 4),
    [{ x: 2, y: 2 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/players.test.js`
Expected: FAIL with `Cannot find module '../Game/Players.js'`.

- [ ] **Step 3: Implement `Game/Players.js`**

```js
// Roster helpers and the PlayerManager singleton.

function CenterDistSq(p, x, y)
{
	var dx = (p.X + p.Width / 2) - x;
	var dy = (p.Y + p.Height / 2) - y;
	return dx * dx + dy * dy;
}

function NearestPlayer(players, x, y)
{
	var best = null, bestD = Infinity, bestAlive = null, bestAliveD = Infinity;

	for (var i = 0; i < players.length; ++i)
	{
		var p = players[i];
		var d = CenterDistSq(p, x, y);

		if (d < bestD) { bestD = d; best = p; }
		if (!p.IsDead && d < bestAliveD) { bestAliveD = d; bestAlive = p; }
	}

	return bestAlive ? bestAlive : best;
}

function NeediestPlayer(players)
{
	var best = null, bestScore = Infinity;

	for (var i = 0; i < players.length; ++i)
	{
		var p = players[i];

		if (p.IsDead) continue;

		var score = p.TotalBombs * p.Power;

		if (score < bestScore) { bestScore = score; best = p; }
	}

	if (best) return best;

	return players.length > 0 ? players[0] : null;
}

function ComputeSpawns(isFree, w, h, bx, by, count)
{
	var candidates = [[bx, by], [w - 1 - bx, by], [bx, h - 1 - by], [w - 1 - bx, h - 1 - by]];
	var used = {};
	var result = [];

	function key(x, y) { return x + "," + y; }

	function nearestFree(cx, cy)
	{
		for (var d = 1; d <= w + h; ++d)
		{
			for (var dy = -d; dy <= d; ++dy)
			{
				var span = d - Math.abs(dy);
				var dxs = span == 0 ? [0] : [-span, span];

				for (var k = 0; k < dxs.length; ++k)
				{
					var x = cx + dxs[k], y = cy + dy;

					if (isFree(x, y) && !used[key(x, y)])
						return { x: x, y: y };
				}
			}
		}

		return { x: cx, y: cy };
	}

	for (var i = 0; i < count && i < candidates.length; ++i)
	{
		var c = { x: candidates[i][0], y: candidates[i][1] };

		if (!isFree(c.x, c.y) || used[key(c.x, c.y)])
			c = nearestFree(c.x, c.y);

		used[key(c.x, c.y)] = true;
		result.push(c);
	}

	return result;
}

function PlayerManagerPrototype()
{
	this.Players = [];
	this.KeyFlags = 0;

	this.Reset = function()
	{
		this.Players = [];
		this.KeyFlags = 0;
	}

	this.Register = function(player)
	{
		this.Players.push(player);
	}

	this.Nearest = function(x, y)
	{
		return NearestPlayer(this.Players, x, y);
	}

	this.Neediest = function()
	{
		return NeediestPlayer(this.Players);
	}

	this.Alive = function()
	{
		var list = [];

		for (var i = 0; i < this.Players.length; ++i)
			if (!this.Players[i].IsDead)
				list.push(this.Players[i]);

		return list;
	}
}

var PlayerManager = new PlayerManagerPrototype();

if (typeof module !== 'undefined')
	module.exports = { NearestPlayer: NearestPlayer, NeediestPlayer: NeediestPlayer, ComputeSpawns: ComputeSpawns };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/players.test.js`
Expected: 7 passing.

- [ ] **Step 5: Wire `Game/Player.js`**

1. At the top of the `Player` function, directly after the line `GameEntityManager.RegisterEntity(this);`, add `PlayerManager.Register(this);`.
2. Replace `// Key flags` / `this.KeyFlags = 0;` (lines 43-44) with a shared-keys property and the new fields:

```js
	// Player slot (0-3) and spawn tile position
	this.Index = 0;
	this.SpawnX = 0;
	this.SpawnY = 0;

	// Keys are shared by the whole team
	Object.defineProperty(this, "KeyFlags",
	{
		get: function() { return PlayerManager.KeyFlags; },
		set: function(v) { PlayerManager.KeyFlags = v; }
	});
```

3. In `OnDirectionChange`, change `switch (this.PrevDirection)` to `switch (this.LastDirection)` (the manager calls `OnDirectionChange` before it updates `LastDirection`, so it still holds the previous direction; `PrevDirection` was never defined, so a stopped player always turned to face down).

- [ ] **Step 6: Replace `GameWorld.PlayerEntity` in `Game/Enemy.js`**

1. In `Tick`, replace the whole `if (this.FearOfPlayer || fearTimer > 0.0) { ... } else if (this.SeekPlayer) { ... }` block (current lines 244-263) with:

```js
				var target = PlayerManager.Nearest(this.X, this.Y);

				if (target && (this.FearOfPlayer || fearTimer > 0.0))
				{
					var px = GameWorld.GetAlignedX(target.X + target.Width / 2);
					var py = GameWorld.GetAlignedY(target.Y + target.Height / 2);

					if (this.Direction != 1 && py < ay && ax == px && dx == 0) this.NextDirection = 3;
					else if (this.Direction != 2 && px > ax && ay == py && dy == 0) this.NextDirection = 4;
					else if (this.Direction != 3 && py > ay && ax == px && dx == 0) this.NextDirection = 1;
					else if (this.Direction != 4 && px < ax && ay == py && dy == 0) this.NextDirection = 2;
				}
				else if (target && this.SeekPlayer)
				{
					var px = GameWorld.GetAlignedX(target.X + target.Width / 2);
					var py = GameWorld.GetAlignedY(target.Y + target.Height / 2);

					if (this.Direction != 1 && py < ay && ax == px && dx == 0) this.NextDirection = 1;
					else if (this.Direction != 2 && px > ax && ay == py && dy == 0) this.NextDirection = 2;
					else if (this.Direction != 3 && py > ay && ax == px && dx == 0) this.NextDirection = 3;
					else if (this.Direction != 4 && px < ax && ay == py && dy == 0) this.NextDirection = 4;
				}
```

2. In `GenerateDirection`, replace the final `if (this.SeekPlayer) { ... }` block (current lines 475-487) with:

```js
			var target = PlayerManager.Nearest(this.X, this.Y);

			if (this.SeekPlayer && target)
			{
				var ax = GameWorld.GetAlignedX(this.X + this.Width / 2);
				var ay = GameWorld.GetAlignedY(this.Y + this.Height / 2);

				var px = GameWorld.GetAlignedX(target.X + target.Width / 2);
				var py = GameWorld.GetAlignedY(target.Y + target.Height / 2);

				if (this.Direction != 1 && py < ay && ax == px) this.Direction = 1;
				if (this.Direction != 2 && px > ax && ay == py) this.Direction = 2;
				if (this.Direction != 3 && py > ay && ax == px) this.Direction = 3;
				if (this.Direction != 4 && px < ax && ay == py) this.Direction = 4;
			}
```

3. In `GetPlayerSightDirection`, replace the two `px`/`py` lines (current 495-496) with:

```js
		var target = PlayerManager.Nearest(this.X, this.Y);

		if (!target)
			return 0;

		var px = GameWorld.GetAlignedX(target.X + target.Width / 2);
		var py = GameWorld.GetAlignedY(target.Y + target.Height / 2);
```

4. In `FireMyLazer`, change `GameWorld.GeneratePowerUp(x, y);` (current line 610) to `GeneratePowerUp(x, y);` (`GeneratePowerUp` is a global function in `Explosion.js`; `GameWorld` has no such method, so the laser of the "Shoop-da-whoop" enemy threw a `TypeError` whenever it burned a wall).
5. Verify no references remain: `grep -rn "PlayerEntity" Game Engine` must only list `Engine/GameWorld.js` and `Game/PiNaBlaster.js` (removed in step 8).

- [ ] **Step 7: Replace `GeneratePowerUp` in `Game/Explosion.js`**

Replace the whole function (lines 53-105) with the version below. It reads the neediest living player and uses `TotalBombs` instead of the number of currently available bombs (`Bombs` drops to 0 while bombs are on the field, which made `1 / Bombs` infinite and skewed drops).

```js
function GeneratePowerUp(x, y)
{
	var pl = PlayerManager.Neediest();

	if (pl == null)
		return;

	if (Math.random() < 0.5)
	{
		var type = -1;

		// Chance for common power-up
		if (Math.random() < 0.5)
		{
			if (Math.random() < Math.pow((1.0 / pl.TotalBombs) * (1.0 / pl.Power), 0.25))
			{
				var bombsProb = Math.random() * (1.0 / pl.TotalBombs);
				var powerProb = Math.random() * (1.0 / pl.Power);

				if (bombsProb > powerProb)
					type = 1;
				else
					type = 0;
			}
			else
				type = 2 + Math.floor(Math.random() * 2.0);

			if (pl.TotalBombs >= 5 && pl.Power >= 5 && Math.random() < 0.1)
			{
				type = 7;
			}
		}
		else
		{
			if (pl.Hearts < 3 && Math.random() < 0.25)
			{
				type = 4;
			}
			else if (Math.random() < 0.25)
			{
				type = 5;

				if (Math.random() < 0.2 / (pl.Lifes + 1))
					type = 6;
			}
		}

		if (type >= 0)
		{
			var pu = new PowerUp();

			pu.X = x;
			pu.Y = y;

			pu.SetPowerUpType(type);
		}
	}
}
```

- [ ] **Step 8: Update `Game/PiNaBlaster.js` and `index.html`**

1. In `InitializeLevelEntities`, make the first statement `PlayerManager.Reset();` (before `GameEntityManager.Entities = [];`).
2. After `this.Player = new Player();` add `this.Player.Index = 0; this.Player.SpawnX = GameWorld.PlayerPosX; this.Player.SpawnY = GameWorld.PlayerPosY;`.
3. In `RespawnPlayer`, use `this.Player.SpawnX` / `SpawnY` instead of `GameWorld.PlayerPosX/Y`.
4. Remove the now-unused `GameWorld.PlayerEntity = this.Player;` line and the `this.PlayerEntity = null;` field in `Engine/GameWorld.js`.
5. In `index.html`, add `<script src="Game/Players.js"></script>` before `Game/Player.js`.

- [ ] **Step 9: Verify**

Run `node --test tests/` (all passing). Serve, open the game, play level 7 (index 6 is the default): enemies still wander and chase (the "Mop on meth" moves toward you when aligned), the "Drakentus" runs away when you line up with it, and picking up a key still opens its door. On `http://localhost:8000/?debug` press `3` (level index 2) and blow up a few walls: power-ups still drop. The browser console shows no errors. Check the laser fix by reading: `grep -n "GameWorld.GeneratePowerUp" Game/Enemy.js` finds nothing.

---

### Task 6: 1-4 players: roster, spawns, per-player tint, labels, HUD cards

**Files:**
- Create: `Engine/Tint.js`, `tests/tint.test.js`
- Modify: `Game/Players.js` (add `DefaultRoster`), `tests/players.test.js` (roster tests), `Engine/Sprite.js` (`Sheet` override), `Engine/SpriteSheet.js` (`FromCanvas`), `Engine/Renderer.js` (use `Sprite.Sheet`, draw labels), `Game/Hud.js` (`DrawPlayerLabels`), `Game/Player.js` (apply tint), `Game/PiNaBlaster.js` (roster, `CreatePlayers`, per-player `GameTick`, `RespawnPlayer(p)`, HUD, debug keys), `index.html`

**Interfaces:**
- Consumes: `ComputeSpawns`, `PlayerManager`, `Input.Bind/Unbind/Player`, `Hud.Draw`, `Player.Index/SpawnX/SpawnY`.
- Produces pure `DefaultRoster(count)` -> array of input bindings (`{Keyboard, Pad}`, same shape as `Input.Bind`), clamped to 1-4: one player = keyboard 0 + any pad; two or more = P1 keyboard 0 + pad 0, P2 keyboard 1 + pad 1, P3 pad 2, P4 pad 3.
- Produces pure `TintRegion(data, width, height, tint)` (mutates RGBA bytes: pixels that are near-grey and bright get multiplied by `tint / 255`; everything else is left alone) and `PLAYER_TINTS` (`[null, [74,163,255], [255,90,74], [79,211,95]]`, matching `PLAYER_COLORS` in `Hud.js`).
- Produces global `Tint` with `GetSheet(playerIndex)` -> a `SpriteSheet` (or `null` when the base sheet is not loaded yet, the index is 0, or canvas read-back is blocked).
- Produces `SpriteSheet.FromCanvas(canvas, spriteW, spriteH, innerX, innerY)` and optional `Sprite.Sheet` (when set, the renderer draws that entity with it instead of `Renderer.SpriteSheet`).
- Produces `PiNaBlaster.Roster` (array of bindings), `PiNaBlaster.ApplyRoster()`, `PiNaBlaster.CreatePlayers()`, `PiNaBlaster.RespawnPlayer(player)`.
- Dev shortcut: `?debug&players=N` starts with N players (the lobby in Task 8 replaces this for normal play).

- [ ] **Step 1: Write the failing tests**

Create `tests/tint.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { TintRegion, PLAYER_TINTS } = require('../Engine/Tint.js');

function px(r, g, b, a) { return [r, g, b, a]; }

// two rows x two columns image, 4 bytes per pixel
function img(pixels) {
  return new Uint8ClampedArray([].concat.apply([], pixels));
}

test('bright grey body pixels are multiplied by the tint', () => {
  const d = img([px(243, 243, 243, 255), px(211, 211, 211, 255), px(0, 0, 0, 255), px(243, 87, 0, 255)]);
  TintRegion(d, 2, 2, [74, 163, 255]);
  assert.deepStrictEqual(Array.from(d.slice(0, 4)), [Math.round(243 * 74 / 255), Math.round(243 * 163 / 255), 243, 255]);
  assert.deepStrictEqual(Array.from(d.slice(4, 8)), [Math.round(211 * 74 / 255), Math.round(211 * 163 / 255), 211, 255]);
});

test('outline, shadow, transparent and coloured pixels are untouched', () => {
  const orig = [px(0, 0, 0, 255), px(51, 51, 51, 128), px(243, 243, 243, 0), px(243, 87, 0, 255)];
  const d = img(orig);
  TintRegion(d, 2, 2, [255, 90, 74]);
  assert.deepStrictEqual(Array.from(d), [].concat.apply([], orig));
});

test('only the given region (width x height) is processed', () => {
  // image is 2 wide, region is 1 wide x 1 high: only the first pixel changes
  const d = img([px(243, 243, 243, 255), px(243, 243, 243, 255), px(243, 243, 243, 255), px(243, 243, 243, 255)]);
  TintRegion(d, 2, 2, [74, 163, 255], 1, 1);
  assert.notStrictEqual(d[1], 243);
  assert.strictEqual(d[5], 243);
  assert.strictEqual(d[9], 243);
});

test('PLAYER_TINTS has no tint for player 1', () => {
  assert.strictEqual(PLAYER_TINTS[0], null);
  assert.strictEqual(PLAYER_TINTS.length, 4);
});
```

Append to `tests/players.test.js` (and extend its first `require` line to also import `DefaultRoster`):

```js
test('DefaultRoster: one player listens to the keyboard and any pad', () => {
  assert.deepStrictEqual(DefaultRoster(1), [{ Keyboard: 0, Pad: 'any' }]);
});

test('DefaultRoster: several players get separate keyboards / pads and clamp to 1-4', () => {
  const r = DefaultRoster(3);
  assert.strictEqual(r.length, 3);
  assert.deepStrictEqual(r[1], { Keyboard: 1, Pad: 1 });
  assert.deepStrictEqual(r[2], { Keyboard: null, Pad: 2 });
  assert.strictEqual(DefaultRoster(9).length, 4);
  assert.strictEqual(DefaultRoster(0).length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: `tint.test.js` fails with `Cannot find module '../Engine/Tint.js'`; the new roster tests fail (`DefaultRoster is not a function`).

- [ ] **Step 3: Add `DefaultRoster` to `Game/Players.js`**

Insert before `function PlayerManagerPrototype()`:

```js
function DefaultRoster(count)
{
	if (count <= 1)
		return [{ Keyboard: 0, Pad: "any" }];

	var all = [{ Keyboard: 0, Pad: 0 }, { Keyboard: 1, Pad: 1 }, { Keyboard: null, Pad: 2 }, { Keyboard: null, Pad: 3 }];

	return all.slice(0, Math.min(count, 4));
}
```

and add `DefaultRoster: DefaultRoster` to the `module.exports` object.

- [ ] **Step 4: Create `Engine/Tint.js`**

```js
// Per-player recolouring of the player sprites (sprite sheet row 0, frames 0-13).
// Only bright, near-grey pixels (the suit) are multiplied by the player colour;
// outlines, shadows, face and accessories keep their original colours.

var PLAYER_TINTS = [null, [74, 163, 255], [255, 90, 74], [79, 211, 95]];

// data: RGBA bytes of an image `width` pixels wide; the first `regionW` x `regionH` pixels are tinted
// (defaults to the whole `width` x `height`).
function TintRegion(data, width, height, tint, regionW, regionH)
{
	regionW = regionW || width;
	regionH = regionH || height;

	for (var y = 0; y < regionH; ++y)
	{
		for (var x = 0; x < regionW; ++x)
		{
			var i = (y * width + x) * 4;

			if (data[i + 3] == 0)
				continue;

			var r = data[i], g = data[i + 1], b = data[i + 2];
			var mx = Math.max(r, g, b), mn = Math.min(r, g, b);

			if (mn >= 120 && mx - mn <= 10)
			{
				data[i] = Math.round(r * tint[0] / 255);
				data[i + 1] = Math.round(g * tint[1] / 255);
				data[i + 2] = Math.round(b * tint[2] / 255);
			}
		}
	}
}

function TintPrototype()
{
	var cache = {};

	// The first 14 sprites of row 0 are the player animation frames.
	var PLAYER_FRAMES = 14;

	this.GetSheet = function(index)
	{
		if (index <= 0 || !PLAYER_TINTS[index])
			return null;

		if (cache[index] !== undefined)
			return cache[index] || null;

		var base = Renderer.SpriteSheet;

		if (!base || !base.IsLoaded)
			return null;

		try
		{
			var c = document.createElement("canvas");
			c.width = base.Image.width;
			c.height = base.Image.height;

			var cx = c.getContext("2d");
			cx.drawImage(base.Image, 0, 0);

			var w = PLAYER_FRAMES * base.SpriteWidth, h = base.SpriteHeight;
			var data = cx.getImageData(0, 0, w, h);
			TintRegion(data.data, w, h, PLAYER_TINTS[index]);
			cx.putImageData(data, 0, 0);

			cache[index] = SpriteSheet.FromCanvas(c, base.SpriteWidth, base.SpriteHeight, base.InnerOffsetX, base.InnerOffsetY);
		}
		catch (e)
		{
			// Canvas read-back blocked (e.g. file://): players keep the default colours.
			cache[index] = false;
		}

		return cache[index] || null;
	}
}

if (typeof Engine !== 'undefined') var Tint = new TintPrototype();

if (typeof module !== 'undefined') module.exports = { TintRegion: TintRegion, PLAYER_TINTS: PLAYER_TINTS };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/`
Expected: all suites passing (loop, input, audiomixer, display, players incl. roster, tint).

- [ ] **Step 6: Sheet override plumbing**

`Engine/Sprite.js`: add `this.Sheet = null;` next to `this.Visible = true;`.

`Engine/SpriteSheet.js`: change `this.Image.src = name;` to `if (name) this.Image.src = name;` and add after the constructor function (outside it):

```js
// Wrap an already-drawn canvas as a sprite sheet (used for per-player recolours).
SpriteSheet.FromCanvas = function(canvas, spriteWidth, spriteHeight, innerX, innerY)
{
	var s = new SpriteSheet(null, spriteWidth, spriteHeight);

	s.Image = canvas;
	s.InnerOffsetX = innerX;
	s.InnerOffsetY = innerY;
	s.SpriteCountX = Math.floor(canvas.width / spriteWidth);
	s.SpriteCountY = Math.floor(canvas.height / spriteHeight);
	s.IsLoaded = true;

	return s;
}
```

`Engine/Renderer.js`, in `DrawSpriteLayer` replace the draw call with:

```js
				var sheet = entity.Sprite.Sheet || this.SpriteSheet;
				sheet.DrawSpriteByIndex(context, entity.X + entity.Sprite.OffsetX, entity.Y + entity.Sprite.OffsetY, entity.Sprite.GetActualFrame());
```

and in `Draw`, just before `if (this.EnableDebugDraw)`, add:

```js
		if (PlayerManager.Players.length > 1)
			Hud.DrawPlayerLabels(context, PlayerManager.Players);
```

`Game/Hud.js`, add inside `HudPrototype`:

```js
	// "P1".."P4" above each player for the first 3 seconds after spawning (map coordinates).
	this.DrawPlayerLabels = function(ctx, players)
	{
		for (var i = 0; i < players.length; ++i)
		{
			var p = players[i];

			if (p.Time < 3.0 && !p.IsDead)
				this.Text(ctx, "P" + (p.Index + 1), p.X + 8, p.Y - 7, "center");
		}
	}
```

`Game/Player.js`: at the very start of `this.Tick`, add:

```js
		if (!this.Sprite.Sheet && this.Index > 0)
			this.Sprite.Sheet = Tint.GetSheet(this.Index);
```

`index.html`: add `<script src="Engine/Tint.js"></script>` after `Engine/SpriteSheet.js`.

- [ ] **Step 7: Players in `Game/PiNaBlaster.js`**

1. Replace `this.Player = null;` (top) with:

```js
	// Input bindings, one per player (length = number of players)
	this.Roster = DefaultRoster(1);
```

2. Add:

```js
	this.ApplyRoster = function()
	{
		for (var i = 0; i < 4; ++i)
			Input.Unbind(i);

		for (var i = 0; i < this.Roster.length; ++i)
			Input.Bind(i, this.Roster[i]);
	}
```

3. In `Init`, replace the `Input.Bind(0, ...)` line from Task 2 with:

```js
		var m = /[?&]players=(\d)/.exec(window.location.search);
		var count = (Engine.Debug && m) ? Math.max(1, Math.min(4, parseInt(m[1]))) : 1;
		this.Roster = DefaultRoster(count);
		this.ApplyRoster();
```

4. In `InitializeLevelEntities`, replace everything from `this.Player = new Player();` to the end of the function with `this.CreatePlayers();`, and add this method next to it inside `PiNaBlaster`:

```js
	this.CreatePlayers = function()
	{
		var W = GameWorld.WorldWidth, H = GameWorld.WorldHeight;
		var bw = GameWorld.BlockWidth, bh = GameWorld.BlockHeight;

		function isFree(x, y)
		{
			if (x < 0 || y < 0 || x >= W || y >= H || GameWorld.Walls[y][x] != ' ')
				return false;

			return GameEntityManager.IsEmptySpotThere(x * bw, y * bh, x * bw + bw - 1, y * bh + bh - 1);
		}

		var spawns = ComputeSpawns(isFree, W, H, Math.floor(GameWorld.PlayerPosX / bw), Math.floor(GameWorld.PlayerPosY / bh), this.Roster.length);

		for (var i = 0; i < spawns.length; ++i)
		{
			var p = new Player();

			p.Index = i;
			p.SpawnX = spawns[i].x * bw;
			p.SpawnY = spawns[i].y * bh;
			p.X = p.SpawnX;
			p.Y = p.SpawnY;
			p.Width = 17;
			p.Height = 17;
		}
	}
```

(`GameWorld.Invalidate();` stays before the `this.CreatePlayers();` call.)

5. Replace `GameTick` with:

```js
	this.GameTick = function(delta)
	{
		var players = PlayerManager.Players;

		for (var i = 0; i < players.length; ++i)
		{
			var p = players[i];
			var act = Input.Player(p.Index);

			p.ApplyInputDirection(act.Dir);

			// (ignore the bomb button for a limited time after a player spawns)
			if (act.Bomb && p.Time > 0.5)
			{
				if (!p.IsDead)
				{
					p.Poop();
				}
				else if (p.Lifes > 0)
				{
					--p.Lifes;

					this.RespawnPlayer(p);
				}
			}
		}

		if (GameEntityManager.GetNumEntitiesByType("Enemy") == 0)
		{
			this.SetLevel(this.LevelNumber + 1);
		}
	}
```

6. Replace `RespawnPlayer` with:

```js
	this.RespawnPlayer = function(p)
	{
		p.X = p.SpawnX;
		p.Y = p.SpawnY;
		p.IsDead = false;
		p.InvulnerableTime = 10.0;
		p.Hearts = 3;
		p.SkateTime = 0.0;
		p.PushableBombsTime = 0.0;
		p.SuperBombsTime = 0.0;
		p.BadLuckTime = 0.0;
		p.BadLuckFlags = 0;
		p.Time = 0.0;
		p.Sprite.Frames = [0];
	}
```

(The explicit `Sprite.Frames = [0]` replaces the old reliance on the next direction change to reset the death animation.)

7. Replace `DrawHud` with:

```js
	this.DrawHud = function()
	{
		Hud.Draw(Engine.Context, PlayerManager.Players, "LEVEL " + (this.LevelNumber + 1), PlayerManager.KeyFlags, this.Blinker > 1.0);
	}
```

8. In `KeyDown`'s `Engine.Debug` block, replace each `this.Player` with a local `p0` declared as `var p0 = PlayerManager.Players[0];` at the top of the block, guarding the block body with `if (p0) { ... }` for the keys that touch it (`R`, `+`, `-`).
9. In `KeyDown`/`KeyUp` remove any remaining `this.Player.IsDead` references (Task 2 already removed the arrow handling). `grep -n "this.Player\b" Game/PiNaBlaster.js` must find nothing.

- [ ] **Step 8: Verify**

Run `node --test tests/` (all passing). Serve and open `http://localhost:8000/?debug&players=2`.
Expected: two bombermen spawn in different corners (P2 is blue-tinted, P1 white); "P1"/"P2" labels float above them for about 3 s; arrow keys + Space drive P1, WASD + Left Shift drive P2 independently; the left panel has the white `P1` card and the right panel the blue `P2` card, each with its own hearts/bombs/power. Kill P2 with a bomb: only P2's card shows 0 hearts and P2 respawns at their own corner on Left Shift while P1 keeps playing. Enemies move toward the closer player. Then open `?debug&players=4` and simulate pads for P3/P4 in the console:

```js
const mk = (i, ax) => ({ index: i, connected: true, axes: ax, buttons: Array.from({ length: 17 }, () => ({ pressed: false })) });
navigator.getGamepads = () => [null, null, mk(2, [1, 0]), mk(3, [0, 1])];
```

Expected: P3 walks right and P4 walks down; four cards fill both panels without overlapping (tune `CARD_H`/`PITCH` in `Hud.js` if they do). Open `http://localhost:8000/?players=3` (no `debug`): only one player spawns, because the shortcut is debug-only. Check the level transition: `?debug&players=3`, press `2`, then `1`: players respawn at valid free tiles each time, never inside walls.

---

### Task 7: Settings persistence, screen stack, pause and options screens

**Files:**
- Create: `Game/Settings.js`, `Game/Screens.js`, `tests/settings.test.js`, `tests/menu.test.js`
- Modify: `Game/PiNaBlaster.js` (hooks), `index.html` (script tags)

**Interfaces:**
- Consumes: `Input.Menu()`, `Input.Player(i).StartPressed`, `AudioMixer.SetVolume/GetVolume`, `Display.IntegerScale/Resize/ToggleFullscreen`, `Engine.Paused`, `Hud.Text`.
- Produces pure `SanitizeSettings(raw)` -> `{master, sfx, music, integerScale}` (volumes clamped to 0..1, anything invalid replaced by the default: master 0.8, sfx 1.0, music 0.6, integerScale false).
- Produces global `Settings`: `Values`, `Load()`, `Save()`, `Set(key, value)`, `Apply()`. Storage key `pinablaster.settings.v1`; every storage access is wrapped in try/catch.
- Produces pure `MenuModel(items)`: `Items`, `Index`, `Move(delta)` (wraps, skips disabled), `Handle(menuInput)` where `menuInput` is the `Input.Menu()` object. An item is `{ Label: string | function, OnConfirm?, OnAdjust?(dir), Disabled?() }`.
- Produces global `Screens` (screen stack): `Push(screen)`, `Pop()`, `Replace(screen)`, `Clear()`, `Current()`, `Update()`, `Draw(ctx)`. A screen is `{ PausesGame: bool, Update(menuInput), Draw(ctx) }`. After every stack change `Engine.Paused` is set to "any screen on the stack has `PausesGame`".
- Produces `Screens.Text(ctx, text, x, y, size, align, color)` and `Screens.DrawMenu(ctx, title, model, hint)`.
- Produces `PauseScreen(game)` and `OptionsScreen()`.
- Produces `PiNaBlaster.FrameUpdate()` (opens pause on Escape / pad Start / pad B / window blur) and `PiNaBlaster.WantsPause()`.

- [ ] **Step 1: Write the failing tests**

Create `tests/settings.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { SanitizeSettings } = require('../Game/Settings.js');

test('defaults when there is nothing stored', () => {
  assert.deepStrictEqual(SanitizeSettings(null), { master: 0.8, sfx: 1.0, music: 0.6, integerScale: false });
  assert.deepStrictEqual(SanitizeSettings('garbage'), SanitizeSettings(null));
});

test('valid values are kept, volumes are clamped', () => {
  const s = SanitizeSettings({ master: 0.3, sfx: 5, music: -2, integerScale: true });
  assert.deepStrictEqual(s, { master: 0.3, sfx: 1, music: 0, integerScale: true });
});

test('wrong types fall back to the default per field', () => {
  const s = SanitizeSettings({ master: '0.1', sfx: null, music: NaN, integerScale: 'yes' });
  assert.deepStrictEqual(s, { master: 0.8, sfx: 1.0, music: 0.6, integerScale: false });
});
```

Create `tests/menu.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { MenuModel } = require('../Game/Screens.js');

const none = { Up: false, Down: false, Left: false, Right: false, Confirm: false, Back: false, Any: false };
const press = (k) => Object.assign({}, none, { [k]: true, Any: true });

test('Move wraps in both directions', () => {
  const m = new MenuModel([{ Label: 'a' }, { Label: 'b' }, { Label: 'c' }]);
  m.Move(-1);
  assert.strictEqual(m.Index, 2);
  m.Move(1);
  assert.strictEqual(m.Index, 0);
});

test('Move skips disabled items', () => {
  const m = new MenuModel([{ Label: 'a' }, { Label: 'b', Disabled: () => true }, { Label: 'c' }]);
  m.Move(1);
  assert.strictEqual(m.Index, 2);
});

test('Handle: Down/Up move, Confirm activates, Left/Right adjust', () => {
  const log = [];
  const m = new MenuModel([
    { Label: 'a', OnConfirm: () => log.push('a') },
    { Label: 'b', OnConfirm: () => log.push('b'), OnAdjust: (d) => log.push('adj' + d) }
  ]);
  m.Handle(press('Confirm'));
  m.Handle(press('Down'));
  m.Handle(press('Left'));
  m.Handle(press('Right'));
  m.Handle(press('Confirm'));
  m.Handle(press('Up'));
  assert.deepStrictEqual(log, ['a', 'adj-1', 'adj1', 'b']);
  assert.strictEqual(m.Index, 0);
});

test('a disabled item cannot be confirmed', () => {
  let hit = false;
  const m = new MenuModel([{ Label: 'a', Disabled: () => true, OnConfirm: () => { hit = true; } }]);
  m.Handle(press('Confirm'));
  assert.strictEqual(hit, false);
});

test('LabelOf resolves function labels', () => {
  const m = new MenuModel([{ Label: () => 'dyn' }, { Label: 'static' }]);
  assert.strictEqual(m.LabelOf(0), 'dyn');
  assert.strictEqual(m.LabelOf(1), 'static');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/settings.test.js tests/menu.test.js`
Expected: both FAIL with `Cannot find module`.

- [ ] **Step 3: Create `Game/Settings.js`**

```js
// Persistent user settings (volumes, integer scaling).

var SETTINGS_KEY = "pinablaster.settings.v1";
var DEFAULT_SETTINGS = { master: 0.8, sfx: 1.0, music: 0.6, integerScale: false };

function SanitizeSettings(raw)
{
	var out = {};

	for (var k in DEFAULT_SETTINGS)
		out[k] = DEFAULT_SETTINGS[k];

	if (!raw || typeof raw != "object")
		return out;

	["master", "sfx", "music"].forEach(function(key)
	{
		if (typeof raw[key] == "number" && isFinite(raw[key]))
			out[key] = Math.max(0, Math.min(1, raw[key]));
	});

	if (typeof raw.integerScale == "boolean")
		out.integerScale = raw.integerScale;

	return out;
}

function SettingsPrototype()
{
	this.Values = SanitizeSettings(null);

	this.Load = function()
	{
		try
		{
			var text = window.localStorage.getItem(SETTINGS_KEY);

			if (text)
				this.Values = SanitizeSettings(JSON.parse(text));
		}
		catch (e)
		{
			// Storage unavailable or corrupt: keep the defaults.
		}

		this.Apply();
	}

	this.Save = function()
	{
		try
		{
			window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.Values));
		}
		catch (e)
		{
			// Storage unavailable: settings last for this session only.
		}
	}

	this.Set = function(key, value)
	{
		var next = {};

		for (var k in this.Values)
			next[k] = this.Values[k];

		next[key] = value;
		this.Values = SanitizeSettings(next);

		this.Apply();
		this.Save();
	}

	this.Apply = function()
	{
		AudioMixer.SetVolume("master", this.Values.master);
		AudioMixer.SetVolume("sfx", this.Values.sfx);
		AudioMixer.SetVolume("music", this.Values.music);

		Display.IntegerScale = this.Values.integerScale;
		Display.Resize();
	}
}

if (typeof Engine !== 'undefined') var Settings = new SettingsPrototype();

if (typeof module !== 'undefined') module.exports = { SanitizeSettings: SanitizeSettings };
```

- [ ] **Step 4: Create `Game/Screens.js`**

```js
// Screen stack, menu model, and the pause / options screens.

function MenuModel(items)
{
	this.Items = items;
	this.Index = 0;

	function enabled(item)
	{
		return !item.Disabled || !item.Disabled();
	}

	this.Move = function(delta)
	{
		var n = this.Items.length;

		for (var i = 0; i < n; ++i)
		{
			this.Index = (this.Index + delta + n) % n;

			if (enabled(this.Items[this.Index]))
				return;
		}
	}

	this.LabelOf = function(i)
	{
		var l = this.Items[i].Label;
		return typeof l == "function" ? l() : l;
	}

	// m: the object returned by Input.Menu()
	this.Handle = function(m)
	{
		var item = this.Items[this.Index];

		if (m.Up) this.Move(-1);
		else if (m.Down) this.Move(1);
		else if (m.Left && item.OnAdjust) item.OnAdjust(-1);
		else if (m.Right && item.OnAdjust) item.OnAdjust(1);
		else if (m.Confirm && item.OnConfirm && enabled(item)) item.OnConfirm();
	}
}

function ScreenManagerPrototype()
{
	var stack = [];

	function sync()
	{
		var paused = false;

		for (var i = 0; i < stack.length; ++i)
			if (stack[i].PausesGame)
				paused = true;

		Engine.Paused = paused;
	}

	this.Current = function() { return stack.length ? stack[stack.length - 1] : null; }

	this.Push = function(screen) { stack.push(screen); sync(); }
	this.Pop = function() { stack.pop(); sync(); }
	this.Replace = function(screen) { stack.pop(); stack.push(screen); sync(); }
	this.Clear = function() { stack = []; sync(); }

	this.Update = function()
	{
		var top = this.Current();

		if (top)
			top.Update(Input.Menu());
	}

	this.Draw = function(ctx)
	{
		for (var i = 0; i < stack.length; ++i)
			stack[i].Draw(ctx);
	}

	// Outlined text. align: "left" | "center" | "right".
	this.Text = function(ctx, text, x, y, size, align, color)
	{
		ctx.textAlign = align || "left";
		ctx.textBaseline = "middle";
		ctx.font = "Bold " + size + "px Trebuchet MS";

		ctx.fillStyle = "#000000";
		ctx.fillText(text, x + 1, y + 1);
		ctx.fillText(text, x - 1, y - 1);
		ctx.fillText(text, x + 1, y - 1);
		ctx.fillText(text, x - 1, y + 1);

		ctx.fillStyle = color || "#FFFFFF";
		ctx.fillText(text, x, y);
		ctx.textAlign = "left";
	}

	this.Dim = function(ctx)
	{
		ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
		ctx.fillRect(0, 0, Display.VirtualWidth, Display.VirtualHeight);
	}

	this.DrawMenu = function(ctx, title, model, hint)
	{
		var cx = Display.VirtualWidth / 2;

		this.Text(ctx, title, cx, 70, 26, "center", "#FFD040");

		for (var i = 0; i < model.Items.length; ++i)
		{
			var selected = (i == model.Index);
			var label = model.LabelOf(i);

			this.Text(ctx, selected ? "> " + label + " <" : label, cx, 124 + i * 26, 15, "center", selected ? "#FFFFFF" : "#A0A0A0");
		}

		if (hint)
			this.Text(ctx, hint, cx, 306, 10, "center", "#C0C0C0");
	}
}

if (typeof Engine !== 'undefined') var Screens = new ScreenManagerPrototype();

function OptionsScreen()
{
	this.PausesGame = true;

	function volumeItem(label, key)
	{
		return {
			Label: function() { return label + ": " + Math.round(Settings.Values[key] * 100) + "%"; },
			OnAdjust: function(dir) { Settings.Set(key, Math.round((Settings.Values[key] + dir * 0.1) * 10) / 10); }
		};
	}

	var model = new MenuModel(
	[
		volumeItem("Master volume", "master"),
		volumeItem("Effects volume", "sfx"),
		volumeItem("Music volume", "music"),
		{
			Label: function() { return "Integer scaling: " + (Settings.Values.integerScale ? "On" : "Off"); },
			OnConfirm: function() { Settings.Set("integerScale", !Settings.Values.integerScale); },
			OnAdjust: function() { Settings.Set("integerScale", !Settings.Values.integerScale); }
		},
		{ Label: "Fullscreen (F)", OnConfirm: function() { Display.ToggleFullscreen(); } },
		{ Label: "Back", OnConfirm: function() { Screens.Pop(); } }
	]);

	this.Update = function(m)
	{
		if (m.Back)
			Screens.Pop();
		else
			model.Handle(m);
	}

	this.Draw = function(ctx)
	{
		Screens.Dim(ctx);
		Screens.DrawMenu(ctx, "OPTIONS", model, "Up/Down select  -  Left/Right change  -  Esc back");
	}
}

function PauseScreen()
{
	this.PausesGame = true;

	var model = new MenuModel(
	[
		{ Label: "Resume", OnConfirm: function() { Screens.Pop(); } },
		{ Label: "Options", OnConfirm: function() { Screens.Push(new OptionsScreen()); } }
	]);

	this.Update = function(m)
	{
		if (m.Back)
			Screens.Pop();
		else
			model.Handle(m);
	}

	this.Draw = function(ctx)
	{
		Screens.Dim(ctx);
		Screens.DrawMenu(ctx, "PAUSED", model, "Esc / Start resume");
	}
}

if (typeof module !== 'undefined') module.exports = { MenuModel: MenuModel };
```

Note: `OptionsScreen` is drawn on top of `PauseScreen` (both stay on the stack), so `Screens.Draw` dims twice; that is intended and keeps the paused game visible behind the menu.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/`
Expected: all suites passing (settings 3, menu 5, plus the earlier ones).

- [ ] **Step 6: Hook into `Game/PiNaBlaster.js` and `index.html`**

`index.html`: add `<script src="Game/Settings.js"></script>` and `<script src="Game/Screens.js"></script>` before `Game/PiNaBlaster.js`.

In `PiNaBlaster`:

1. First statement of `Init`: `Settings.Load();`
2. At the end of `Init` add the auto-pause hooks:

```js
		var game = this;

		window.addEventListener("blur", function() { game.AutoPause(); });
		document.addEventListener("visibilitychange", function() { if (document.hidden) game.AutoPause(); });
```

3. Add the methods:

```js
	this.AutoPause = function()
	{
		if (!Screens.Current() && PlayerManager.Players.length > 0)
			Screens.Push(new PauseScreen());
	}

	this.WantsPause = function()
	{
		if (Input.Menu().Back)
			return true;

		for (var i = 0; i < PlayerManager.Players.length; ++i)
			if (Input.Player(PlayerManager.Players[i].Index).StartPressed)
				return true;

		return false;
	}

	// Once per animation frame, even while paused.
	this.FrameUpdate = function()
	{
		if (Screens.Current())
			Screens.Update();
		else if (this.WantsPause())
			Screens.Push(new PauseScreen());
	}
```

4. At the end of `this.Draw` (after the HUD / outro text, i.e. as the last statement of the function and also before the early `return`s) call `Screens.Draw(Engine.Context);`. The simplest way: rename the current `Draw` to `DrawGame` and add

```js
	this.Draw = function()
	{
		this.DrawGame();
		Screens.Draw(Engine.Context);
	}
```

- [ ] **Step 7: Verify in the browser**

Serve and open `http://localhost:8000/`.
Expected: press Escape: the game freezes (enemies stop, bombs stop ticking) and a dimmed `PAUSED` menu appears; Escape or Enter on `Resume` continues. Open `Options` from the pause menu: Left/Right change the volumes in 10% steps, "Integer scaling" toggles (with the window not 16:9, the canvas CSS size snaps to a whole multiple of 576x324), `Back` returns. Reload the page: volumes and integer-scaling are remembered; run `localStorage.removeItem("pinablaster.settings.v1")` and reload: defaults are back. Click on another window (browser loses focus): the game pauses by itself. In the console, simulate pad Start: `navigator.getGamepads = () => [{ index: 0, connected: true, axes: [0,0], buttons: Array.from({length:17}, (_, i) => ({ pressed: i == 9 })) }]`, confirm pause opens once (not repeatedly), then `delete navigator.getGamepads`. With `?debug&players=2` the pause also works from P2's keyboard? (P2 has no Start key; Escape works for everybody.) Run `node --test tests/` - all passing.

---

### Task 8: Title screen, lobby ("press fire to join"), start/quit flow

**Files:**
- Create: `Game/Lobby.js`, `tests/lobby.test.js`
- Modify: `Engine/AudioMixer.js` (`IsRunning`), `Game/Screens.js` (`PauseScreen(game)` quit item, disabled-item colour), `Game/PiNaBlaster.js` (`Mode`, `ShowTitle`, `StartGame`, `Init`, `PauseScreen(this)` calls), `index.html`

**Interfaces:**
- Consumes: `Screens`, `MenuModel`, `OptionsScreen`, `Input.Sources()`, `DefaultRoster`, `PLAYER_COLORS`, `Tint.GetSheet`, `Renderer.SpriteSheet`.
- Produces pure helpers (exported for tests):
  - `RosterFromSources(ids)` -> bindings: `"kb0"` -> `{Keyboard: 0, Pad: null}`, `"kb1"` -> `{Keyboard: 1, Pad: null}`, `"pad<n>"` -> `{Keyboard: null, Pad: n}`.
  - `SourceLabel(id)` -> `"Keyboard: arrows + Space"`, `"Keyboard: WASD + Shift"`, `"Gamepad <n+1>"`.
  - `MinPlayers(mode)` -> 1 for `"campaign"`, 2 for `"battle"`.
- Produces `TitleScreen(game)` and `LobbyScreen(game, mode)` (`mode` is `"campaign"` or `"battle"`).
- Produces `AudioMixer.IsRunning()`.
- Produces `PiNaBlaster.Mode` (`"campaign"` | `"battle"` | `null` on the title), `PiNaBlaster.ShowTitle()`, `PiNaBlaster.StartGame(mode, roster)`.
- Changes `PauseScreen` to `PauseScreen(game)` with a third item "Quit to title".

- [ ] **Step 1: Write the failing tests**

Create `tests/lobby.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { RosterFromSources, SourceLabel, MinPlayers } = require('../Game/Lobby.js');

test('RosterFromSources maps device ids to input bindings in join order', () => {
  assert.deepStrictEqual(RosterFromSources(['pad2', 'kb1', 'kb0']), [
    { Keyboard: null, Pad: 2 },
    { Keyboard: 1, Pad: null },
    { Keyboard: 0, Pad: null }
  ]);
});

test('SourceLabel describes each device', () => {
  assert.strictEqual(SourceLabel('kb0'), 'Keyboard: arrows + Space');
  assert.strictEqual(SourceLabel('kb1'), 'Keyboard: WASD + Shift');
  assert.strictEqual(SourceLabel('pad0'), 'Gamepad 1');
  assert.strictEqual(SourceLabel('pad3'), 'Gamepad 4');
});

test('MinPlayers: battle needs two', () => {
  assert.strictEqual(MinPlayers('campaign'), 1);
  assert.strictEqual(MinPlayers('battle'), 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/lobby.test.js`
Expected: FAIL with `Cannot find module '../Game/Lobby.js'`.

- [ ] **Step 3: Create `Game/Lobby.js`**

```js
// Title screen and the "press fire to join" lobby.

function RosterFromSources(ids)
{
	return ids.map(function(id)
	{
		if (id.indexOf("kb") == 0)
			return { Keyboard: parseInt(id.substr(2)), Pad: null };

		return { Keyboard: null, Pad: parseInt(id.substr(3)) };
	});
}

function SourceLabel(id)
{
	if (id == "kb0") return "Keyboard: arrows + Space";
	if (id == "kb1") return "Keyboard: WASD + Shift";

	return "Gamepad " + (parseInt(id.substr(3)) + 1);
}

function MinPlayers(mode)
{
	return mode == "battle" ? 2 : 1;
}

function TitleScreen(game)
{
	this.PausesGame = true;

	var model = new MenuModel(
	[
		{ Label: "Campaign", OnConfirm: function() { Screens.Replace(new LobbyScreen(game, "campaign")); } },
		{
			Label: "Battle",
			// Enabled automatically once the Battle module is loaded.
			Disabled: function() { return typeof BattleRules === "undefined"; },
			OnConfirm: function() { Screens.Replace(new LobbyScreen(game, "battle")); }
		},
		{ Label: "Options", OnConfirm: function() { Screens.Push(new OptionsScreen()); } }
	]);

	this.Update = function(m)
	{
		model.Handle(m);
	}

	this.Draw = function(ctx)
	{
		var cx = Display.VirtualWidth / 2;

		ctx.fillStyle = "#0b0b14";
		ctx.fillRect(0, 0, Display.VirtualWidth, Display.VirtualHeight);

		var ss = Renderer.SpriteSheet;

		if (ss && ss.IsLoaded)
		{
			for (var k = 0; k < 7; ++k)
				ss.DrawSpriteByIndex(ctx, cx - 7 * 14 + k * 28 + 4, 236, 67 + 20 * k);
		}

		Screens.DrawMenu(ctx, "PiN'a'Blaster", model, null);
		Screens.Text(ctx, "Dyna Blaster HTML5 clone made by PiN", cx, 94, 11, "center", "#808080");

		var hint = AudioMixer.IsRunning() ? "Arrows / D-pad + Fire" : "Press a key or click to enable sound";
		Screens.Text(ctx, hint, cx, 306, 10, "center", "#C0C0C0");
	}
}

function LobbyScreen(game, mode)
{
	this.PausesGame = true;

	var joined = [];

	function has(id) { return joined.indexOf(id) >= 0; }

	this.Update = function(m)
	{
		var sources = Input.Sources();
		var live = {};

		sources.forEach(function(s) { live[s.Id] = true; });
		joined = joined.filter(function(id) { return live[id]; });

		for (var i = 0; i < sources.length; ++i)
		{
			var id = sources[i].Id;
			var a = sources[i].Action;

			if (a.BackPressed)
			{
				if (has(id))
					joined.splice(joined.indexOf(id), 1);
				else
				{
					Screens.Replace(new TitleScreen(game));
					return;
				}
			}
			else if (a.BombPressed && !has(id) && joined.length < 4)
			{
				joined.push(id);
			}
			else if (a.StartPressed)
			{
				if (!has(id))
				{
					if (joined.length < 4)
						joined.push(id);
				}
				else if (joined.length >= MinPlayers(mode))
				{
					game.StartGame(mode, RosterFromSources(joined));
					return;
				}
			}
		}
	}

	this.Draw = function(ctx)
	{
		var cx = Display.VirtualWidth / 2;
		var ss = Renderer.SpriteSheet;

		ctx.fillStyle = "#0b0b14";
		ctx.fillRect(0, 0, Display.VirtualWidth, Display.VirtualHeight);

		Screens.Text(ctx, mode == "battle" ? "BATTLE" : "CAMPAIGN", cx, 36, 22, "center", "#FFD040");
		Screens.Text(ctx, "Who is playing?", cx, 62, 12, "center", "#C0C0C0");

		for (var i = 0; i < 4; ++i)
		{
			var y = 92 + i * 40;

			ctx.fillStyle = i < joined.length ? PLAYER_COLORS[i] : "#2a2a36";
			ctx.fillRect(cx - 150, y - 14, 300, 30);

			ctx.fillStyle = "#14141c";
			ctx.fillRect(cx - 148, y - 12, 296, 26);

			if (i < joined.length)
			{
				if (ss && ss.IsLoaded)
					(Tint.GetSheet(i) || ss).DrawSpriteByIndex(ctx, cx - 140, y - 8, 0);

				Screens.Text(ctx, "P" + (i + 1), cx - 108, y, 14, "left", PLAYER_COLORS[i]);
				Screens.Text(ctx, SourceLabel(joined[i]), cx - 70, y, 12, "left", "#FFFFFF");
			}
			else
			{
				Screens.Text(ctx, "Press Fire to join", cx, y, 12, "center", "#606060");
			}
		}

		var need = MinPlayers(mode);
		var ready = joined.length >= need;

		Screens.Text(ctx, ready ? "Press Start (Enter) to begin" : "Need " + need + " player" + (need > 1 ? "s" : "") + " to begin",
			cx, 276, 12, "center", ready ? "#80FF80" : "#C0C0C0");
		Screens.Text(ctx, "Fire = join   Start = begin   Esc / B = leave / back", cx, 306, 10, "center", "#C0C0C0");
	}
}

if (typeof module !== 'undefined')
	module.exports = { RosterFromSources: RosterFromSources, SourceLabel: SourceLabel, MinPlayers: MinPlayers };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/lobby.test.js`
Expected: 3 passing.

- [ ] **Step 5: Small supporting edits**

`Engine/AudioMixer.js`, add inside `AudioMixerPrototype` next to `IsReady`:

```js
	this.IsRunning = function() { return ctx != null && ctx.state == "running"; }
```

`Game/Screens.js`:
- In `DrawMenu`, replace the loop body's colour logic so disabled items are dimmed:

```js
		for (var i = 0; i < model.Items.length; ++i)
		{
			var item = model.Items[i];
			var disabled = item.Disabled && item.Disabled();
			var selected = (i == model.Index);
			var label = model.LabelOf(i);
			var color = disabled ? "#505050" : (selected ? "#FFFFFF" : "#A0A0A0");

			this.Text(ctx, selected ? "> " + label + " <" : label, cx, 124 + i * 26, 15, "center", color);
		}
```

- Change `function PauseScreen()` to `function PauseScreen(game)` and add a third item:

```js
		{ Label: "Options", OnConfirm: function() { Screens.Push(new OptionsScreen()); } },
		{ Label: "Quit to title", OnConfirm: function() { game.ShowTitle(); } }
```

`index.html`: add `<script src="Game/Lobby.js"></script>` after `Game/Screens.js`.

- [ ] **Step 6: Game flow in `Game/PiNaBlaster.js`**

1. Add near the top fields: `this.Mode = null;`
2. In `Init`, replace everything from `var m = /[?&]players=(\d)/.exec(...)` through `this.SetLevel(6);` (the Task 6 roster lines and the old start-level call) with:

```js
		// A level has to exist so the world is valid behind the title screen.
		this.SetLevel(6);

		var m = /[?&]players=(\d)/.exec(window.location.search);

		if (Engine.Debug && m)
			this.StartGame("campaign", DefaultRoster(Math.max(1, Math.min(4, parseInt(m[1])))));
		else
			this.ShowTitle();
```

   (the blur / visibility listeners from Task 7 stay after this block).
3. Add the methods:

```js
	this.ShowTitle = function()
	{
		this.Mode = null;

		Engine.StopSound("audioOutro");
		PlayerManager.Reset();

		Screens.Clear();
		Screens.Push(new TitleScreen(this));
	}

	// mode: "campaign" | "battle"; roster: array of input bindings (one per player)
	this.StartGame = function(mode, roster)
	{
		this.Mode = mode;
		this.Roster = roster;
		this.ApplyRoster();

		Screens.Clear();

		// The campaign starts at the first level (the original build started on level 7 by mistake).
		this.SetLevel(0);
	}
```

4. In `AutoPause` and `FrameUpdate` change `new PauseScreen()` to `new PauseScreen(this)`.
5. `AutoPause` must not open over the title: it already checks `!Screens.Current()`; `ShowTitle` resets the player list so the check `PlayerManager.Players.length > 0` is also false.

- [ ] **Step 7: Verify in the browser**

Serve and open `http://localhost:8000/` (no query).
Expected: the title appears (logo, seven enemy sprites, menu: Campaign / Battle greyed out / Options); the cursor skips the greyed `Battle`; Enter on `Campaign` opens the lobby; Space joins `P1  Keyboard: arrows + Space`, Left Shift joins `P2  Keyboard: WASD + Shift` (P2 shows with the blue sprite), `Enter` begins; the game starts on level 1 with two players. Esc -> pause -> `Quit to title` returns to the title with no pause overlay left behind. Simulate a pad in the lobby: `navigator.getGamepads = () => [{ index: 0, connected: true, axes: [0,0], buttons: Array.from({length:17}, (_, i) => ({ pressed: i == 0 })) }]` - a `Gamepad 1` slot appears once (not repeatedly); `delete navigator.getGamepads` makes it vanish again. `?debug&players=3` skips the title and starts three players directly. Run `node --test tests/` - all passing.

---

### Task 9: Co-op campaign rules (game over, ghosts, win and result screens)

**Files:**
- Modify: `Game/Players.js` (`AllOut`), `tests/players.test.js`, `Game/Screens.js` (`ResultScreen`, `DrawMenu` top offset), `Game/Player.js` (dead players are not solid), `Game/PiNaBlaster.js` (game-over detection, campaign-only level advance, retry, win screen on the outro level)

**Interfaces:**
- Produces pure `AllOut(players)` -> `true` when the list is non-empty and every player is dead with no lives left (`IsDead && Lifes <= 0`). Exported from `Game/Players.js`.
- Produces `ResultScreen(title, lines, items)`: dimmed overlay with a title, informational `lines` (array of strings) and a menu (`items` as for `MenuModel`). `PausesGame` is true.
- Produces `Screens.DrawMenu(ctx, title, model, hint, top)` (new optional `top`, default 124 = y of the first item).
- Produces `PiNaBlaster.ShowGameOver()`.

- [ ] **Step 1: Write the failing test**

Append to `tests/players.test.js` (and add `AllOut` to its first `require`):

```js
test('AllOut: only when everyone is dead with no lives', () => {
  const dead0 = { IsDead: true, Lifes: 0 }, dead1 = { IsDead: true, Lifes: 1 }, alive = { IsDead: false, Lifes: 0 };
  assert.strictEqual(AllOut([dead0, dead0]), true);
  assert.strictEqual(AllOut([dead0, dead1]), false); // can still respawn
  assert.strictEqual(AllOut([dead0, alive]), false);
  assert.strictEqual(AllOut([]), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/players.test.js`
Expected: FAIL (`AllOut is not a function`).

- [ ] **Step 3: Implement `AllOut`**

In `Game/Players.js`, add before `function PlayerManagerPrototype()`:

```js
// True when nobody can play on: everyone is dead and has no life left to respawn with.
function AllOut(players)
{
	if (players.length == 0)
		return false;

	for (var i = 0; i < players.length; ++i)
		if (!players[i].IsDead || players[i].Lifes > 0)
			return false;

	return true;
}
```

and add `AllOut: AllOut` to `module.exports`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/players.test.js`
Expected: all passing (10).

- [ ] **Step 5: `ResultScreen` and menu offset in `Game/Screens.js`**

Change the `DrawMenu` signature to `this.DrawMenu = function(ctx, title, model, hint, top)`, add `top = top || 124;` as its first statement, and use `top + i * 26` for each item's y instead of `124 + i * 26`.

Add after `PauseScreen`:

```js
function ResultScreen(title, lines, items)
{
	this.PausesGame = true;

	var model = new MenuModel(items);

	this.Update = function(m)
	{
		model.Handle(m);
	}

	this.Draw = function(ctx)
	{
		Screens.Dim(ctx);

		for (var i = 0; i < lines.length; ++i)
			Screens.Text(ctx, lines[i], Display.VirtualWidth / 2, 104 + i * 16, 12, "center", "#C0C0C0");

		Screens.DrawMenu(ctx, title, model, null, 104 + lines.length * 16 + 28);
	}
}
```

- [ ] **Step 6: Dead players are ghosts (`Game/Player.js`)**

In `GetHit`, in the death branch (the `else` after `if (this.Hearts > 0)`), add `this.Solid = false;` next to `this.IsDead = true;`. A dead player no longer blocks corridors for the rest of the team. (Enemies still hurt living players through `OnTouch`, which does not look at `Solid`.)

- [ ] **Step 7: Game rules in `Game/PiNaBlaster.js`**

1. Add field `this.GameOverTimer = 0.0;` and, at the start of `SetLevel` after `this.LevelNumber = level;`, `this.GameOverTimer = 0.0;`.
2. In `RespawnPlayer(p)`, add `p.Solid = true;`.
3. Replace the end of `GameTick` (everything after the per-player `for` loop) with:

```js
		if (this.Mode == "campaign")
		{
			// Everyone is out: give the death animation a moment, then offer a retry.
			if (AllOut(players))
			{
				this.GameOverTimer += delta;

				if (this.GameOverTimer > 1.5)
				{
					this.GameOverTimer = 0.0;
					this.ShowGameOver();
					return;
				}
			}
			else
				this.GameOverTimer = 0.0;

			if (GameEntityManager.GetNumEntitiesByType("Enemy") == 0)
				this.SetLevel(this.LevelNumber + 1);
		}
```

4. Add:

```js
	this.ShowGameOver = function()
	{
		var game = this;

		Screens.Push(new ResultScreen("GAME OVER", ["Everyone is out of lives."],
		[
			{ Label: "Retry level", OnConfirm: function() { Screens.Clear(); game.SetLevel(game.LevelNumber); } },
			{ Label: "Quit to title", OnConfirm: function() { game.ShowTitle(); } }
		]));
	}
```

5. Proper end state for the campaign. Add fields `this.WinTimer = 0.0; this.WinShown = false;` (reset both at the start of `SetLevel`, next to `GameOverTimer`). Level 7 is the outro scene (music keeps playing, the old "You won" text stays); replace the empty `PF2012Tick` body with:

```js
	this.PF2012Tick = function(delta)
	{
		this.WinTimer += delta;

		if (this.WinTimer > 4.0 && !this.WinShown && !Screens.Current())
		{
			this.WinShown = true;

			var game = this;

			Screens.Push(new ResultScreen("YOU WON!", ["Thanks for playing!"],
			[
				{ Label: "Play again", OnConfirm: function() { game.StartGame("campaign", game.Roster); } },
				{ Label: "Quit to title", OnConfirm: function() { game.ShowTitle(); } }
			]));
		}
	}
```

- [ ] **Step 8: Verify**

Run `node --test tests/`. Serve; `?debug&players=2`. Let P1 die three... faster: in the console set `PlayerManager.Players[0].Lifes = 0; PlayerManager.Players[1].Lifes = 0;` then stand in your own bomb blast until both are dead (or call `PlayerManager.Players.forEach(p => { p.Hearts = 0; p.GetHit(); })`).
Expected: both ghosts stay on screen about 1.5 s, then `GAME OVER` appears with `Retry level` / `Quit to title`; `Retry level` restarts the same level with fresh players; `Quit to title` shows the title. With only P2 dead (no lives) and P1 alive: P1 can walk straight through P2's spot (ghost), and no game-over appears. Clear a level in 2-player mode: both players move to the next level together. Debug key `8` (level 8, the outro): the outro music plays, and after about 4 s `YOU WON!` appears over the outro scene with `Play again` (restarts the campaign at level 1) and `Quit to title`; the music stops when either is chosen (`SetLevel` / `ShowTitle` stop it).

---

### Task 10: Battle mode (arena, rounds, match, sudden death)

**Files:**
- Create: `Game/Battle.js`, `tests/battle.test.js`
- Modify: `Game/Hud.js` (wins and clock), `Game/PiNaBlaster.js` (battle level, flow, sudden death), `index.html`

**Interfaces:**
- Consumes: `Screens`, `ResultScreen`, `PlayerManager`, `GameWorld.SetBlock`, `Explosion`, `PLAYER_COLORS`.
- Produces pure helpers (exported for tests):
  - `BuildBattleArena()` -> array of 19 strings of 27 characters. Border `0` with `2` corners, indestructible `0` pillars on every interior tile where x and y are both even, destructible `1` bricks on all other interior tiles except three free tiles at each corner (the corner tile plus its horizontal and vertical neighbours). The map is mirror-symmetric on both axes and contains no `P` marker (the game adds it).
  - `SpiralOrder(w, h)` -> `[{x, y}]`: every interior tile (`1..w-2`, `1..h-2`) exactly once, clockwise ring by ring starting at (1,1).
  - `RoundOutcome(players)` -> `null` while more than one player is alive, `{winner: index}` when exactly one is alive, `{winner: -1}` (draw) when none is. `players` have `Index` and `IsDead`.
  - `BattleRules(playerCount, target)` with `Wins`, `Round`, `Target` (default 3) and `RecordRound(winner)` -> match winner index or `-1`. A draw (`-1`) awards nothing. `Round` increases only if the match goes on.
- Produces constants `BATTLE_SUDDEN_DEATH_AT = 120` (seconds) and `BATTLE_SUDDEN_STEP = 0.12` (seconds per closed tile).
- Produces `Hud.Draw(ctx, players, title, keyFlags, blink, extra)` where optional `extra = { wins: [n per player], clock: "m:ss" }`: when `wins` is present the cards show `Wins: n` instead of lives and hearts, and `clock` is drawn in the top-right band.
- Produces `PiNaBlaster.Battle` (a `BattleRules`), `StartRound()`, `BattleTick(delta)`, `CloseNextCell()`, `FinishRound()`.
- Battle level id is the string `"battle"` (`SetLevel("battle")`, `LevelNumber == "battle"`).

- [ ] **Step 1: Write the failing tests**

Create `tests/battle.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { BuildBattleArena, SpiralOrder, RoundOutcome, BattleRules } = require('../Game/Battle.js');

test('arena is 27x19 and symmetric on both axes', () => {
  const a = BuildBattleArena();
  assert.strictEqual(a.length, 19);
  a.forEach(r => assert.strictEqual(r.length, 27));
  for (let y = 0; y < 19; y++)
    for (let x = 0; x < 27; x++) {
      assert.strictEqual(a[y][x], a[y][26 - x], 'x mirror ' + x + ',' + y);
      assert.strictEqual(a[y][x], a[18 - y][x], 'y mirror ' + x + ',' + y);
    }
});

test('arena border, pillars, bricks and corner safe zones', () => {
  const a = BuildBattleArena();
  assert.strictEqual(a[0][0], '2');
  assert.strictEqual(a[0][5], '0');
  assert.strictEqual(a[2][2], '0');   // pillar (even, even)
  assert.strictEqual(a[1][3], '1');   // brick
  assert.strictEqual(a[9][13], '1');  // centre is a brick
  [[1, 1, 1, 1], [25, 1, -1, 1], [1, 17, 1, -1], [25, 17, -1, -1]].forEach(([cx, cy, dx, dy]) => {
    assert.strictEqual(a[cy][cx], ' ');
    assert.strictEqual(a[cy][cx + dx], ' ');
    assert.strictEqual(a[cy + dy][cx], ' ');
  });
  assert.ok(a.join('').indexOf('P') < 0);
});

test('SpiralOrder walks the interior ring by ring', () => {
  const s = SpiralOrder(5, 5);
  assert.strictEqual(s.length, 9);
  assert.deepStrictEqual(s.slice(0, 9).map(c => c.x + ',' + c.y),
    ['1,1', '2,1', '3,1', '3,2', '3,3', '2,3', '1,3', '1,2', '2,2']);
});

test('SpiralOrder covers every interior tile of the real arena once', () => {
  const s = SpiralOrder(27, 19);
  assert.strictEqual(s.length, 25 * 17);
  assert.strictEqual(new Set(s.map(c => c.x + ',' + c.y)).size, 25 * 17);
});

test('RoundOutcome', () => {
  const P = (i, d) => ({ Index: i, IsDead: d });
  assert.strictEqual(RoundOutcome([P(0, false), P(1, false), P(2, true)]), null);
  assert.deepStrictEqual(RoundOutcome([P(0, true), P(1, false), P(2, true)]), { winner: 1 });
  assert.deepStrictEqual(RoundOutcome([P(0, true), P(1, true)]), { winner: -1 });
});

test('BattleRules: first to 3 wins, draws award nothing', () => {
  const b = new BattleRules(3, 3);
  assert.strictEqual(b.Round, 1);
  assert.strictEqual(b.RecordRound(1), -1);
  assert.strictEqual(b.Round, 2);
  assert.strictEqual(b.RecordRound(-1), -1);
  assert.deepStrictEqual(b.Wins, [0, 1, 0]);
  assert.strictEqual(b.Round, 3);
  b.RecordRound(1);
  assert.strictEqual(b.RecordRound(1), 1);
  assert.deepStrictEqual(b.Wins, [0, 3, 0]);
  assert.strictEqual(b.Round, 4); // not advanced once the match is won
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/battle.test.js`
Expected: FAIL with `Cannot find module '../Game/Battle.js'`.

- [ ] **Step 3: Create `Game/Battle.js`**

```js
// Battle mode: arena map, round/match rules, sudden-death order.

var BATTLE_SUDDEN_DEATH_AT = 120.0;
var BATTLE_SUDDEN_STEP = 0.12;

function BuildBattleArena()
{
	var W = 27, H = 19;
	var rows = [];
	var safe = {};

	// corner tile, plus its horizontal and vertical neighbour
	[[1, 1, 1, 1], [25, 1, -1, 1], [1, 17, 1, -1], [25, 17, -1, -1]].forEach(function(c)
	{
		safe[c[0] + "," + c[1]] = true;
		safe[(c[0] + c[2]) + "," + c[1]] = true;
		safe[c[0] + "," + (c[1] + c[3])] = true;
	});

	for (var y = 0; y < H; ++y)
	{
		var row = "";

		for (var x = 0; x < W; ++x)
		{
			var ch;

			if (x == 0 || y == 0 || x == W - 1 || y == H - 1)
				ch = ((x == 0 || x == W - 1) && (y == 0 || y == H - 1)) ? "2" : "0";
			else if (x % 2 == 0 && y % 2 == 0)
				ch = "0";
			else if (safe[x + "," + y])
				ch = " ";
			else
				ch = "1";

			row += ch;
		}

		rows.push(row);
	}

	return rows;
}

// Interior tiles, clockwise ring by ring, starting at the top-left.
function SpiralOrder(w, h)
{
	var cells = [];
	var x0 = 1, y0 = 1, x1 = w - 2, y1 = h - 2;

	while (x0 <= x1 && y0 <= y1)
	{
		for (var x = x0; x <= x1; ++x) cells.push({ x: x, y: y0 });
		for (var y = y0 + 1; y <= y1; ++y) cells.push({ x: x1, y: y });

		if (y1 > y0)
			for (var x = x1 - 1; x >= x0; --x) cells.push({ x: x, y: y1 });

		if (x1 > x0)
			for (var y = y1 - 1; y > y0; --y) cells.push({ x: x0, y: y });

		++x0; ++y0; --x1; --y1;
	}

	return cells;
}

function RoundOutcome(players)
{
	var alive = players.filter(function(p) { return !p.IsDead; });

	if (alive.length > 1)
		return null;

	return { winner: alive.length == 1 ? alive[0].Index : -1 };
}

function BattleRules(playerCount, target)
{
	this.Wins = [];

	for (var i = 0; i < playerCount; ++i)
		this.Wins.push(0);

	this.Round = 1;
	this.Target = target || 3;

	// Returns the match winner's index, or -1 when the match goes on.
	this.RecordRound = function(winner)
	{
		if (winner >= 0)
			++this.Wins[winner];

		if (winner >= 0 && this.Wins[winner] >= this.Target)
			return winner;

		++this.Round;

		return -1;
	}
}

if (typeof module !== 'undefined')
	module.exports = { BuildBattleArena: BuildBattleArena, SpiralOrder: SpiralOrder, RoundOutcome: RoundOutcome, BattleRules: BattleRules };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/battle.test.js`
Expected: 6 passing. (SpiralOrder trace for 5x5: top row (1,1),(2,1),(3,1); right column (3,2),(3,3); bottom row (2,3),(1,3); left column (1,2); next ring (2,2).)

- [ ] **Step 5: HUD wins and clock (`Game/Hud.js`)**

1. Change the signature to `this.DrawCard = function(ctx, p, label, color, x, y, blink, wins)` and replace the "Lifes" and "Hearts" blocks (everything from `// Lifes` up to and including the `ry += PITCH;` that follows the hearts) with:

```js
		if (wins !== undefined)
		{
			// Battle: no lives or hearts, just the round wins
			this.Text(ctx, "Wins: " + wins, x + 2, ry + 8);
			ry += PITCH;
		}
		else
		{
			// Lifes
			ss.DrawSpriteByIndex(ctx, x, ry, 194);
			this.Text(ctx, "x" + p.Lifes.toString(), x + 12, ry + 12);
			ry += PITCH;

			// Hearts
			if (p.Hearts > 0 || p.InvulnerableTime > 0.0 || (blink && !p.IsDead))
			{
				for (var i = 0; i < 3; ++i)
					ss.DrawSpriteByIndex(ctx, x + 3 + i * 7, ry, 198);
			}

			for (var i = 0; i < p.Hearts; ++i)
				ss.DrawSpriteByIndex(ctx, x + 3 + i * 7, ry, 178);

			if (p.InvulnerableTime > 0.0 && blink && p.Hearts < 3)
				ss.DrawSpriteByIndex(ctx, x + 3 + p.Hearts * 7, ry, 178);

			ry += PITCH;
		}
```

2. Change `this.Draw = function(ctx, players, title, keyFlags, blink)` to take `extra` as the sixth parameter, draw the clock, and pass the wins through:

```js
	this.Draw = function(ctx, players, title, keyFlags, blink, extra)
```

   Inside, after the key-icon loop add `if (extra && extra.clock) this.Text(ctx, extra.clock, rightX + 3, 12);`, and change the card call to `this.DrawCard(ctx, players[s], "P" + (s + 1), PLAYER_COLORS[s], x, y, blink, extra && extra.wins ? extra.wins[s] : undefined);`.

- [ ] **Step 6: Battle flow in `Game/PiNaBlaster.js` and `index.html`**

`index.html`: add `<script src="Game/Battle.js"></script>` after `Game/Lobby.js` (this also enables the title-screen `Battle` item, which checks `typeof BattleRules`).

In `PiNaBlaster`:

1. Fields: `this.Battle = null; this.BattleTime = 0.0; this.SuddenTimer = 0.0; this.SuddenOrder = null; this.SuddenIndex = 0; this.RoundOver = false; this.RoundDelay = 0.0; this.RoundWinner = -1;`
2. In `SetLevel`'s `switch`, add before `default`... (as a normal case at the end of the switch, after `case 7`):

```js
			case "battle":
			{
				var arena = BuildBattleArena();
				arena[1] = arena[1].setCharAt(1, "P");
				GameWorld.Walls = arena;
			}
			break;
```

3. Replace `StartGame` with:

```js
	this.StartGame = function(mode, roster)
	{
		this.Mode = mode;
		this.Roster = roster;
		this.ApplyRoster();

		Screens.Clear();

		if (mode == "battle")
		{
			this.Battle = new BattleRules(roster.length, 3);
			this.StartRound();
		}
		else
		{
			// The campaign starts at the first level (the original build started on level 7 by mistake).
			this.SetLevel(0);
		}
	}

	this.StartRound = function()
	{
		Screens.Clear();

		this.BattleTime = 0.0;
		this.SuddenTimer = 0.0;
		this.SuddenOrder = null;
		this.SuddenIndex = 0;
		this.RoundOver = false;
		this.RoundDelay = 0.0;
		this.RoundWinner = -1;

		this.SetLevel("battle");
	}
```

4. In `CreatePlayers`, after `p.Height = 17;` add:

```js
			// Battle: one hit kills, no respawns, short spawn protection
			if (this.Mode == "battle")
			{
				p.Hearts = 0;
				p.Lifes = 0;
				p.InvulnerableTime = 1.0;
			}
```

5. In `GameTick`, after the campaign `if (this.Mode == "campaign") { ... }` block add `else if (this.Mode == "battle") this.BattleTick(delta);`.
6. Add the battle methods:

```js
	this.BattleTick = function(delta)
	{
		this.BattleTime += delta;

		if (this.BattleTime > BATTLE_SUDDEN_DEATH_AT && !this.RoundOver)
		{
			this.SuddenTimer += delta;

			while (this.SuddenTimer >= BATTLE_SUDDEN_STEP)
			{
				this.SuddenTimer -= BATTLE_SUDDEN_STEP;
				this.CloseNextCell();
			}
		}

		if (!this.RoundOver)
		{
			var outcome = RoundOutcome(PlayerManager.Players);

			if (outcome)
			{
				this.RoundOver = true;
				this.RoundDelay = 1.5;
				this.RoundWinner = outcome.winner;
			}
		}
		else
		{
			this.RoundDelay -= delta;

			if (this.RoundDelay <= 0.0)
				this.FinishRound();
		}
	}

	// Sudden death: the next arena tile (spiral from the outside in) becomes a wall and blasts whatever stands on it.
	this.CloseNextCell = function()
	{
		if (!this.SuddenOrder)
			this.SuddenOrder = SpiralOrder(GameWorld.WorldWidth, GameWorld.WorldHeight);

		if (this.SuddenIndex >= this.SuddenOrder.length)
			return;

		var c = this.SuddenOrder[this.SuddenIndex++];
		var x = c.x * GameWorld.BlockWidth;
		var y = c.y * GameWorld.BlockHeight;

		GameWorld.SetBlock(x, y, "0");

		var exp = new Explosion();
		exp.X = x;
		exp.Y = y;
		exp.Owner = { Type: "SuddenDeath" };
		exp.Sprite.Frames = [140, 141, 142, 143]; // the "cross" blast frames (Explosion's default frames are not blast sprites)
	}

	this.FinishRound = function()
	{
		var game = this;
		var winner = this.RoundWinner;
		var matchWinner = this.Battle.RecordRound(winner);

		var score = this.Battle.Wins.map(function(w, i) { return "P" + (i + 1) + ": " + w; }).join("    ");

		if (matchWinner >= 0)
		{
			Screens.Push(new ResultScreen("P" + (matchWinner + 1) + " WINS THE MATCH!", [score],
			[
				{ Label: "Rematch", OnConfirm: function() { game.StartGame("battle", game.Roster); } },
				{ Label: "Quit to title", OnConfirm: function() { game.ShowTitle(); } }
			]));
		}
		else
		{
			Screens.Push(new ResultScreen(winner >= 0 ? "P" + (winner + 1) + " WINS THE ROUND" : "DRAW", [score],
			[
				{ Label: "Next round", OnConfirm: function() { game.StartRound(); } },
				{ Label: "Quit to title", OnConfirm: function() { game.ShowTitle(); } }
			]));
		}
	}
```

7. Replace `DrawHud` with:

```js
	this.DrawHud = function()
	{
		var title, extra;

		if (this.Mode == "battle")
		{
			var left = Math.max(0, Math.ceil(BATTLE_SUDDEN_DEATH_AT - this.BattleTime));
			var sudden = this.BattleTime > BATTLE_SUDDEN_DEATH_AT;

			title = "ROUND " + this.Battle.Round;
			extra = { wins: this.Battle.Wins, clock: sudden ? (this.Blinker > 1.0 ? "SUDDEN" : "") : Math.floor(left / 60) + ":" + ("0" + (left % 60)).slice(-2) };
		}
		else
			title = "LEVEL " + (this.LevelNumber + 1);

		Hud.Draw(Engine.Context, PlayerManager.Players, title, PlayerManager.KeyFlags, this.Blinker > 1.0, extra);
	}
```

- [ ] **Step 7: Verify**

Run `node --test tests/` (all passing). Serve and open the game: on the title the `Battle` item is now enabled. `Battle` -> lobby shows "Need 2 players to begin"; join two (Space, Left Shift), press Enter.
Expected: a symmetric brick arena with P1 top-left and P2 top-right (3 and 4 players fill the other corners), cards show `Wins: 0` and the right band shows a `1:59` countdown. Blow up bricks: power-ups appear. A bomb kills in one hit and the dead player does not respawn. When one player is left alive, after ~1.5 s `P1 WINS THE ROUND` appears with the score; `Next round` rebuilds the arena with `ROUND 2`. Win 3 rounds: `P? WINS THE MATCH!` with `Rematch` / `Quit to title`. Both players dying in the same blast gives `DRAW` and no win. To check sudden death without waiting: in the console set `game = Engine.Application; game.BattleTime = 119`, wait 2 s: the band shows blinking `SUDDEN`, wall tiles appear one after another from the top-left going clockwise inwards, each blasting anything on it, and a player standing on the closing ring dies. Pause (Esc) mid-round freezes the countdown; `Quit to title` leaves no leftover state: starting `Campaign` afterwards works normally.

---

### Task 11: Bug sweep, startup error screen, README, final verification

**Files:**
- Create: `tests/utils.test.js`, `tests/page.test.js`, `README.md`
- Modify: `Library/Utils.js`, `Main.js`, `style.css`, `Game/Lobby.js` (sound-unavailable hint), `Game/Bomb.js` (owner guard)

**Interfaces:**
- Produces `ShowFatalError(message)` in `Main.js` (replaces the `stage` content with a readable error).
- `Library/Utils.js` keeps the helpers `Array.prototype.contains/remove` and `String.prototype.setCharAt`, defined non-enumerable, and no longer replaces the native `Array.prototype.indexOf`.

- [ ] **Step 1: Write the failing tests**

Create `tests/utils.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');

test('Utils helpers work and do not pollute for..in', () => {
  const nativeIndexOf = Array.prototype.indexOf;
  require('../Library/Utils.js');

  assert.strictEqual(Array.prototype.indexOf, nativeIndexOf, 'native indexOf must stay');

  const a = [1, 2, 3];
  assert.strictEqual(a.contains(2), true);
  assert.strictEqual(a.contains(9), false);
  assert.strictEqual(a.remove(2), true);
  assert.strictEqual(a.remove(2), false);
  assert.deepStrictEqual(a, [1, 3]);
  assert.strictEqual('abc'.setCharAt(1, 'X'), 'aXc');
  assert.strictEqual('abc'.setCharAt(9, 'X'), 'abc');

  const keys = [];
  for (const k in [5, 6]) keys.push(k);
  assert.deepStrictEqual(keys, ['0', '1']);
});

test('remove uses strict equality (no "1" == 1 surprises)', () => {
  require('../Library/Utils.js');
  const a = [1, '1'];
  a.remove('1');
  assert.deepStrictEqual(a, [1]);
});
```

Create `tests/page.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = Array.from(html.matchAll(/<script src="([^"]+)"/g)).map(m => m[1]);

test('every referenced script exists and appears once', () => {
  scripts.forEach(s => assert.ok(fs.existsSync(path.join(root, s)), 'missing ' + s));
  assert.strictEqual(new Set(scripts).size, scripts.length);
});

test('no jQuery and no <audio> tags remain', () => {
  assert.ok(!scripts.some(s => /jquery/i.test(s)));
  assert.ok(!/<audio/i.test(html));
});

test('load order: constructors that need earlier files', () => {
  const at = (s) => { const i = scripts.indexOf(s); assert.ok(i >= 0, s + ' not loaded'); return i; };
  const engine = at('Engine/Engine.js');
  ['Engine/Renderer.js', 'Engine/Display.js', 'Engine/GameWorld.js', 'Engine/GameEntityManager.js'].forEach(s => assert.ok(at(s) > engine, s + ' must load after Engine.js'));
  assert.ok(at('Library/Utils.js') < engine);
  assert.ok(at('Engine/Loop.js') < engine);
  assert.ok(at('Engine/GameEntity.js') < at('Game/Player.js'));
  assert.ok(at('Game/Players.js') < at('Game/Player.js'));
  assert.ok(at('Game/Screens.js') < at('Game/Lobby.js'));
  assert.ok(at('Game/PiNaBlaster.js') < at('Main.js'));
});

test('canvas is the 16:9 virtual size', () => {
  assert.ok(/<canvas id="mainCanvas" width="576" height="324"/.test(html));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/utils.test.js tests/page.test.js`
Expected: `utils.test.js` fails (`native indexOf must stay`, because `Utils.js` overrides it); `page.test.js` should already pass if Tasks 1-10 were done as written (if it fails, the message names the script that is missing or out of order; fix `index.html` order).

- [ ] **Step 3: Rewrite `Library/Utils.js`**

```js
////////////////////////////////////////////////////////////////////////////////
//
//  Array prototype enhancements (non-enumerable, native indexOf is kept)
//
////////////////////////////////////////////////////////////////////////////////
Object.defineProperty(Array.prototype, "contains",
{
	value: function(obj)
	{
		return this.indexOf(obj) >= 0;
	},
	writable: true,
	configurable: true
});

Object.defineProperty(Array.prototype, "remove",
{
	value: function(obj)
	{
		var index = this.indexOf(obj);
		if (index < 0) return false;

		this.splice(index, 1);

		return true;
	},
	writable: true,
	configurable: true
});

////////////////////////////////////////////////////////////////////////////////
//
//  String prototype enhancements 
//
////////////////////////////////////////////////////////////////////////////////
Object.defineProperty(String.prototype, "setCharAt",
{
	value: function(index, chr)
	{
		if (index > this.length - 1) return this;

		return this.substr(0, index) + chr + this.substr(index + 1);
	},
	writable: true,
	configurable: true
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: every suite passes.

- [ ] **Step 5: Startup error screen (`Main.js`, `style.css`)**

Replace `Main.js`:

```js
function ShowFatalError(message)
{
	var stage = document.getElementById("stage");

	stage.innerHTML = '<div id="fatal"><h1>PiN\'a\'Blaster could not start</h1><p></p></div>';
	stage.querySelector("p").textContent = message;
}

document.addEventListener("DOMContentLoaded", function()
{
	var ok = false;

	try
	{
		ok = Engine.Run(document.getElementById("mainCanvas"), new PiNaBlaster(), 10);
	}
	catch (e)
	{
		ShowFatalError("Startup error: " + e.message);
		return;
	}

	if (!ok)
		ShowFatalError("The engine could not be initialized (is the canvas 2D context available?).");
});
```

Append to `style.css`:

```css
#fatal
{
	max-width: 80vw;
	text-align: center;
	color: #FF6A6A;
}

#fatal p
{
	color: #C0C0C0;
}
```

Check by temporarily making `Engine.Run` fail: in the browser console on a fresh load run `ShowFatalError("test message")` and confirm the red message replaces the canvas.

- [ ] **Step 6: Small robustness fixes**

`Game/Bomb.js`, in `Explode`, change `if (this.Owner.Type == "Player")` to `if (this.Owner && this.Owner.Type == "Player")`.

`Game/Lobby.js`, in `TitleScreen.Draw`, replace the `var hint = ...` line with:

```js
		var hint = !AudioMixer.IsReady() ? "Sound is not available in this browser"
			: (AudioMixer.IsRunning() ? "Arrows / D-pad + Fire" : "Press a key or click to enable sound");
```

- [ ] **Step 7: Create `README.md`**

````markdown
# PiN'a'Blaster

A Dyna Blaster style HTML5 game: an 8-level campaign (enemies, keys and doors, ice blocks, magic carpets) plus a Battle mode. 1-4 players on one screen, keyboard and gamepads.

## Run

The game loads its sounds with `fetch`, so open it through a web server, not from `file://`:

```bash
python -m http.server 8000
```

then browse to <http://localhost:8000/>.

## Controls

| | Move | Bomb | Menu |
|---|---|---|---|
| Player 1 (keyboard) | Arrow keys | Space | Enter = start / confirm, Esc = back / pause |
| Player 2 (keyboard) | W A S D | Left Shift | |
| Gamepad (any, up to 4) | D-pad or left stick | A or X | Start = start / pause, B or Select = back |

`F` toggles fullscreen (so does the button at the bottom-right of the page). In the lobby each player presses Fire on their device to join; Start begins the game. Battle needs 2+ players.

## Modes

- **Campaign** - 1-4 players, shared keys and doors. Everyone starts each level with fresh stats. The game is over when all players are dead with no lives left.
- **Battle** - last player standing wins a round, first to 3 round wins takes the match. One-hit kills, bombs hurt everybody including their owner. After 2 minutes the arena closes in from the outside.

## Options

Master / effects / music volume, integer scaling (crisp pixels at whole-number zoom) and fullscreen. Settings are remembered in `localStorage`.

## Developer notes

- `?debug` enables debug hotkeys: `E` edit mode (freezes entities), `D` danger overlay, `1`-`8` jump to a level, `R` revive player 1, `+` / `-` bombs and power. `?debug&players=N` skips the title and starts a campaign with N players.
- Tests (Node 22, no dependencies): `node --test tests/`
- The game runs on a fixed 10 ms simulation step inside `requestAnimationFrame`; the virtual canvas is 576x324 and is scaled to the window by CSS.
- `Library/jQuery.js` is no longer used or loaded.
````

- [ ] **Step 8: Full verification**

1. Syntax of every script: run `for f in Engine/*.js Game/*.js Library/*.js Main.js; do node --check "$f" || echo "FAILED $f"; done` (Git Bash) - no `FAILED` lines.
2. `node --test tests/` - all suites pass.
3. Serve and walk through, with the browser console open (no errors allowed at any point):
   - Title -> Campaign -> solo (Space, Enter): level 1 plays; arrow keys, Space; pickup power-ups; clear a level (debug `?debug` + key jump is fine) and see the next level load; die with no lives left: `GAME OVER` -> `Retry level`.
   - `?debug&players=4` plus simulated pads (see Task 6): four cards, no overlap; co-op key pickup opens the door for everyone.
   - Battle with 2 and 4 players: full match to 3 wins, a draw round, sudden death (`Engine.Application.BattleTime = 119`).
   - Pause: Esc, window blur, simulated pad Start; Options changes persist across reload.
   - Scaling: resize the browser pane to 1920x1080, 1000x1000, 375x667, 3440x1440; integer scaling on/off; fullscreen on/off with `F` and the button; the canvas stays sharp and 16:9.
   - Audio: bomb chains of 5+ bombs do not cut each other off and do not clip; music loops on the outro level (`?debug`, key `8`) and stops when leaving it.
4. Remaining manual checks that need real hardware (list them for the user, do not claim them verified): a physical gamepad (button mapping, stick feel, hot-plug), audible mix quality, fullscreen on the user's monitor.
5. Collect the "bugs found and fixed" list for the final report: stray `console.log`s; start level was 7 not 1; `Enemy.FireMyLazer` called a non-existent `GameWorld.GeneratePowerUp`; idle player sprite always faced down (`PrevDirection`); power-up odds divided by available instead of total bombs; `Utils.js` replaced native `Array.prototype.indexOf` with a slower `==` version and made helper properties enumerable; sounds cut each other off (`<audio>` restart); `alert` on init failure with a typo; fixed `setInterval` loop ran at the wrong speed on throttled tabs.

---
