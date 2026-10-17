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
