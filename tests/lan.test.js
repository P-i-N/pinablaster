const test = require('node:test');
const assert = require('node:assert');
const L = require('../Game/Lan.js');

const room = (mode, slots) => ({ id: 1, name: "Ann's game", mode, state: 'lobby', host: 7, members: [], slots });
const slot = (client, src) => ({ client, name: 'n' + client, src, label: src });

test('ClaimedSources lists only this client\'s devices', () => {
  const r = room('campaign', [slot(7, 'kb0'), slot(8, 'kb0'), slot(7, 'pad1'), null]);
  assert.deepStrictEqual(L.ClaimedSources(r, 7), { kb0: 0, pad1: 2 });
  assert.deepStrictEqual(L.ClaimedSources(r, 8), { kb0: 1 });
  assert.deepStrictEqual(L.ClaimedSources(null, 7), {});
});

test('PlayerCount and CanStart follow the mode minimums', () => {
  const one = room('campaign', [slot(7, 'kb0'), null, null, null]);
  assert.strictEqual(L.PlayerCount(one), 1);
  assert.strictEqual(L.CanStart(one), true);
  assert.strictEqual(L.CanStart(room('battle', one.slots)), false);
  assert.strictEqual(L.CanStart(room('battle', [slot(7, 'kb0'), slot(8, 'kb0'), null, null])), true);
  assert.strictEqual(L.CanStart(room('campaign', [null, null, null, null])), false);
});

test('NextMode toggles between campaign and battle', () => {
  assert.strictEqual(L.NextMode('campaign'), 'battle');
  assert.strictEqual(L.NextMode('battle'), 'campaign');
});

test('RoomRow formats the join list', () => {
  assert.strictEqual(L.RoomRow({ name: "Ann's game", mode: 'battle', state: 'lobby', players: 2, max: 4 }), "Ann's game  -  Battle  -  2/4");
  assert.strictEqual(L.RoomRow({ name: 'X', mode: 'campaign', state: 'playing', players: 3, max: 4 }), 'X  -  Campaign  -  3/4  (playing)');
});

global.NextBotLevel = require('../Game/Lobby.js').NextBotLevel;

test('RoomAdjust: mode row, free seat, bot seat, human seat', () => {
  const r = room('campaign', [slot(7, 'kb0'), null, { client: 7, name: 'CPU', src: 'ai', label: 'AI - Easy', bot: 'easy' }]);
  assert.deepStrictEqual(L.RoomAdjust(r, 0, 1), { t: 'mode', mode: 'battle' });
  assert.deepStrictEqual(L.RoomAdjust(r, 2, -1), { t: 'bot', slot: 1, level: 'normal' });
  assert.deepStrictEqual(L.RoomAdjust(r, 3, 1), { t: 'bot', slot: 2, level: 'normal' });
  assert.deepStrictEqual(L.RoomAdjust(r, 3, -1), { t: 'unbot', slot: 2 });
  assert.strictEqual(L.RoomAdjust(r, 1, 1), null);
});

test('ClaimedSources ignores bot seats', () => {
  const r = room('campaign', [slot(7, 'kb0'), { client: 7, name: 'CPU', src: 'ai', label: 'AI - Easy', bot: 'easy' }]);
  assert.deepStrictEqual(L.ClaimedSources(r, 7), { kb0: 0 });
});
