const test = require('node:test');
const assert = require('node:assert');
const S = require('../Net/Snapshot.js');

function ent(id, x, y, extra) {
  return Object.assign({
    ID: id, Layer: 0, X: x, Y: y, Type: 'Thing', Index: 0,
    Sprite: { OffsetX: 0, OffsetY: -4, Alpha: 1, GetActualFrame: () => 7 }
  }, extra || {});
}

test('EncodeEntity / DecodeEntity round trip', () => {
  const e = ent(12, 34, 51, { Layer: 2, Type: 'Player', Index: 3, Sprite: { OffsetX: 1, OffsetY: -4, Alpha: 0.25, GetActualFrame: () => 99 } });
  const a = S.EncodeEntity(e);
  assert.deepStrictEqual(a, [12, 2, 34, 51, 99, 25, 1, -4, 3, 1, 0]);
  assert.deepStrictEqual(S.DecodeEntity(a), { id: 12, layer: 2, x: 34, y: 51, frame: 99, alpha: 0.25, offX: 1, offY: -4, tint: 3, type: 1, owner: 0 });
});

test('only players carry a tint', () => {
  assert.strictEqual(S.EncodeEntity(ent(1, 0, 0, { Index: 2 }))[8], 0);
});

test('EncodePlayer / DecodePlayer keep the fields the HUD reads', () => {
  const p = { Index: 1, X: 10, Y: 20, Lifes: 2, Hearts: 3, InvulnerableTime: 1.234, IsDead: false, TotalBombs: 4, Power: 5,
              SkateTime: 6.66, PushableBombsTime: 0, SuperBombsTime: 0, BadLuckTime: 2, Time: 99 };
  const d = S.DecodePlayer(S.EncodePlayer(p, 'Bob'));
  assert.strictEqual(d.Name, 'Bob');
  assert.strictEqual(d.Index, 1);
  assert.strictEqual(d.Lifes, 2);
  assert.strictEqual(d.IsDead, false);
  assert.strictEqual(d.TotalBombs, 4);
  assert.ok(Math.abs(d.InvulnerableTime - 1.2) < 0.051);
  assert.strictEqual(d.Time, 3); // capped: only used for the 3 s name labels
});

function dec(id, x, y) { return { id, layer: 0, x, y, frame: 1, alpha: 1, offX: 0, offY: 0, tint: 0, type: 0, owner: 0 }; }

test('Interpolator blends between the two snapshots around now - delay', () => {
  const ip = new S.Interpolator(50);
  ip.Push(1000, [dec(1, 0, 0)]);
  ip.Push(1100, [dec(1, 10, 20)]);
  const mid = ip.Sample(1100); // target 1050
  assert.deepStrictEqual([mid[0].x, mid[0].y], [5, 10]);
});

test('Interpolator never extrapolates past the newest snapshot', () => {
  const ip = new S.Interpolator(50);
  ip.Push(1000, [dec(1, 0, 0)]);
  ip.Push(1100, [dec(1, 10, 0)]);
  assert.strictEqual(ip.Sample(5000)[0].x, 10);
});

test('Interpolator before the first snapshot shows the first', () => {
  const ip = new S.Interpolator(50);
  ip.Push(1000, [dec(1, 3, 3)]);
  ip.Push(1100, [dec(1, 9, 9)]);
  assert.strictEqual(ip.Sample(900)[0].x, 3);
});

test('entities appearing and disappearing follow the later snapshot', () => {
  const ip = new S.Interpolator(0);
  ip.Push(0, [dec(1, 0, 0), dec(2, 5, 5)]);
  ip.Push(100, [dec(1, 10, 0), dec(3, 7, 7)]);
  const ids = ip.Sample(50).map(e => e.id).sort();
  assert.deepStrictEqual(ids, [1, 3]);
  const e3 = ip.Sample(50).find(e => e.id === 3);
  assert.strictEqual(e3.x, 7);
});

test('big jumps (respawn, carpets) snap instead of sliding', () => {
  const ip = new S.Interpolator(0);
  ip.Push(0, [dec(1, 0, 0)]);
  ip.Push(100, [dec(1, 300, 0)]);
  assert.strictEqual(ip.Sample(50)[0].x, 300);
});

test('out-of-order and duplicate snapshots are ignored; output is whole pixels', () => {
  const ip = new S.Interpolator(0);
  ip.Push(100, [dec(1, 0, 0)]);
  ip.Push(100, [dec(1, 99, 99)]);
  ip.Push(50, [dec(1, 98, 98)]);
  ip.Push(200, [dec(1, 3, 0)]);
  assert.strictEqual(ip.Sample(100)[0].x, 0);
  const x = ip.Sample(133)[0].x;
  assert.strictEqual(x, Math.round(x));
});

test('old snapshots are pruned', () => {
  const ip = new S.Interpolator(0);
  for (let i = 0; i < 500; i++) ip.Push(i * 33, [dec(1, i, 0)]);
  ip.Sample(500 * 33);
  assert.ok(ip.Size() < 40);
});

test('OccupiedSlots and PlayerIndexOfSlot compact the slot list', () => {
  const slots = [{ client: 1 }, null, { client: 2 }, { client: 1 }];
  assert.deepStrictEqual(S.OccupiedSlots(slots), [0, 2, 3]);
  assert.strictEqual(S.PlayerIndexOfSlot(slots, 2), 1);
  assert.strictEqual(S.PlayerIndexOfSlot(slots, 3), 2);
  assert.strictEqual(S.PlayerIndexOfSlot(slots, 1), -1);
});

test('BuildSnapshot assembles the wire message and only sends walls when they changed', () => {
  const base = {
    seq: 5, timeMs: 1234, level: 3, mode: 'campaign',
    walls: ['000', '0 0'], wallsVersion: 7, lastSentVersion: 7,
    entities: [ent(1, 10, 20)],
    players: [{ Index: 0, X: 1, Y: 2, Lifes: 3, Hearts: 3, InvulnerableTime: 0, IsDead: false, TotalBombs: 1, Power: 1, SkateTime: 0, PushableBombsTime: 0, SuperBombsTime: 0, BadLuckTime: 0, Time: 1 }],
    names: ['Ann'], hud: { title: 'LEVEL 4', keys: 0 }, sounds: ['audioKey'], overlay: null
  };
  const a = S.BuildSnapshot(base);
  assert.strictEqual(a.t, 'snap');
  assert.strictEqual(a.s, 5);
  assert.strictEqual(a.lv, 3);
  assert.deepStrictEqual(a.e, [[1, 0, 10, 20, 7, 100, 0, -4, 0, 0, 0]]);
  assert.strictEqual(a.p[0].n, 'Ann');
  assert.deepStrictEqual(a.snd, ['audioKey']);
  assert.strictEqual('w' in a, false);
  const b = S.BuildSnapshot(Object.assign({}, base, { lastSentVersion: 6 }));
  assert.deepStrictEqual(b.w, ['000', '0 0']);
  assert.strictEqual(b.wv, 7);
});

test('BuildSnapshot skips invisible entities and entities without sprites', () => {
  const hidden = ent(2, 0, 0); hidden.Sprite.Visible = false;
  const none = ent(3, 0, 0); none.Sprite = null;
  const s = S.BuildSnapshot({ seq: 1, timeMs: 0, level: 0, mode: 'battle', walls: [], wallsVersion: 1, lastSentVersion: 1,
    entities: [ent(1, 0, 0), hidden, none], players: [], names: [], hud: {}, sounds: [], overlay: null });
  assert.deepStrictEqual(s.e.map(x => x[0]), [1]);
});

test('ToProxy builds something the renderer can draw', () => {
  const sheet = { name: 'tinted' };
  const p = S.ToProxy({ id: 4, layer: 2, x: 10, y: 11, frame: 9, alpha: 0.5, offX: 1, offY: -4, tint: 2 }, (t) => (t ? sheet : null));
  assert.strictEqual(p.X, 10);
  assert.strictEqual(p.Layer, 2);
  assert.strictEqual(p.Sprite.Visible, true);
  assert.strictEqual(p.Sprite.Alpha, 0.5);
  assert.strictEqual(p.Sprite.GetActualFrame(), 9);
  assert.strictEqual(p.Sprite.Sheet, sheet);
  assert.strictEqual(S.ToProxy({ id: 1, layer: 0, x: 0, y: 0, frame: 0, alpha: 1, offX: 0, offY: 0, tint: 0 }, () => sheet).Sprite.Sheet, null);
});

test('ExplosionOwnerIndex: the player behind a bomb, nobody for anything else; it rides the wire and the proxy', () => {
  const player = { Type: 'Player', Index: 2 };
  const own = ent(1, 5, 5, { Type: 'Explosion', Owner: { Type: 'Bomb', Owner: player } });
  assert.strictEqual(S.ExplosionOwnerIndex(own), 2);
  assert.strictEqual(S.ExplosionOwnerIndex(ent(1, 0, 0, { Type: 'Explosion', Owner: { Type: 'Enemy' } })), -1);
  assert.strictEqual(S.ExplosionOwnerIndex(ent(1, 0, 0, { Type: 'Explosion', Owner: { Type: 'SuddenDeath' } })), -1);
  assert.strictEqual(S.ExplosionOwnerIndex(ent(1, 0, 0, { Type: 'Bomb', Owner: player })), -1);
  const wire = S.EncodeEntity(own);
  assert.strictEqual(wire[10], 3);
  assert.strictEqual(S.ToProxy(S.DecodeEntity(wire), () => null).OwnerPlayer, 2);
  assert.strictEqual(S.ToProxy(S.DecodeEntity(S.EncodeEntity(ent(1, 0, 0, { Type: 'Explosion' }))), () => null).OwnerPlayer, -1);
});
