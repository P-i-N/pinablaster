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

test('MenuClick: confirms an item, adjusts a volume by the half that was hit, ignores disabled and inert items', () => {
  const { MenuModel, MenuClick, RegionAt } = require('../Game/Screens.js');
  const log = [];
  const model = new MenuModel([
    { Label: 'Play', OnConfirm: () => log.push('play') },
    { Label: 'Volume', OnAdjust: d => log.push('adjust' + d) },
    { Label: 'Both', OnConfirm: () => log.push('both-confirm'), OnAdjust: d => log.push('both-adjust' + d) },
    { Label: 'Off', Disabled: () => true, OnConfirm: () => log.push('off') },
    { Label: 'Text only' }
  ]);
  assert.strictEqual(MenuClick(model, 0, 0.9), true);
  assert.strictEqual(model.Index, 0);
  MenuClick(model, 1, 0.2); MenuClick(model, 1, 0.8);
  assert.strictEqual(model.Index, 1);
  MenuClick(model, 2, 0.1);
  assert.strictEqual(MenuClick(model, 3, 0.5), false);
  assert.strictEqual(MenuClick(model, 4, 0.5), false);
  assert.strictEqual(MenuClick(model, 9, 0.5), false);
  assert.deepStrictEqual(log, ['play', 'adjust-1', 'adjust1', 'both-confirm']);
  const regions = [{ x: 0, y: 0, w: 100, h: 100, id: 'back' }, { x: 10, y: 10, w: 20, h: 20, id: 'top' }];
  assert.strictEqual(RegionAt(regions, 15, 15).id, 'top', 'the later one is on top');
  assert.strictEqual(RegionAt(regions, 50, 50).id, 'back');
  assert.strictEqual(RegionAt(regions, 100, 50), null, 'the far edge is outside');
});
