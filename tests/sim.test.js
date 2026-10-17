const test = require('node:test');
const assert = require('node:assert');
const { SimSummary, SimCause } = require('../Game/Sim.js');

test('SimSummary adds up kills, hits by cause, round wins and round length', () => {
  const runs = [
    { kills: 3, enemies: 6, hits: [{ player: 1, cause: 'enemy' }, { player: 2, cause: 'own' }], rounds: [{ winner: 1, t: 30 }], seconds: 60 },
    { kills: 1, enemies: 6, hits: [{ player: 1, cause: 'enemy' }], rounds: [{ winner: 2, t: 50 }, { winner: 1, t: 70 }], seconds: 60 }
  ];
  assert.deepStrictEqual(SimSummary(runs), {
    runs: 2, seconds: 120, kills: 4, enemies: 12, hits: { enemy: 2, own: 1 },
    wins: { 1: 2, 2: 1 }, draws: 0, roundSecs: 50
  });
});

test('SimSummary counts drawn rounds and copes with no rounds', () => {
  const s = SimSummary([{ kills: 0, enemies: 0, hits: [], rounds: [{ winner: -1, t: 10 }], seconds: 10 }, { kills: 0, enemies: 0, hits: [], rounds: [], seconds: 5 }]);
  assert.strictEqual(s.draws, 1);
  assert.strictEqual(s.roundSecs, 10);
  assert.strictEqual(SimSummary([]).roundSecs, 0);
});

test('SimCause names who did it: own bomb, another player, which enemy type, frozen bombs, the closing arena', () => {
  const me = { Type: 'Player', Index: 0 }, other = { Type: 'Player', Index: 2 };
  const blast = owner => ({ Type: 'Explosion', Owner: owner });
  assert.strictEqual(SimCause(me, blast({ Type: 'Bomb', Owner: me })), 'own');
  assert.strictEqual(SimCause(me, blast({ Type: 'Bomb', Owner: other })), 'player2');
  assert.strictEqual(SimCause(me, { Type: 'Enemy', EnemyType: 6 }), 'enemy:g');
  assert.strictEqual(SimCause(me, blast({ Type: 'Enemy', EnemyType: 2 })), 'enemy:c');
  assert.strictEqual(SimCause(me, { Type: 'Shot', Owner: { Type: 'Enemy', EnemyType: 4 } }), 'enemy:e');
  assert.strictEqual(SimCause(me, blast({ Type: 'IceBlock' })), 'frozen bomb');
  assert.strictEqual(SimCause(me, blast({ Type: 'SuddenDeath' })), 'sudden');
});
