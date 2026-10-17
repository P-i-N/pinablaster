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

test('a direction tap shorter than one poll still registers for that poll', () => {
  const inp = new I.InputPrototype();
  inp.Bind(0, { Keyboard: 0, Pad: null });
  inp.Poll({}, [], { ArrowDown: true });
  assert.strictEqual(inp.Player(0).Dir, 3);
  assert.strictEqual(inp.Player(0).DirPressed, true);
  assert.strictEqual(inp.Menu().Down, true);
  inp.Poll({}, [], {});
  assert.strictEqual(inp.Player(0).Dir, 0);
});

test('Sources(): lists keyboards and connected pads', () => {
  const inp = new I.InputPrototype();
  inp.Poll({}, [pad(2, {})], {});
  const ids = inp.Sources().map(s => s.Id).sort();
  assert.deepStrictEqual(ids, ['kb0', 'kb1', 'pad2']);
});

test('touch source behaves like a third keyboard', () => {
  const inp = new I.InputPrototype();
  inp.Bind(0, { Keyboard: null, Pad: null, Touch: true });
  inp.Poll({}, [], {}, { Keys: { Right: true, Bomb: true }, Latch: {} });
  assert.strictEqual(inp.Player(0).Dir, 2);
  assert.strictEqual(inp.Player(0).Bomb, true);
  assert.strictEqual(inp.Player(0).BombPressed, true);
  assert.strictEqual(inp.Player(0).Connected, true);
  inp.Poll({}, [], {}, { Keys: {}, Latch: { Start: true } });
  assert.strictEqual(inp.Player(0).StartPressed, true);
  inp.Poll({}, [], {}, { Keys: {}, Latch: { Back: true } });
  assert.strictEqual(inp.Menu().Back, true);
});

test('touch taps shorter than one poll still register', () => {
  const inp = new I.InputPrototype();
  inp.Bind(0, { Keyboard: null, Pad: null, Touch: true });
  inp.Poll({}, [], {}, { Keys: {}, Latch: { Down: true, Bomb: true } });
  assert.strictEqual(inp.Player(0).Dir, 3);
  assert.strictEqual(inp.Player(0).BombPressed, true);
});

test('Sources() lists touch only while a touch snapshot is supplied', () => {
  const inp = new I.InputPrototype();
  inp.Poll({}, [], {}, null);
  assert.ok(!inp.Sources().some(s => s.Id === 'touch'));
  inp.Poll({}, [], {}, { Keys: {}, Latch: {} });
  assert.ok(inp.Sources().some(s => s.Id === 'touch' && s.Touch === true));
});

test('Menu(): touch d-pad and bomb button navigate menus', () => {
  const inp = new I.InputPrototype();
  inp.Poll({}, [], {}, { Keys: { Down: true, Bomb: true }, Latch: {} });
  const m = inp.Menu();
  assert.strictEqual(m.Down, true);
  assert.strictEqual(m.Confirm, true);
});

test('virtual (network) sources act like keyboards and are bound with Net: slot', () => {
  const inp = new I.InputPrototype();
  inp.Bind(2, { Keyboard: null, Pad: null, Net: 1 });
  inp.Poll({}, [], {}, null, { net1: { Keys: { Left: true }, Latch: { Bomb: true } } });
  assert.strictEqual(inp.Player(2).Dir, 4);
  assert.strictEqual(inp.Player(2).BombPressed, true);
  assert.strictEqual(inp.Player(2).Connected, true);
});

test('a net binding only reads its own slot', () => {
  const inp = new I.InputPrototype();
  inp.Bind(0, { Keyboard: null, Pad: null, Net: 0 });
  inp.Bind(1, { Keyboard: null, Pad: null, Net: 1 });
  inp.Poll({}, [], {}, null, { net1: { Keys: { Up: true }, Latch: {} } });
  assert.strictEqual(inp.Player(0).Dir, 0);
  assert.strictEqual(inp.Player(0).Connected, false);
  assert.strictEqual(inp.Player(1).Dir, 1);
});

test('remote players can not drive menus or appear as lobby devices', () => {
  const inp = new I.InputPrototype();
  inp.Poll({}, [], {}, null, { net0: { Keys: { Down: true, Bomb: true }, Latch: { Start: true, Back: true } } });
  const m = inp.Menu();
  assert.strictEqual(m.Any, false);
  assert.ok(!inp.Sources().some(s => s.Id.indexOf('net') === 0));
});

test('Update() polls registered virtual sources and skips ones that return null', () => {
  global.navigator = { getGamepads: () => [] };
  const inp = new I.InputPrototype();
  inp.Bind(0, { Keyboard: null, Pad: null, Net: 3 });
  inp.Virtuals.net3 = { Snapshot: () => ({ Keys: { Right: true }, Latch: {} }) };
  inp.Virtuals.net4 = { Snapshot: () => null };
  inp.Update();
  assert.strictEqual(inp.Player(0).Dir, 2);
  assert.ok(inp.Raw.net3 && !inp.Raw.net4);
  delete global.navigator;
});
