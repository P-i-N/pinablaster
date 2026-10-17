const test = require('node:test');
const assert = require('node:assert');
const A = require('../Game/AiBrain.js');
const { AiWorkerCore } = require('../Game/AiWorker.js');

const ARENA = [
  '000000000',
  '0       0',
  '0 0 0 0 0',
  '0       0',
  '000000000'];
const view = extra => Object.assign({ w: 9, h: 5, walls: ARENA, bombs: [], fire: [], blocked: [], enemies: [],
  powerups: [], keys: [], players: [{ x: 1, y: 1, index: 0 }, { x: 3, y: 1, index: 1 }], keyFlags: 0, mode: 'battle' }, extra);
const bot = (x, y, extra) => Object.assign({ X: x, Y: y, Width: 17, Height: 17, Index: 0, IsDead: false, Lifes: 0, Speed: 1, Power: 2,
  Bombs: 1, SuperBombsTime: 0, BadLuckFlags: 0 }, extra);
const never = () => 1;

// A worker that runs AiWorkerCore here. Answers wait for deliver(), as in a real worker.
function fakeWorker() {
  const w = { sent: [], out: [], terminated: false, onmessage: null, onerror: null };
  const core = new AiWorkerCore(m => w.out.push(JSON.parse(JSON.stringify(m))), A.AiDecide, A.AI_LEVELS, never);
  w.postMessage = m => { w.sent.push(m); core.Handle(JSON.parse(JSON.stringify(m))); };   // (what a real worker would receive: a copy)
  w.deliver = () => { while (w.out.length) w.onmessage({ data: w.out.shift() }); };
  w.terminate = () => { w.terminated = true; };
  return w;
}

test('AiWorkerCore answers a plan request with the plan AiDecide makes, tagged with the request id', () => {
  const out = [];
  const core = new AiWorkerCore(m => out.push(m), A.AiDecide, A.AI_LEVELS, never);
  const me = { x: 1, y: 1, index: 0, speed: 1, power: 2, bombs: 1, superBomb: false };
  core.Handle({ t: 'plan', id: 7, view: view(), me, level: 'hard' });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].id, 7);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out[0].plan)), JSON.parse(JSON.stringify(A.AiDecide(view(), me, A.AI_LEVELS.hard, never))));
  assert.strictEqual(out[0].plan.bomb, true);   // an opponent in line
});

test('AiWorkerCore reports a failing plan instead of dying', () => {
  const out = [];
  const core = new AiWorkerCore(m => out.push(m), () => { throw new Error('boom'); }, A.AI_LEVELS, never);
  core.Handle({ t: 'plan', id: 1, view: {}, me: {}, level: 'normal' });
  assert.strictEqual(out[0].t, 'error');
  assert.match(out[0].message, /boom/);
});

test('a threaded bot keeps still until its worker answers, then acts on the plan', () => {
  const w = fakeWorker();
  const c = new A.AiController('hard', never, () => w);
  const p = bot(17, 17);
  const env = { View: () => view(), BombCount: () => 0 };
  assert.strictEqual(c.Update(0.01, p, env).BombPressed, false);   // asked, no answer yet
  assert.strictEqual(w.sent.length, 1);
  assert.strictEqual(w.sent[0].level, 'hard');
  assert.strictEqual(c.Update(0.01, p, env).BombPressed, false);
  assert.strictEqual(w.sent.length, 1);                            // one request at a time
  w.deliver();
  assert.strictEqual(c.Update(0.01, p, env).BombPressed, true);    // the answer: bomb
});

test('a threaded bot goes on along its old path while it waits for the next plan', () => {
  const w = fakeWorker();
  const c = new A.AiController('hard', never, () => w);
  const p = bot(17, 17);
  const env = { View: () => view({ players: [{ x: 1, y: 1, index: 0 }], powerups: [{ x: 1, y: 3, type: 1 }] }), BombCount: () => 0 };
  c.Update(0.01, p, env);
  w.deliver();
  assert.strictEqual(c.Update(0.01, p, env).Dir, 3);
  for (let t = 0; t < 20; ++t) assert.strictEqual(c.Update(0.01, p, env).Dir, 3);   // thinks again meanwhile, keeps walking
  assert.ok(w.sent.length >= 2);
});

test('an answer for a tile the bot has left is dropped (a bomb is only for the tile it was planned on) and asked again', () => {
  const w = fakeWorker();
  const c = new A.AiController('hard', never, () => w);
  const env = { View: () => view(), BombCount: () => 0 };
  const p = bot(17, 17);
  c.Update(0.01, p, env);
  w.deliver();
  p.X = 34;   // moved on to (2,1)
  const act = c.Update(0.01, p, env);
  assert.strictEqual(act.BombPressed, false);
  assert.strictEqual(w.sent.length, 2);
});

test('a path that the bot has partly walked is cut down, not thrown away', () => {
  const w = fakeWorker();
  const c = new A.AiController('hard', never, () => w);
  const env = { View: () => view({ players: [{ x: 1, y: 1, index: 0 }], powerups: [{ x: 1, y: 3, type: 1 }] }), BombCount: () => 0 };
  const p = bot(17, 17);
  c.Update(0.01, p, env);
  w.deliver();
  p.Y = 34;   // already one tile on, at (1,2): the plan's path was [(1,2), (1,3)]
  const act = c.Update(0.01, p, env);
  assert.strictEqual(act.Dir, 3);
  assert.strictEqual(w.sent.length, 1);
});

test('a new bomb while a request is out means a new request as soon as the answer is in', () => {
  const w = fakeWorker();
  const c = new A.AiController('hard', never, () => w);
  let bombs = 0;
  const env = { View: () => view(), BombCount: () => bombs };
  const p = bot(17, 17);
  c.Update(0.01, p, env);
  bombs = 1;
  c.Update(0.01, p, env);
  assert.strictEqual(w.sent.length, 1);
  w.deliver();
  c.Update(0.01, p, env);
  assert.strictEqual(w.sent.length, 2);
});

test('a worker that never answers: after the patience runs out the bot plans for itself', () => {
  const w = fakeWorker();
  w.postMessage = m => { w.sent.push(m); };   // (swallowed)
  const c = new A.AiController('hard', never, () => w);
  const p = bot(17, 17);
  const env = { View: () => view(), BombCount: () => 0 };
  let pressed = false;
  for (let t = 0; t < 100 && !pressed; ++t) pressed = c.Update(0.01, p, env).BombPressed;
  assert.strictEqual(pressed, true);
});

test('a failing worker, no worker threads allowed (turbo), or no worker at all: the bot plans in place', () => {
  const env = on => ({ View: () => view(), BombCount: () => 0, Threads: () => on });
  const w = fakeWorker();
  assert.strictEqual(new A.AiController('hard', never, () => w).Update(0.01, bot(17, 17), env(false)).BombPressed, true);
  assert.strictEqual(w.sent.length, 0);
  assert.strictEqual(new A.AiController('hard', never, () => { throw new Error('no workers'); }).Update(0.01, bot(17, 17), env(true)).BombPressed, true);
  const w2 = fakeWorker();
  const c = new A.AiController('hard', never, () => w2);
  c.Update(0.01, bot(17, 17), env(true));
  w2.onerror();
  assert.strictEqual(c.Update(0.01, bot(17, 17), env(true)).BombPressed, true);
});

test('Dispose stops the worker; a new level (a new player entity) forgets the request', () => {
  const w = fakeWorker();
  const c = new A.AiController('hard', never, () => w);
  const env = { View: () => view(), BombCount: () => 0 };
  c.Update(0.01, bot(17, 17), env);
  const next = bot(17, 17);   // another Player entity: a new level
  w.deliver();
  c.Update(0.01, next, env);
  assert.strictEqual(w.sent.length, 2);
  c.Dispose();
  assert.strictEqual(w.terminated, true);
});
