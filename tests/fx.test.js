const test = require('node:test');
const assert = require('node:assert');
const { FluidSolver } = require('../Game/Fluid.js');
const { ParticleSystem } = require('../Game/Particles.js');
globalThis.FluidSolver = FluidSolver;
globalThis.ParticleSystem = ParticleSystem;
const { CollisionGrid } = require('../Game/CollisionGrid.js');
globalThis.CollisionGrid = CollisionGrid;
globalThis.PLAYER_FLAME_COLORS = require('../Engine/Tint.js').PLAYER_FLAME_COLORS;
const { FxController, FX_STEP, FX_CELLS_PER_TILE } = require('../Game/Fx.js');

function room(w, h) {
  const f = new FluidSolver(w, h);
  return f;
}

test('projection removes divergence', () => {
  const f = room(40, 30);
  f.Burst(20, 15, 8, 30, 0, 0);
  const before = f.Divergence();
  f.Project();
  assert.ok(f.Divergence() < before * 0.4, 'divergence ' + before + ' -> ' + f.Divergence());
});

test('no flow or smoke inside solid cells, nothing crosses a wall', () => {
  const f = room(40, 20);
  for (let y = 0; y < 20; ++y) for (let x = 19; x < 23; ++x) f.Solid[y * 40 + x] = 1;
  for (let i = 0; i < 100; ++i) { f.Burst(10, 10, 6, 40, 1, 1); f.Step(FX_STEP); }
  let leak = 0;
  for (let y = 0; y < 20; ++y) {
    for (let x = 0; x < 40; ++x) {
      const i = y * 40 + x;
      if (f.Solid[i]) assert.strictEqual(f.U[i] + f.V[i] + f.Smoke[i], 0);
      else if (x >= 23) leak += f.Smoke[i];
    }
  }
  assert.strictEqual(leak, 0);
  assert.ok(f.Activity().Smoke > 0.5, 'smoke should spread on the open side');
});

test('wind decays and the fluid stays finite', () => {
  const f = room(30, 30);
  f.Burst(15, 15, 6, 50, 1, 1);
  for (let i = 0; i < 500; ++i) f.Step(FX_STEP);
  const a = f.Activity();
  assert.ok(isFinite(a.Speed) && isFinite(a.Smoke));
  assert.ok(a.Speed < 0.5);
});

test('particles never end up inside a solid tile', () => {
  const ps = new ParticleSystem(100);
  const solid = (x, y) => x < 0 || y < 0 || x >= 100 || y >= 100 || (x >= 40 && x < 60);
  for (let i = 0; i < 80; ++i) ps.Add({ x: 20 + (i % 10), y: 50, vx: 150 + i, vy: (i % 7 - 3) * 40, z: 5, vz: 80, life: 5, color: '#fff' });
  for (let t = 0; t < 200; ++t) {
    ps.Step(0.02, (x, y, w) => { w[0] = 0; w[1] = 0; }, solid);
    ps.List.forEach(p => assert.ok(!solid(p.x, p.y)));
  }
  assert.ok(ps.List.length > 0);
});

test('particles bounce, settle and expire', () => {
  const ps = new ParticleSystem(10);
  ps.Add({ x: 5, y: 5, vx: 0, vy: 0, z: 20, vz: 0, life: 3, color: '#fff' });
  const p = ps.List[0];
  for (let t = 0; t < 200; ++t) ps.Step(0.01, (x, y, w) => { w[0] = 0; w[1] = 0; }, () => false);
  assert.strictEqual(p.z, 0);
  for (let t = 0; t < 200; ++t) ps.Step(0.01, (x, y, w) => { w[0] = 0; w[1] = 0; }, () => false);
  assert.strictEqual(ps.List.length, 0);
});

test('the particle cap drops the oldest', () => {
  const ps = new ParticleSystem(5);
  for (let i = 0; i < 9; ++i) ps.Add({ x: i, y: 0, vx: 0, vy: 0, life: 1, color: '#fff' });
  assert.strictEqual(ps.List.length, 5);
  assert.strictEqual(ps.List[0].x, 4);
});

// ---- the controller on a tiny fake game ----
function game(rows) {
  const g = { rows: rows, ents: [] };
  g.env = {
    Walls: () => g.rows, BlockWidth: 17, BlockHeight: 17, Entities: () => g.ents, BrickColors: () => ['#b05030']
  };
  return g;
}
const EMPTY = ['00000', '0   0', '0 1 0', '0   0', '00000'];
function run(c, seconds) { for (let t = 0; t < seconds / 0.01; ++t) c.Tick(0.01); }
function explosion(id, tx, ty) { return { ID: id, Type: 'Explosion', X: tx * 17, Y: ty * 17 }; }

test('a broken brick next to an explosion crumbles into fragments that stay out of walls', () => {
  const g = game(EMPTY);
  const c = new FxController(g.env);
  run(c, 0.1);
  g.ents.push(explosion(1, 2, 2));
  g.rows = EMPTY.slice(); g.rows[2] = '0   0';
  run(c, 0.1);
  assert.ok(c.Particles.List.length >= 14, 'fragments: ' + c.Particles.List.length);
  assert.ok(c.Fluid.Activity().Speed > 1, 'the blast should move the air');
  for (let i = 0; i < 300; ++i) { c.Tick(0.01); c.Particles.List.forEach(p => assert.ok(!c.SolidAtPx(p.x, p.y))); }
});

test('the explosion may show up after the wall change (LAN guest) but not much later', () => {
  const g = game(EMPTY);
  const c = new FxController(g.env);
  run(c, 0.1);
  g.rows = EMPTY.slice(); g.rows[2] = '0   0';
  run(c, 0.2);
  assert.strictEqual(c.Particles.List.length, 0);
  g.ents.push(explosion(7, 2, 2));
  run(c, 0.1);
  assert.ok(c.Particles.List.length >= 14);
});

test('a brick that vanishes without any explosion makes no fragments', () => {
  const g = game(EMPTY);
  const c = new FxController(g.env);
  run(c, 0.1);
  g.rows = EMPTY.slice(); g.rows[2] = '0   0';
  run(c, 1.5);
  assert.strictEqual(c.Particles.List.length, 0);
});

test('a whole new level resets instead of exploding', () => {
  const big = (fill) => Array.from({ length: 14 }, (_, y) => (y == 0 || y == 13) ? '0'.repeat(14) : '0' + fill.repeat(12) + '0');
  const g = game(big('1'));
  const c = new FxController(g.env);
  run(c, 0.1);
  g.ents.push(explosion(1, 2, 2));
  run(c, 0.05);
  g.rows = big(' ');
  g.ents = [];
  run(c, 0.05);
  assert.strictEqual(c.Particles.List.length, 0);
});

test('a destroyed ice block throws shards', () => {
  const g = game(EMPTY);
  const c = new FxController(g.env);
  g.ents.push({ ID: 5, Type: 'IceBlock', X: 17, Y: 17 });
  run(c, 0.1);
  g.ents = [];
  run(c, 0.05);
  assert.ok(c.Particles.List.length >= 10);
});

test('effects never touch Math.random', () => {
  const real = Math.random;
  let calls = 0;
  Math.random = () => { ++calls; return real(); };
  try {
    const g = game(EMPTY);
    const c = new FxController(g.env);
    run(c, 0.1);
    g.ents.push(explosion(1, 2, 2));
    g.rows = EMPTY.slice(); g.rows[2] = '0   0';
    run(c, 0.5);
  } finally { Math.random = real; }
  assert.strictEqual(calls, 0);
});

test('stepping a busy fluid on the real grid size is cheap', () => {
  const f = new FluidSolver(27 * FX_CELLS_PER_TILE, 19 * FX_CELLS_PER_TILE);
  const start = process.hrtime.bigint();
  for (let i = 0; i < 50; ++i) { f.Burst(50, 40, 6, 30, 0.5, 1); f.Step(FX_STEP); }
  const ms = Number(process.hrtime.bigint() - start) / 1e6 / 50;
  assert.ok(ms < 10, 'ms per step: ' + ms);
});

// ---- the collision grid ----
test('the collision grid knows walls and flagged entities, and bumps its version only on change', () => {
  const g = new CollisionGrid(5, 5, 17, 17);
  const rows = ['00000', '0   0', '0 1 0', '0   0', '00000'];
  g.Update(rows, []);
  const v = g.Version;
  assert.ok(g.IsSolidTile(0, 0) && g.IsSolidTile(2, 2) && !g.IsSolidTile(1, 1));
  assert.ok(g.IsSolidTile(-1, 2) && g.IsSolidTile(9, 9), 'outside counts as solid');
  g.Update(rows, []);
  assert.strictEqual(g.Version, v, 'nothing changed');
  const ice = { X: 17, Y: 17, BlocksFluid: true };
  g.Update(rows, [ice, { X: 34, Y: 34, BlocksFluid: false }]);
  assert.ok(g.IsSolidPx(20, 20) && g.Version > v);
  assert.ok(!g.IsSolidTile(3, 3));
  const v2 = g.Version;
  ice.X = 25;                       // sliding: covers two tiles
  g.Update(rows, [ice]);
  assert.ok(g.IsSolidTile(1, 1) && g.IsSolidTile(2, 1));
  ice.X = 51;
  g.Update(rows, [ice]);
  assert.ok(!g.IsSolidTile(1, 1) && g.IsSolidTile(3, 1) && g.Version > v2);
  g.Update(['00000', '0   0', '0   0', '0   0', '00000'], []);
  assert.ok(!g.IsSolidTile(2, 2));
});

test('an ice block blocks the wind and the fragments, and stops blocking once it is gone', () => {
  const rows = ['0000000', '0     0', '0     0', '0     0', '0000000'];
  const g = game(rows);
  g.ents.push({ ID: 3, Type: 'IceBlock', X: 51, Y: 17, Width: 17, Height: 17, BlocksFluid: true },
    { ID: 4, Type: 'IceBlock', X: 51, Y: 34, Width: 17, Height: 17, BlocksFluid: true },
    { ID: 5, Type: 'IceBlock', X: 51, Y: 51, Width: 17, Height: 17, BlocksFluid: true });
  const c = new FxController(g.env);
  run(c, 0.1);
  assert.ok(c.SolidAtPx(55, 20) && !c.SolidAtPx(20, 20));
  g.ents.push(explosion(9, 1, 2));
  run(c, 0.6);
  let leak = 0;
  const f = c.Fluid;
  for (let y = 0; y < f.H; ++y) for (let x = 4 * FX_CELLS_PER_TILE; x < f.W; ++x) leak += f.Smoke[y * f.W + x];
  assert.strictEqual(leak, 0, 'smoke must not pass the ice wall');
  g.ents = g.ents.filter(e => e.Type != 'IceBlock');
  run(c, 0.1);
  assert.ok(!c.SolidAtPx(55, 20));
});

test('every flame darkens the ground, most in the middle of the blast, and a new level clears it', () => {
  const rows = Array.from({ length: 10 }, (_, y) => (y == 0 || y == 9) ? '0'.repeat(14) : '0' + ' '.repeat(12) + '0');
  const g = game(rows);
  const marks = [];
  let cleared = 0;
  g.env.Scorch = (x, y, a, r) => marks.push({ tx: Math.floor(x / 17), ty: Math.floor(y / 17), a, r });
  g.env.ClearScorch = () => ++cleared;
  const c = new FxController(g.env);
  run(c, 0.1);
  const base = cleared, before = marks.length;
  [[4, 3], [3, 3], [5, 3], [2, 3], [6, 3], [4, 2], [4, 4]].forEach(([x, y], i) => g.ents.push(explosion(20 + i, x, y)));
  run(c, 0.1);
  const fresh = marks.slice(before);
  assert.strictEqual(fresh.length, 7);
  const centre = fresh.find(m => m.tx == 4 && m.ty == 3), tip = fresh.find(m => m.tx == 6 && m.ty == 3);
  assert.ok(centre.a > tip.a && tip.a > 0 && centre.a < 0.15, 'very slight: ' + centre.a);
  g.rows = rows.map(() => '0'.repeat(14));
  g.ents = [];
  run(c, 0.1);
  assert.ok(cleared > base);
});

test('a skull that breaks open into an enemy lets out blue dust and wind; a picked up skull does not', () => {
  const skull = { ID: 5, Type: 'PowerUp', X: 17, Y: 17, Sprite: { GetActualFrame: () => 165 } };
  const g = game(EMPTY);
  g.ents.push(skull);
  const c = new FxController(g.env);
  run(c, 0.1);
  g.ents = [{ ID: 6, Type: 'Enemy', X: 17, Y: 17 }];
  run(c, 0.1);
  const dust = c.Particles.List.filter(p => p.kind == 'dust');
  assert.ok(dust.length >= 40, 'dust: ' + dust.length);
  assert.ok(dust.every(p => /^#/.test(p.color) && parseInt(p.color.slice(5, 7), 16) > parseInt(p.color.slice(1, 3), 16)), 'blue');
  assert.ok(c.Fluid.Activity().Speed > 0.5, 'a gust');

  const g2 = game(EMPTY);
  g2.ents.push({ ID: 5, Type: 'PowerUp', X: 17, Y: 17, Sprite: { GetActualFrame: () => 165 } });
  const c2 = new FxController(g2.env);
  run(c2, 0.1);
  g2.ents = [];
  run(c2, 0.1);
  assert.strictEqual(c2.Particles.List.filter(p => p.kind == 'dust').length, 0);
});

test('a skull that blows up and any pickup a blast destroys crumble into blue dust', () => {
  const blue = p => p.kind == 'dust' && parseInt(p.color.slice(5, 7), 16) > parseInt(p.color.slice(1, 3), 16);
  [165, 163].forEach(frame => {
    const g = game(EMPTY);
    g.ents.push({ ID: 5, Type: 'PowerUp', X: 17, Y: 17, Sprite: { GetActualFrame: () => frame } });
    const c = new FxController(g.env);
    run(c, 0.1);
    g.ents = [explosion(8, 1, 1)];
    run(c, 0.1);
    const dust = c.Particles.List.filter(blue).length;
    assert.ok(dust >= 20, 'frame ' + frame + ' dust: ' + dust);
  });
});

test('the flames are coloured by the player whose bomb made them', () => {
  const hue = c => { const f = c.Fluid; let r = 0, g = 0, b = 0; for (let i = 0; i < f.Heat.length; ++i) { r += f.HeatR[i]; g += f.HeatG[i]; b += f.HeatB[i]; } return [r, g, b]; };
  const blast = owner => {
    const g = game(EMPTY);
    g.env.OwnerIndex = e => (e.OwnerPlayer === undefined ? -1 : e.OwnerPlayer);
    const c = new FxController(g.env);
    run(c, 0.1);
    g.ents.push(Object.assign(explosion(1, 2, 3), owner === undefined ? {} : { OwnerPlayer: owner }));
    run(c, 0.1);
    return hue(c);
  };
  const [br, bg, bb] = blast(1), [rr, rg, rb] = blast(2), [or, og, ob] = blast(undefined);
  assert.ok(bb > br && bb > bg, 'player 2 (blue) burns blue');
  assert.ok(rr > rb && rr > rg, 'player 3 (red) burns red');
  assert.ok(or > og && og > ob, "nobody's flames stay orange");
});

test('a blast with more flames makes more smoke', () => {
  const smoke = flames => {
    const rows = ['0'.repeat(15), ...Array.from({ length: 5 }, () => '0' + ' '.repeat(13) + '0'), '0'.repeat(15)];
    const g = game(rows);
    const c = new FxController(g.env);
    run(c, 0.1);
    for (let i = 0; i < flames; ++i) g.ents.push(explosion(10 + i, 2 + i, 3));
    run(c, 0.1);
    return c.Fluid.Smoke.reduce((a, b) => a + b, 0) / flames;
  };
  assert.ok(smoke(9) > smoke(3) * 1.2, 'more flames, more smoke per flame tile and more overall');
});
