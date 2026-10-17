const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const H = require('./headless.js');

// A campaign game in real-time mode (not a simulation run: those skip the wipe); every enemy of level 0 is then killed.
function setup(roster) {
  const ctx = H.CreateGame();
  const game = ctx.Engine.Application;
  game.ShowTitle();
  game.StartGame('campaign', ctx.RosterFromSources(roster || ['kb0']));
  ctx.Screens.Clear();
  ctx.Engine.Turbo = false;
  return { ctx, game };
}

function killEnemies(ctx) {
  vm.runInContext('GameEntityManager.Entities.forEach(function(e) { if (e.Type == "Enemy") e.Health = 0; })', ctx);
}

test('clearing a level does not switch at once: a black circle closes, the level changes behind it, the circle opens', () => {
  const { ctx, game } = setup();
  killEnemies(ctx);
  const trail = [];
  let switchedAt = -1;

  for (let i = 0; i < 260; ++i) {
    ctx.Engine.Step();
    const iris = game.IrisData();
    trail.push(iris ? iris.r : -1);

    if (game.LevelNumber == 1 && switchedAt < 0) switchedAt = i;
  }

  const t = i => i * 0.01;
  assert.ok(switchedAt > 70 && switchedAt < 100, 'the level changes after the circle has closed (' + t(switchedAt) + ' s)');
  const closing = trail.slice(2, 70), opening = trail.slice(switchedAt + 25, 250).filter(r => r >= 0);
  assert.ok(closing[0] > closing[closing.length - 1], 'it closes');
  for (let i = 1; i < closing.length; ++i) assert.ok(closing[i] <= closing[i - 1], 'closing only shrinks: ' + closing.slice(i - 1, i + 1));
  assert.strictEqual(Math.min(...trail.filter(r => r >= 0)), 0, 'it closes completely');
  for (let i = 1; i < opening.length; ++i) assert.ok(opening[i] >= opening[i - 1], 'opening only grows');
  assert.ok(opening[opening.length - 1] > closing[0] * 0.5, 'and opens wide');
  assert.strictEqual(game.Transition, null, 'done');
  assert.strictEqual(ctx.Engine.PauseModules, false, 'the game runs again');
});

test('during the wipe the world stands still, and afterwards the new level is live', () => {
  const { ctx, game } = setup();
  const p = () => vm.runInContext('PlayerManager.Players[0].X + "," + PlayerManager.Players[0].Y', ctx);
  vm.runInContext('Engine.Application.Bots[0] = { Update: function() { return { Dir: 2, Bomb: false, BombPressed: false }; } }', ctx);
  killEnemies(ctx);
  ctx.Engine.Step();
  const before = p();
  for (let i = 0; i < 50; ++i) ctx.Engine.Step();
  assert.strictEqual(p(), before, 'the player cannot walk away while the circle closes');
  assert.strictEqual(game.LevelNumber, 0);
  for (let i = 0; i < 150; ++i) ctx.Engine.Step();   // the rest of the wipe
  assert.strictEqual(game.LevelNumber, 1);
  const start = p();
  for (let i = 0; i < 40; ++i) ctx.Engine.Step();
  assert.notStrictEqual(p(), start, 'the player moves in the new level');
});

test('the circle closes on the first living human, and a LAN guest gets it with the HUD data', () => {
  const { ctx, game } = setup(['kb0', 'ai:easy']);
  killEnemies(ctx);
  for (let i = 0; i < 20; ++i) ctx.Engine.Step();
  const hud = game.HudData();
  const human = JSON.parse(vm.runInContext('JSON.stringify({ x: PlayerManager.Players[0].X, y: PlayerManager.Players[0].Y })', ctx));
  assert.ok(hud.extra.iris, 'in the HUD data');
  assert.strictEqual(hud.extra.iris.cx, Math.round(58 + human.x + 8.5));
  assert.strictEqual(hud.extra.iris.cy, Math.round(ctx.Renderer.MapOffsetY + human.y + 8.5));
});

test('a simulation run (turbo) switches levels at once, and Retry ends a wipe', () => {
  const sim = setup();
  sim.ctx.Engine.Turbo = true;
  killEnemies(sim.ctx);
  sim.ctx.Engine.Step();
  assert.strictEqual(sim.game.LevelNumber, 1);
  assert.strictEqual(sim.game.Transition, null);

  const { ctx, game } = setup();
  killEnemies(ctx);
  for (let i = 0; i < 30; ++i) ctx.Engine.Step();
  assert.ok(game.Transition);
  game.SetLevel(0);
  assert.strictEqual(game.Transition, null);
  assert.strictEqual(ctx.Engine.PauseModules, false);
});

test('Hud.DrawIris paints black outside the circle only, inside the map area', () => {
  const ctx = H.CreateGame();
  const calls = [];
  const c = new Proxy({}, { get: (t, k) => (...a) => { calls.push([k, ...a]); }, set: () => true });
  ctx.Hud.DrawIris(c, { cx: 100, cy: 100, r: 30, x: 58, y: 0, w: 459, h: 323 });
  assert.ok(calls.some(a => a[0] == 'arc' && a[3] == 30), 'the circle is cut out');
  assert.ok(calls.some(a => a[0] == 'fill'));
  calls.length = 0;
  ctx.Hud.DrawIris(c, { cx: 100, cy: 100, r: 5000, x: 58, y: 0, w: 459, h: 323 });
  assert.strictEqual(calls.length, 0, 'a circle that covers everything draws nothing');
});
