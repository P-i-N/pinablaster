const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const H = require('./headless.js');

// A player at tile (3,3) and an enemy placed relative to it; returns whether the game's own touch handling hurt the player.
function hurt(dx, dy) {
  const ctx = H.CreateGame();
  const game = ctx.Engine.Application;
  game.ShowTitle();
  game.StartGame('campaign', ctx.RosterFromSources(['kb0']));
  ctx.Screens.Clear();
  return vm.runInContext(`(function() {
    var p = PlayerManager.Players[0];
    p.X = 17 * 3; p.Y = 17 * 3; p.Hearts = 0; p.InvulnerableTime = 0;
    var e = new Enemy();
    e.SetEnemyType(0);
    e.X = p.X + (${dx}); e.Y = p.Y + (${dy});
    // what GameEntityManager does each tick: touch for overlapping boxes, extended touch within the 1 px border
    var overlap = BoxIntersection(e.X, e.Y, e.X + e.Width - 1, e.Y + e.Height - 1, p.X, p.Y, p.X + p.Width - 1, p.Y + p.Height - 1);
    if (overlap) p.OnTouch(e, BoxOverlapFactor(p.X, p.Y, p.X + p.Width - 1, p.Y + p.Height - 1, e.X, e.Y, e.X + e.Width - 1, e.Y + e.Height - 1));
    p.OnExtendedTouch(e, 0);
    return p.IsDead;
  })()`, ctx);
}

test('an enemy hurts a player it overlaps', () => {
  assert.strictEqual(hurt(5, 0), true);
  assert.strictEqual(hurt(0, -16), true);   // one pixel row of overlap
  assert.strictEqual(hurt(16, 16), true);   // one pixel in the corner
});

test('an enemy that only stands next to the player (boxes just apart) does not hurt', () => {
  assert.strictEqual(hurt(17, 0), false);    // right next to it
  assert.strictEqual(hurt(-17, 0), false);
  assert.strictEqual(hurt(0, 17), false);
  assert.strictEqual(hurt(17, 17), false);   // diagonal neighbour
  assert.strictEqual(hurt(0, -17), false);
});

// The whole engine step: a still enemy placed at (dx, dy) from a still player
function stepHurt(dx, dy, steps) {
  const ctx = H.CreateGame();
  const game = ctx.Engine.Application;
  game.ShowTitle();
  game.StartGame('campaign', ctx.RosterFromSources(['kb0']));
  ctx.Screens.Clear();
  return vm.runInContext(`(function() {
    var p = PlayerManager.Players[0];
    p.X = 17 * 3; p.Y = 17 * 3; p.Hearts = 0; p.InvulnerableTime = 0;
    var e = new Enemy();
    e.SetEnemyType(0);
    e.Speed = 0;
    e.X = p.X + (${dx}); e.Y = p.Y + (${dy});
    for (var i = 0; i < ${steps}; ++i) Engine.Step();
    return p.IsDead;
  })()`, ctx);
}

test('in the running game an overlapping enemy hurts, a neighbouring one does not', () => {
  assert.strictEqual(stepHurt(8, 0, 3), true);
  assert.strictEqual(stepHurt(17, 0, 3), false);
  assert.strictEqual(stepHurt(0, 17, 3), false);
});

test('players and enemies do not block each other: a player can walk into an enemy (and gets hurt)', () => {
  const ctx = H.CreateGame();
  const game = ctx.Engine.Application;
  game.ShowTitle();
  game.StartGame('campaign', ctx.RosterFromSources(['kb0']));
  ctx.Screens.Clear();
  const r = vm.runInContext(`(function() {
    var p = PlayerManager.Players[0], e = new Enemy();
    GameWorld.Walls[3] = "0" + new Array(GameWorld.WorldWidth - 1).join(" ") + "0";   // a free row
    e.SetEnemyType(0);
    e.Speed = 0;
    p.X = 17 * 3; p.Y = 17 * 3;
    e.X = 17 * 4; e.Y = 17 * 3;
    return [GameEntityManager.CanMoveInDirection(p, 2, false), GameEntityManager.CanMoveInDirection(e, 4, false)];
  })()`, ctx);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), [true, true]);
});

// A fresh game with a free row 3 and the player standing on it at tile (10, 3); `body` runs in the game and returns the result
function inGame(body) {
  const ctx = H.CreateGame();
  const game = ctx.Engine.Application;
  game.ShowTitle();
  game.StartGame('campaign', ctx.RosterFromSources(['kb0']));
  ctx.Screens.Clear();
  return vm.runInContext(`(function() {
    var p = PlayerManager.Players[0];
    for (var r = 2; r <= 4; ++r) GameWorld.Walls[r] = "0" + new Array(GameWorld.WorldWidth - 1).join(" ") + "0";
    // (the level's own enemies stay alive - all dead would end the level - but out of the way)
    for (var i = 0; i < GameEntityManager.Entities.length; ++i) {
      var en = GameEntityManager.Entities[i];
      if (en.Type == "Enemy") { en.Speed = 0; en.Direction = 0; en.NextDirection = 0; en.X = 17 * 25; en.Y = 17 * 17; en.Solid = false; }
    }
    p.X = 17 * 10; p.Y = 17 * 3; p.Hearts = 0; p.InvulnerableTime = 0;
    ${body}
  })()`, ctx);
}

test('a player who walks into an enemy fire shot is hit', () => {
  const dead = inGame(`
    var s = new Shot(); s.Owner = { Type: "Enemy" }; s.X = 17 * 12; s.Y = 17 * 3; s.Direction = 0;
    s.Direction = 4;   // flying left, towards the player ... who walks right into it
    for (var i = 0; i < 80 && !p.IsDead; ++i) { p.ApplyInputDirection(2); Engine.Step(); }
    return p.IsDead;`);
  assert.strictEqual(dead, true);
});

test('an enemy flame (laser or shot burst) hurts on any overlap, a bomb\'s blast still needs most of the player in it', () => {
  // an explosion tile offset by 13 px: the player overlaps 4 of 17 pixels
  const flame = owner => inGame(`
    var x = new Explosion(); x.Owner = ${owner}; x.X = p.X + 13; x.Y = p.Y;
    p.OnTouch(x, BoxOverlapFactor(p.X, p.Y, p.X + 16, p.Y + 16, x.X, x.Y, x.X + 16, x.Y + 16));
    return p.IsDead;`);
  assert.strictEqual(flame('{ Type: "Enemy" }'), true);
  assert.strictEqual(flame('{ Type: "Bomb" }'), false);
  // a flame that is only next to the player does not hurt
  assert.strictEqual(inGame(`
    var x = new Explosion(); x.Owner = { Type: "Enemy" }; x.X = p.X + 17; x.Y = p.Y;
    p.OnExtendedTouch(x, 0.9);
    return p.IsDead;`), false);
});
