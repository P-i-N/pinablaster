const test = require('node:test');
const assert = require('node:assert');
const { SanitizeSettings } = require('../Game/Settings.js');

test('defaults when there is nothing stored', () => {
  assert.deepStrictEqual(SanitizeSettings(null), { master: 0.8, sfx: 1.0, music: 0.6, integerScale: false, touchMode: 'auto', effects: true });
  assert.deepStrictEqual(SanitizeSettings('garbage'), SanitizeSettings(null));
});

test('valid values are kept, volumes are clamped', () => {
  const s = SanitizeSettings({ master: 0.3, sfx: 5, music: -2, integerScale: true, touchMode: 'on', effects: true });
  assert.deepStrictEqual(s, { master: 0.3, sfx: 1, music: 0, integerScale: true, touchMode: 'on', effects: true });
});

test('wrong types fall back to the default per field', () => {
  const s = SanitizeSettings({ master: '0.1', sfx: null, music: NaN, integerScale: 'yes', touchMode: 'maybe' });
  assert.deepStrictEqual(s, { master: 0.8, sfx: 1.0, music: 0.6, integerScale: false, touchMode: 'auto', effects: true });
});

test('touchMode accepts only auto / on / off', () => {
  assert.strictEqual(SanitizeSettings({ touchMode: 'off' }).touchMode, 'off');
  assert.strictEqual(SanitizeSettings({ touchMode: 'ON' }).touchMode, 'auto');
  assert.strictEqual(SanitizeSettings({ touchMode: 3 }).touchMode, 'auto');
});
