// Pure helpers for LAN games (no DOM): entity / player codecs, interpolation, slot mapping.

// Entity types, sent as an index so a guest can tell what it is looking at (visual effects). 0 = unknown.
var ENTITY_TYPES = ["", "Player", "Enemy", "Bomb", "Explosion", "IceBlock", "PowerUp", "HotWall", "DeadEnemy", "Drain", "Key", "MagicCarpet", "Shot"];

// The index of the player whose bomb made an explosion (-1: nobody's, or not an explosion).
function ExplosionOwnerIndex(e)
{
	var o = e.Owner;

	if (e.Type != "Explosion" || !o)
		return -1;

	if (o.Type == "Bomb")
		o = o.Owner;

	return o && o.Type == "Player" ? o.Index : -1;
}

// Entity wire format: [id, layer, x, y, frame, alpha*100, offsetX, offsetY, tint, type, owner + 1 (explosions)]
function EncodeEntity(e)
{
	return [
		e.ID, e.Layer, e.X, e.Y,
		e.Sprite.GetActualFrame(),
		Math.round(e.Sprite.Alpha * 100),
		e.Sprite.OffsetX, e.Sprite.OffsetY,
		e.Type == "Player" ? e.Index : 0,
		Math.max(0, ENTITY_TYPES.indexOf(e.Type)),
		ExplosionOwnerIndex(e) + 1
	];
}

function DecodeEntity(a)
{
	return { id: a[0], layer: a[1], x: a[2], y: a[3], frame: a[4], alpha: a[5] / 100, offX: a[6], offY: a[7], tint: a[8], type: a[9] || 0, owner: a[10] || 0 };
}

function round1(v)
{
	return Math.round(v * 10) / 10;
}

// Only what the HUD and the name labels read.
function EncodePlayer(p, name)
{
	return {
		i: p.Index, n: name, x: p.X, y: p.Y, L: p.Lifes, H: p.Hearts, v: round1(p.InvulnerableTime), d: p.IsDead ? 1 : 0,
		b: p.TotalBombs, p: p.Power, s: round1(p.SkateTime), u: round1(p.PushableBombsTime),
		z: round1(p.SuperBombsTime), l: round1(p.BadLuckTime), t: Math.min(3, round1(p.Time))
	};
}

function DecodePlayer(a)
{
	return {
		Index: a.i, Name: a.n, X: a.x, Y: a.y, Width: 17, Height: 17, Lifes: a.L, Hearts: a.H, InvulnerableTime: a.v, IsDead: !!a.d,
		TotalBombs: a.b, Power: a.p, SkateTime: a.s, PushableBombsTime: a.u, SuperBombsTime: a.z, BadLuckTime: a.l, Time: a.t
	};
}

// Smooths the ~30 Hz snapshots: renders `delayMs` in the past, linearly between the two
// snapshots around that moment, and never extrapolates.
function Interpolator(delayMs)
{
	var snaps = [];

	var TELEPORT = 40; // px; larger jumps (respawn, magic carpet end) are not smoothed

	function index(list)
	{
		var map = {};

		for (var i = 0; i < list.length; ++i)
			map[list[i].id] = list[i];

		return map;
	}

	this.Size = function() { return snaps.length; }

	this.Push = function(timeMs, entities)
	{
		if (snaps.length && timeMs <= snaps[snaps.length - 1].t)
			return;

		snaps.push({ t: timeMs, list: entities, map: index(entities) });
	}

	function copy(e, x, y)
	{
		return { id: e.id, layer: e.layer, x: Math.round(x), y: Math.round(y), frame: e.frame, alpha: e.alpha, offX: e.offX, offY: e.offY, tint: e.tint, type: e.type, owner: e.owner };
	}

	this.Sample = function(nowMs)
	{
		if (!snaps.length)
			return [];

		var target = nowMs - delayMs;

		while (snaps.length > 2 && snaps[1].t <= target)
			snaps.shift();

		var a = snaps[0];
		var b = snaps.length > 1 ? snaps[1] : null;

		if (target <= a.t || !b)
			return a.list.map(function(e) { return copy(e, e.x, e.y); });

		if (target >= b.t)
			return b.list.map(function(e) { return copy(e, e.x, e.y); });

		var f = (target - a.t) / (b.t - a.t);

		return b.list.map(function(e)
		{
			var prev = a.map[e.id];

			if (!prev || Math.abs(e.x - prev.x) > TELEPORT || Math.abs(e.y - prev.y) > TELEPORT)
				return copy(e, e.x, e.y);

			return copy(e, prev.x + (e.x - prev.x) * f, prev.y + (e.y - prev.y) * f);
		});
	}
}

// A decoded entity -> an object the existing Renderer can draw (it only reads X, Y, Layer and Sprite).
function ToProxy(d, sheetFor, flameFor)
{
	return {
		ID: d.id, Type: ENTITY_TYPES[d.type || 0], BlocksFluid: ENTITY_TYPES[d.type || 0] == "IceBlock", OwnerPlayer: (d.owner || 0) - 1, X: d.x, Y: d.y, Layer: d.layer,
		Sprite: { Visible: true, Alpha: d.alpha, OffsetX: d.offX, OffsetY: d.offY, Sheet: d.tint ? sheetFor(d.tint) : (d.owner && flameFor ? flameFor(d.owner - 1) : null), GetActualFrame: function() { return d.frame; } }
	};
}

// Slots (0-7) that have a player, ascending. A slot's player index is its position in this list.
function OccupiedSlots(slots)
{
	var list = [];

	for (var i = 0; i < slots.length; ++i)
		if (slots[i])
			list.push(i);

	return list;
}

function PlayerIndexOfSlot(slots, slot)
{
	return OccupiedSlots(slots).indexOf(slot);
}

// The host's 30 Hz message. `walls` ride along only when the level geometry changed.
function BuildSnapshot(s)
{
	var entities = [];

	for (var i = 0; i < s.entities.length; ++i)
	{
		var e = s.entities[i];

		if (e.Sprite && e.Sprite.Visible !== false)
			entities.push(EncodeEntity(e));
	}

	var snap =
	{
		t: "snap", s: s.seq, tm: s.timeMs, lv: s.level, mode: s.mode,
		e: entities,
		p: s.players.map(function(p, n) { return EncodePlayer(p, s.names[n] || ""); }),
		hud: s.hud, snd: s.sounds, ov: s.overlay
	};

	if (s.wallsVersion !== s.lastSentVersion)
	{
		snap.w = s.walls;
		snap.wv = s.wallsVersion;
	}

	return snap;
}

if (typeof module !== 'undefined')
	module.exports = { ExplosionOwnerIndex: ExplosionOwnerIndex, EncodeEntity: EncodeEntity, DecodeEntity: DecodeEntity, EncodePlayer: EncodePlayer, DecodePlayer: DecodePlayer,
		Interpolator: Interpolator, BuildSnapshot: BuildSnapshot, ToProxy: ToProxy, OccupiedSlots: OccupiedSlots, PlayerIndexOfSlot: PlayerIndexOfSlot };
