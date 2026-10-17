const test = require('node:test');
const assert = require('node:assert');
const { FluidSolver } = require('../Game/Fluid.js');
const { FluidProxy } = require('../Game/FluidProxy.js');
const { FluidWorkerCore } = require('../Game/FluidWorker.js');
globalThis.FluidSolver = FluidSolver;
globalThis.ParticleSystem = require('../Game/Particles.js').ParticleSystem;
globalThis.CollisionGrid = require('../Game/CollisionGrid.js').CollisionGrid;
globalThis.PLAYER_FLAME_COLORS = require('../Engine/Tint.js').PLAYER_FLAME_COLORS;
const { FxController, FX_STEP, FX_CELLS_PER_TILE } = require('../Game/Fx.js');

// A worker that runs FluidWorkerCore here. auto: answer at once; otherwise frames wait for deliver().
function fakeWorker(auto) {
  const w = { sent: [], queue: [], onmessage: null, onerror: null, terminated: false };
  const core = new FluidWorkerCore(
    (msg, transfer) => { w.queue.push(msg); if (auto) w.deliver(); },
    (cw, ch) => new FluidSolver(cw, ch));
  w.postMessage = (msg, transfer) => { w.sent.push(msg); core.Handle(msg); };
  w.deliver = () => { const m = w.queue.shift(); if (m && w.onmessage) w.onmessage({ data: m }); return !!m; };
  w.terminate = () => { w.terminated = true; };
  return w;
}

test('the proxy queues commands and steps, and the frame brings back wind, activity and pictures', () => {
  const w = fakeWorker(false);
  const p = new FluidProxy(40, 30, () => w);
  p.Burst(20, 15, 8, 10, 1, 1, 60, null);
  assert.strictEqual(p.Settled(), false);
  p.Step(FX_STEP);
  assert.strictEqual(w.sent.length, 2, 'init + one step request');
  assert.strictEqual(w.sent[1].cmds.length, 1);
  assert.ok(w.sent[1].solid, 'the obstacles go along with the first request');
  assert.strictEqual(p.Activity().Speed, 0, 'nothing back yet');
  assert.ok(w.deliver());
  assert.ok(p.Activity().Speed > 0.5 && p.U.some(v => v != 0), 'the blast moves the air');
  assert.strictEqual(p.TakeFresh(), true);
  assert.strictEqual(p.TakeFresh(), false);
  const smoke = new Uint8ClampedArray(40 * 30 * 4), glow = new Uint8ClampedArray(40 * 30 * 4);
  p.RenderImages(smoke, glow);
  assert.ok(smoke.some(v => v > 0) && glow.some(v => v > 0));
});

test('steps asked for while the worker is busy are combined into one request, at most three', () => {
  const w = fakeWorker(false);
  const p = new FluidProxy(20, 20, () => w);
  p.Step(FX_STEP);
  for (let i = 0; i < 6; ++i) p.Step(FX_STEP);
  assert.strictEqual(w.sent.length, 2, 'only the first request went out');
  w.deliver();
  assert.strictEqual(w.sent.length, 3);
  assert.strictEqual(w.sent[2].steps, 3);
  assert.strictEqual(w.sent[2].solid, null, 'obstacles only when they changed');
  p.MarkSolidChanged();
  w.deliver();
  p.Step(FX_STEP);
  assert.ok(w.sent[w.sent.length - 1].solid);
});

test('Settled: false until a frame covers everything asked, then true once the fluid is quiet', () => {
  const w = fakeWorker(true);
  const p = new FluidProxy(30, 30, () => w);
  p.Burst(15, 15, 6, 10, 1, 1, 40, null);
  p.Step(FX_STEP);
  assert.strictEqual(p.Settled(), false, 'still moving');
  for (let i = 0; i < 400 && !p.Settled(); ++i) p.Step(FX_STEP);
  assert.strictEqual(p.Settled(), true);
});

test('Clear drops what was queued, zeroes the picture and tells the worker to clear', () => {
  const w = fakeWorker(false);
  const p = new FluidProxy(20, 20, () => w);
  p.Burst(10, 10, 5, 10, 1, 1, 40, null);
  p.Clear();
  p.Step(FX_STEP);
  assert.deepStrictEqual(w.sent[1].cmds, [['c']]);
});

test('buffers of spent frames go back to the worker for reuse', () => {
  const w = fakeWorker(true);
  const p = new FluidProxy(20, 20, () => w);
  for (let i = 0; i < 5; ++i) p.Step(FX_STEP);
  assert.ok(w.sent.slice(1).some(m => m.recycle.length == 4), 'a request handed four buffers back');
});

test('Dispose stops and terminates the worker; an error marks the proxy as failed', () => {
  const w = fakeWorker(true);
  const p = new FluidProxy(20, 20, () => w);
  w.onerror();
  assert.strictEqual(p.Failed, true);
  p.Dispose();
  assert.strictEqual(w.terminated, true);
});

// the controller with its fluid in a (fake) worker behaves like the one with the fluid in-process
const EMPTY = ['00000', '0   0', '0 1 0', '0   0', '00000'];
function game(rows) {
  const g = { rows: rows, ents: [] };
  g.env = { Walls: () => g.rows, BlockWidth: 17, BlockHeight: 17, Entities: () => g.ents, BrickColors: () => ['#b05030'] };
  return g;
}
const run = (c, seconds) => { for (let t = 0; t < seconds / 0.01; ++t) c.Tick(0.01); };

test('a blast with the fluid in a worker still moves the air, crumbles bricks and settles', () => {
  const g = game(EMPTY);
  const w = fakeWorker(true);
  g.env.CreateFluid = (cw, ch) => new FluidProxy(cw, ch, () => w);
  const c = new FxController(g.env);
  run(c, 0.1);
  g.ents.push({ ID: 1, Type: 'Explosion', X: 34, Y: 34 });
  g.rows = EMPTY.slice(); g.rows[2] = '0   0';
  run(c, 0.2);
  assert.ok(c.Particles.List.length >= 14, 'fragments');
  assert.ok(c.Fluid.Activity().Speed > 0.5, 'wind');
  assert.ok(w.sent.some(m => m.t == 'step' && m.solid), 'the obstacle cells reached the worker');
  assert.strictEqual(c.Dirty, true);
  g.ents = [];
  run(c, 6);
  assert.strictEqual(c.Fluid.Settled(), true);
});
