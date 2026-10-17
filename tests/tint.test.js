const test = require('node:test');
const assert = require('node:assert');
const { TintRegion, PLAYER_TINTS, FlameRecolor, PLAYER_FLAME_COLORS, FLAME_FRAMES, FlameBlock } = require('../Engine/Tint.js');

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
  assert.strictEqual(PLAYER_TINTS.length, 8);
  const keys = PLAYER_TINTS.slice(1).map(t => t.join(','));
  assert.strictEqual(new Set(keys).size, 7); // every player a different colour
});

test('FlameRecolor: orange takes the player colour, brightness stays, white-hot and transparent pixels are kept', () => {
  const d = img([px(255, 120, 20, 255), px(255, 255, 255, 255), px(10, 5, 0, 0), px(120, 60, 10, 255)]);
  FlameRecolor(d, [0.29, 0.64, 1]);
  assert.ok(d[2] > d[0] && d[2] > d[1], 'orange turned blue');
  assert.strictEqual(Math.max(d[0], d[1], d[2]), 255, 'full brightness kept');
  assert.deepStrictEqual(Array.from(d.slice(4, 8)), [255, 255, 255, 255]);
  assert.deepStrictEqual(Array.from(d.slice(8, 12)), [10, 5, 0, 0]);
  assert.ok(Math.max(d[12], d[13], d[14]) < 130, 'a dark orange stays dark');
});

test('there is a flame colour per player and the explosion frames are listed once', () => {
  assert.strictEqual(PLAYER_FLAME_COLORS.length, 8);
  assert.strictEqual(new Set(FLAME_FRAMES).size, FLAME_FRAMES.length);
  [80, 86, 104, 126, 140, 146].forEach(f => assert.ok(FLAME_FRAMES.includes(f)));
});

test('the explosion frames fill one rectangle of the 20-column sheet (so they can be recoloured as a block)', () => {
  assert.deepStrictEqual(FlameBlock(20), { col: 0, row: 4, cols: 7, rows: 4 });
});
