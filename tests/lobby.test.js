const test = require('node:test');
const assert = require('node:assert');
const { RosterFromSources, SourceLabel, MinPlayers, IsBotId, NextBotLevel, LobbyRows, LobbyAdjust } = require('../Game/Lobby.js');

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

test('touch controls can be a lobby source', () => {
  assert.deepStrictEqual(RosterFromSources(['touch']), [{ Keyboard: null, Pad: null, Touch: true }]);
  assert.strictEqual(SourceLabel('touch'), 'Touch controls');
});

test('MinPlayers: battle needs two', () => {
  assert.strictEqual(MinPlayers('campaign'), 1);
  assert.strictEqual(MinPlayers('battle'), 2);
});

test('bot ids map to bot roster entries and labels', () => {
  assert.deepStrictEqual(RosterFromSources(['kb0', 'ai:hard']), [{ Keyboard: 0, Pad: null }, { Bot: 'hard' }]);
  assert.strictEqual(SourceLabel('ai:easy'), 'AI - Easy');
  assert.strictEqual(IsBotId('ai:normal'), true);
  assert.strictEqual(IsBotId('kb0'), false);
});

test('NextBotLevel cycles easy-normal-hard; left of easy removes the bot', () => {
  assert.strictEqual(NextBotLevel('normal', 1), 'hard');
  assert.strictEqual(NextBotLevel('hard', 1), 'hard');
  assert.strictEqual(NextBotLevel('normal', -1), 'easy');
  assert.strictEqual(NextBotLevel('easy', -1), null);
});

test('LobbyRows: the taken seats plus the first free one', () => {
  assert.strictEqual(LobbyRows(0, 6), 1);
  assert.strictEqual(LobbyRows(3, 6), 4);
  assert.strictEqual(LobbyRows(6, 6), 6);
});

test('LobbyAdjust adds, changes and removes bots, never touches people', () => {
  assert.deepStrictEqual(LobbyAdjust(['kb0'], 1, 1, 6), ['kb0', 'ai:normal']);
  assert.deepStrictEqual(LobbyAdjust(['kb0', 'ai:normal'], 1, 1, 6), ['kb0', 'ai:hard']);
  assert.deepStrictEqual(LobbyAdjust(['kb0', 'ai:easy', 'pad0'], 1, -1, 6), ['kb0', 'pad0']);
  assert.deepStrictEqual(LobbyAdjust(['kb0'], 0, 1, 6), ['kb0']);
  assert.deepStrictEqual(LobbyAdjust(['a', 'b'], 2, 1, 2), ['a', 'b']);
});

test('LobbyStartAction: Start joins with a free device, unless only CPU players are seated - then it starts a bots-only game', () => {
  const L = require('../Game/Lobby.js');
  assert.strictEqual(L.LobbyStartAction([], 'kb0', 'campaign', 8), 'join');
  assert.strictEqual(L.LobbyStartAction(['kb0'], 'kb0', 'campaign', 8), 'start');
  assert.strictEqual(L.LobbyStartAction(['kb0'], 'kb0', 'battle', 8), null, 'battle needs two');
  assert.strictEqual(L.LobbyStartAction(['kb0'], 'pad0', 'campaign', 8), 'join', 'another person joins');
  assert.strictEqual(L.LobbyStartAction(['kb0', 'ai:easy'], 'pad0', 'campaign', 8), 'join');
  assert.strictEqual(L.LobbyStartAction(['ai:easy'], 'kb0', 'campaign', 8), 'start', 'one CPU is enough for a campaign');
  assert.strictEqual(L.LobbyStartAction(['ai:easy'], 'kb0', 'battle', 8), 'join', 'a battle of one CPU needs somebody');
  assert.strictEqual(L.LobbyStartAction(['ai:easy', 'ai:hard'], 'kb0', 'battle', 8), 'start');
  assert.strictEqual(L.LobbyStartAction(['kb0', 'ai:easy', 'ai:hard', 'ai:easy', 'ai:easy', 'ai:easy', 'ai:easy', 'ai:easy'], 'pad0', 'campaign', 8), null, 'full');
});
