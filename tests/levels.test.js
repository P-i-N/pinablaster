const test = require('node:test');
const assert = require('node:assert');
const L = require('../Game/Levels.js');
const { ComputeSpawns, ClearSpawnPockets } = require('../Game/Players.js');

function spawns(level, count) {
  const b = L.LevelSpawnBase(level);
  return ComputeSpawns((x, y) => L.LevelFree(level, x, y), 27, 19, b.x, b.y, count || 8);
}

const tiles = level => L.LevelThings(level).map(t => t.ch).join('');
const all = L.CAMPAIGN_LEVELS;

// a plain 27 x 19 arena with pillars and nothing in it
function arena() {
  const rows = [];
  for (let y = 0; y < 19; ++y) {
    let r = '';
    for (let x = 0; x < 27; ++x)
      r += (x == 0 || y == 0 || x == 26 || y == 18) ? '0' : (x % 2 == 0 && y % 2 == 0 ? '0' : ' ');
    rows.push(r);
  }
  return rows;
}
const put = (rows, x, y, ch) => { rows[y] = rows[y].substr(0, x) + ch + rows[y].substr(x + 1); return rows; };

test('every campaign level can be finished by 1-8 players', () => {
  all.forEach((lv, i) => {
    for (let n = 1; n <= 8; ++n)
    {
      const sp = spawns(lv, n);
      const carved = Object.assign({}, lv, { Map: ClearSpawnPockets(lv.Map, sp, 6) });
      assert.deepStrictEqual(L.LevelProblems(carved, sp), [], (i + 1) + ' ' + lv.Name + ' with ' + n + ' players');
    }
  });
});

test('the campaign is 12 levels, each named and hinted, and the outro follows', () => {
  assert.strictEqual(all.length, 12);
  assert.strictEqual(L.CAMPAIGN_END, 12);
  all.forEach(lv => { assert.ok(lv.Name && lv.Hint.length <= 64, lv.Name); });
  assert.deepStrictEqual(L.CampaignLevel(L.CAMPAIGN_END).Over, []);
  assert.ok(L.CampaignLevel(L.CAMPAIGN_END).Map.join('').indexOf('a') < 0);
});

test('threat never drops from one level to the next, and the finale is the hardest', () => {
  const t = all.map(L.LevelThreat);
  for (let i = 1; i < t.length; ++i)
    assert.ok(t[i] >= t[i - 1], 'level ' + (i + 1) + ': ' + t[i] + ' < ' + t[i - 1]);
  assert.strictEqual(Math.max.apply(null, t), t[t.length - 1]);
  assert.ok(t[t.length - 1] >= 5 * t[0]);
});

test('ideas come in one at a time: each enemy type and mechanic first shows up on its own level', () => {
  const firstAt = ch => all.findIndex(lv => tiles(lv).indexOf(ch) >= 0 || lv.Map.join('').indexOf(ch) >= 0);
  // Dumballoon, Mop, Drakentus, ice, Flamie / frozen-bomb fuse, drains, Shoop, carpets + Blowfrog, keys + 4channer
  assert.deepStrictEqual(['a', 'b', 'd', 'i', 'e', '#', 'c', '>', 'f', 'T', 'g'].map(firstAt), [0, 1, 2, 3, 4, 5, 6, 7, 7, 8, 8]);
  assert.ok(tiles(all[0]).split('').every(ch => ch == 'a'), 'level 1 is Dumballoons only');
  // the finale uses every enemy type
  assert.ok('abcdefg'.split('').every(ch => tiles(all[11]).indexOf(ch) >= 0));
});

test('CampaignLevel hands out copies: the game rewriting its walls leaves the source alone', () => {
  const a = L.CampaignLevel(7);
  a.Map[1] = 'x';
  a.Over[0][2] = 'z';
  assert.notStrictEqual(L.CampaignLevel(7).Map[1], 'x');
  assert.notStrictEqual(L.CampaignLevel(7).Over[0][2], 'z');
});

test('LevelProblems: an empty arena with one balloon is fine', () => {
  const lv = { Map: put(arena(), 13, 9, 'a') };
  assert.deepStrictEqual(L.LevelProblems(lv, spawns(lv)), []);
});

test('LevelProblems: catches bad shape, unknown tiles and an open border', () => {
  assert.deepStrictEqual(L.LevelProblems({ Map: arena().slice(1) }, [{ x: 1, y: 1 }]), ['map is not 27 x 19']);
  const lv = { Map: put(put(put(arena(), 13, 9, 'a'), 5, 5, 'z'), 26, 9, ' ') };
  assert.deepStrictEqual(L.LevelProblems(lv, spawns(lv)), ["unknown tile 'z' at 5,5", 'open border at 26,9']);
});

test('LevelProblems: a walled-in enemy needs a drain in its pen and a drain players can reach', () => {
  const pen = () => {
    const m = arena();
    [[12, 8], [13, 8], [14, 8], [12, 9], [14, 9], [12, 10], [13, 10], [14, 10]].forEach(p => put(m, p[0], p[1], '2'));
    return put(m, 13, 9, 'a');
  };
  let lv = { Map: pen() };
  assert.deepStrictEqual(L.LevelProblems(lv, spawns(lv)), ["enemy a can't be killed at 13,9"]);
  lv = { Map: put(put(pen(), 13, 9, '#'), 13, 9, '#') };
  lv.Over = [[13, 9, 'a']];
  assert.deepStrictEqual(L.LevelProblems(lv, spawns(lv)), ["enemy a can't be killed at 13,9"]);
  put(lv.Map, 7, 7, '#');
  assert.deepStrictEqual(L.LevelProblems(lv, spawns(lv)), []);
});

test('LevelProblems: doors open once their key is in reach, keys behind their own door are not', () => {
  const m = arena();
  [[20, 7], [21, 7], [22, 7], [23, 7], [24, 7], [25, 7]].forEach(p => put(m, p[0], p[1], '2'));
  [[19, 1], [19, 2], [19, 3], [19, 4], [19, 5], [19, 6]].forEach(p => put(m, p[0], p[1], '2'));
  put(m, 19, 3, 'A');
  put(m, 22, 3, 'a');
  let lv = { Map: m.slice() };
  // spawn 2 (top right) is inside the vault: use 1 player
  assert.deepStrictEqual(L.LevelProblems(lv, spawns(lv, 1)), ['door A has no key', "enemy a can't be killed at 22,3"]);
  lv = { Map: put(m.slice(), 9, 9, 'T') };
  assert.deepStrictEqual(L.LevelProblems(lv, spawns(lv, 1)), []);
  lv = { Map: put(m.slice(), 24, 1, 'T') };
  assert.deepStrictEqual(L.LevelProblems(lv, spawns(lv, 1)), ['key T out of reach at 24,1', "enemy a can't be killed at 22,3"]);
  assert.deepStrictEqual(L.LevelProblems({ Map: put(m.slice(), 9, 9, 'T') }, spawns({ Map: m }, 2)), ['player 2 spawns cut off at 25,1']);
});

test('LevelProblems: the first bomb must be survivable, with no enemy breathing down your neck', () => {
  const lv = { Map: put(put(put(arena(), 2, 1, '1'), 1, 2, '1'), 3, 2, 'b') };
  assert.deepStrictEqual(L.LevelProblems(lv, [{ x: 1, y: 1 }]), [
    "player 1 can't escape a first bomb at 1,1",
    'enemy b at 3,2 too close to player 1'
  ]);
});

test('LevelProblems: Over is only for enemies and ice standing on a carpet or drain', () => {
  const lv = { Map: put(put(arena(), 13, 9, '>'), 13, 7, 'a'), Over: [[13, 9, 'a'], [3, 3, 'T']] };
  assert.deepStrictEqual(L.LevelProblems(lv, spawns(lv)), ["bad Over 'T' at 3,3"]);
});

test('SkullEnemyType only picks kinds the level started with; a level without enemies allows all seven', () => {
  const pick = (present, r) => L.SkullEnemyType(present, () => r);
  assert.deepStrictEqual([0, 0.34, 0.67, 0.999].map(r => pick([2, 4, 6], r)), [2, 4, 6, 6]);
  assert.strictEqual(pick([5], 0.9), 5);
  assert.deepStrictEqual([0, 0.5, 0.999].map(r => pick([], r)), [0, 3, 6]);
  assert.strictEqual(pick(null, 0.2), 1);
  // every level of the campaign: whatever the dice say, only its own kinds come out
  L.CAMPAIGN_LEVELS.forEach((raw, i) => {
    const lv = L.CampaignLevel(i), kinds = [];
    lv.Map.join('').split('').concat(lv.Over.map(o => o[2])).forEach(c => { const k = 'abcdefg'.indexOf(c); if (k >= 0 && kinds.indexOf(k) < 0) kinds.push(k); });
    for (let r = 0; r < 1; r += 0.05) assert.ok(kinds.length == 0 || kinds.indexOf(pick(kinds, r)) >= 0, 'level ' + i);
  });
});
