const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const H = require('./headless.js');

// A plus: a corridor along row 3 and a corridor down column 6 (rows 3 - 8), everything else wall. The player runs right along row 3
// from tile 3 and presses `turn` (2 = right, 3 = down, 1 = up) once it is `past` pixels beyond the middle of the plus (tile 6, x = 102).
// Returns where it is after the key has been held for `steps` more steps.
function run(turn, past, steps, opts) {
  opts = opts || {};
  const ctx = H.CreateGame();
  const game = ctx.Engine.Application;
  game.ShowTitle();
  game.StartGame('campaign', ctx.RosterFromSources(['kb0']));
  ctx.Screens.Clear();
  return JSON.parse(vm.runInContext(`(function() {
    var p = PlayerManager.Players[0];
    var W = GameWorld.WorldWidth, H = GameWorld.WorldHeight, rows = [];
    for (var y = 0; y < H; ++y) {
      var row = "";
      for (var x = 0; x < W; ++x) {
        var wall = x == 0 || y == 0 || x == W - 1 || y == H - 1;
        var open = (y == 3 && x >= 1) || (x == 6 && y >= 3 && y <= 8 && ${opts.noColumn ? 'false' : 'true'}) || (x == 6 && y >= 1 && y <= 3 && ${opts.upColumn ? 'true' : 'false'});
        row += !wall && open ? " " : "0";
      }
      rows.push(row);
    }
    GameWorld.Walls = rows;
    for (var i = 0; i < GameEntityManager.Entities.length; ++i) {
      var en = GameEntityManager.Entities[i];
      if (en.Type == "Enemy") { en.Speed = 0; en.Direction = 0; en.NextDirection = 0; en.X = 17 * 25; en.Y = 17 * 17; en.Solid = false; }
    }
    p.X = 17 * 3; p.Y = 17 * 3; p.Hearts = 3; p.InvulnerableTime = 100;
    // the keys: this seat's input comes from here (the game applies it every step)
    var key = 0;
    Engine.Application.Bots[0] = { Update: function() { return { Dir: key, Bomb: false, BombPressed: false }; } };
    key = 2;
    while (p.X < 102 + ${past}) Engine.Step();
    var moved = [];
    key = ${turn};
    for (var i = 0; i < ${steps}; ++i) { Engine.Step(); moved.push(p.X + "," + p.Y); }
    return JSON.stringify({ x: p.X, y: p.Y, trail: moved.slice(0, 12) });
  })()`, ctx));
}

test('a turn missed by a few pixels is made anyway: the player backs up to the opening and goes down', () => {
  for (const past of [1, 3, 5]) {
    const r = run(3, past, 40);
    assert.strictEqual(r.x, 102, 'past ' + past + ': ' + JSON.stringify(r));
    assert.ok(r.y > 51 + 20, 'past ' + past + ': went down ' + JSON.stringify(r));
  }
});

test('missing it by more than the assist allows keeps the player running on', () => {
  const r = run(3, 9, 12);
  assert.ok(r.x > 102 + 9, JSON.stringify(r));
  assert.strictEqual(r.y, 51);
});

test('hitting the key exactly on time, or early, works as before', () => {
  assert.strictEqual(run(3, 0, 30).x, 102);
  assert.ok(run(3, 0, 30).y > 51);
});

test('the same for turning up, and no turn assist where there is no opening', () => {
  const up = run(1, 4, 40, { upColumn: true, noColumn: true });
  assert.strictEqual(up.x, 102);
  assert.ok(up.y < 51, JSON.stringify(up));
  const none = run(3, 4, 12, { noColumn: true });
  assert.ok(none.x > 102 + 4, 'no opening below: keeps running ' + JSON.stringify(none));
  assert.strictEqual(none.y, 51);
});

test('the backing up is a few pixels at a time, not a jump', () => {
  const r = run(3, 5, 12);
  const xs = r.trail.map(s => +s.split(',')[0]);
  for (let i = 1; i < xs.length; ++i) assert.ok(Math.abs(xs[i] - xs[i - 1]) <= 1, JSON.stringify(xs));
});
