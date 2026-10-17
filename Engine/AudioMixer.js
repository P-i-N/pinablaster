// Web Audio mixer: decoded buffers, one source node per play, buses, voice cap.

var SOUND_FILES =
{
	audioBombDrop: "bomb_drop",
	audioExplosion1: "explosion_1", audioExplosion2: "explosion_2", audioExplosion3: "explosion_3",
	audioExplosion4: "explosion_4", audioExplosion5: "explosion_5",
	audioPickUp: "pick_up", audioPoop: "poop", audioHit: "hit", audioDie: "die",
	audioShield: "shield", audioShot: "shot", audioShoopDaWhoop: "shoop_da_whoop",
	audioDoor: "door", audioKey: "key", audioOutro: "outro",
	audioIcebreak1: "icebreak_1", audioIcebreak2: "icebreak_2", audioIcebreak3: "icebreak_3", audioIcebreak4: "icebreak_4"
};

var MUSIC_IDS = { audioOutro: true };

var VOICE_CAPS = { audioExplosion: 6, audioIcebreak: 3, audioPoop: 3 };
var DEFAULT_VOICE_CAP = 4;
var PITCH_JITTER = 0.04;

function GroupOf(id)
{
	return id.replace(/\d+$/, "");
}

function JitterRate(r, amount)
{
	return 1 + (r * 2 - 1) * amount;
}

function VoicePool(caps, defaultCap)
{
	var voices = {};

	function list(id)
	{
		var g = GroupOf(id);
		if (!voices[g]) voices[g] = [];
		return voices[g];
	}

	function cap(id)
	{
		var c = caps[GroupOf(id)];
		return c ? c : defaultCap;
	}

	// Returns the oldest voice that must be stopped to make room, or null.
	this.Add = function(id, voice)
	{
		var l = list(id);
		var stolen = null;

		if (l.length >= cap(id))
			stolen = l.shift();

		l.push(voice);
		return stolen;
	}

	this.Remove = function(id, voice)
	{
		var l = list(id);
		var i = l.indexOf(voice);
		if (i >= 0) l.splice(i, 1);
	}

	this.Count = function(id)
	{
		return list(id).length;
	}
}

function AudioMixerPrototype()
{
	var ctx = null;
	var master = null, sfx = null, music = null;
	var buffers = {};
	var playing = {};
	var pool = new VoicePool(VOICE_CAPS, DEFAULT_VOICE_CAP);
	var volumes = { master: 0.8, sfx: 1.0, music: 0.6 };

	this.IsReady = function() { return ctx != null; }
	this.IsRunning = function() { return ctx != null && ctx.state == "running"; }

	this.GetVolume = function(bus) { return volumes[bus]; }

	var muted = false;

	this.SetVolume = function(bus, v)
	{
		v = Math.max(0, Math.min(1, v));
		volumes[bus] = v;

		if (!ctx) return;

		var node = bus == "master" ? master : (bus == "sfx" ? sfx : music);
		node.gain.value = bus == "master" && muted ? 0 : v;
	}

	// Mutes everything without touching the volume settings.
	this.SetMuted = function(on)
	{
		muted = !!on;

		if (ctx)
			master.gain.value = muted ? 0 : volumes.master;
	}

	this.IsMuted = function() { return muted; }

	this.ActiveVoices = function(id) { return pool.Count(id); }

	function load(id, base)
	{
		function get(ext)
		{
			return fetch("Media/" + base + "." + ext)
				.then(function(r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
				.then(function(data) { return ctx.decodeAudioData(data); });
		}

		return get("wav").catch(function() { return get("mp3"); })
			.then(function(buf) { buffers[id] = buf; })
			.catch(function() { /* this sound stays silent */ });
	}

	this.Resume = function()
	{
		if (ctx && ctx.state == "suspended")
			ctx.resume();
	}

	this.Init = function()
	{
		var AC = window.AudioContext || window.webkitAudioContext;

		if (!AC)
			return false;

		ctx = new AC();

		var limiter = ctx.createDynamicsCompressor();
		limiter.threshold.value = -14;
		limiter.knee.value = 12;
		limiter.ratio.value = 8;
		limiter.attack.value = 0.003;
		limiter.release.value = 0.2;
		limiter.connect(ctx.destination);

		master = ctx.createGain();
		sfx = ctx.createGain();
		music = ctx.createGain();
		sfx.connect(master);
		music.connect(master);
		master.connect(limiter);

		master.gain.value = volumes.master;
		sfx.gain.value = volumes.sfx;
		music.gain.value = volumes.music;

		for (var id in SOUND_FILES)
			load(id, SOUND_FILES[id]);

		var self = this;
		["keydown", "pointerdown", "touchstart"].forEach(function(name)
		{
			document.addEventListener(name, function() { self.Resume(); });
		});

		return true;
	}

	this.Play = function(id)
	{
		var buf = buffers[id];

		if (!ctx || !buf || ctx.state != "running")
			return;

		var isMusic = !!MUSIC_IDS[id];
		var src = ctx.createBufferSource();
		src.buffer = buf;
		src.loop = isMusic;

		if (!isMusic)
			src.playbackRate.value = JitterRate(Math.random(), PITCH_JITTER);

		src.connect(isMusic ? music : sfx);

		var stolen = pool.Add(id, src);
		if (stolen) { try { stolen.stop(); } catch (e) {} }

		if (!playing[id]) playing[id] = [];
		playing[id].push(src);

		src.onended = function()
		{
			pool.Remove(id, src);
			playing[id].remove(src);
		};

		src.start();
	}

	// Stop every active voice of exactly this id (used for the music loop).
	this.Stop = function(id)
	{
		var l = playing[id];

		if (!l) return;

		for (var i = 0; i < l.length; ++i)
		{
			try { l[i].stop(); } catch (e) {}
		}
	}
}

var AudioMixer = new AudioMixerPrototype();

if (typeof module !== 'undefined')
	module.exports = { VoicePool: VoicePool, GroupOf: GroupOf, JitterRate: JitterRate };
