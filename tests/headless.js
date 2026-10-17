// Headless game for AI work in Node: loads the browser scripts (index.html order) into a vm context with a do-nothing
// DOM, and plays seeded games as fast as the CPU allows. Like Game/Sim.js, but synchronous, with an A/B mode: roster
// entries "base:<level>" are driven by the frozen baseline AI in tests/ai_baseline/ (the code before a change), so new
// and old bots can fight each other in one game. Developer tool, not a test (tests/aibench.js runs batches).
//
//   const H = require('./headless.js');
//   H.Run({ mode: "battle", arena: 0, roster: ["ai:hard", "base:hard", "ai:hard", "base:hard"], seconds: 300, seed: 1 })

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Test arenas for single skills ("labs"): 27x19 battle maps built from the classic arena (the starting pockets stay open).
// Each is a function (ctx) -> rows; opts.lab names one. Not part of the game.
const LABS = {
	// Wide open lanes: kicked bombs fly far. (Play it with GIVE kick.)
	kick(G)
	{
		const g = G.ArenaGrid();

		G.EachBrick(g, (x, y, mx, my) => { if (!(my % 4 == 1 && mx > 2 && (x * 3 + y) % 7 == 0)) g[y][x] = ' '; });

		return G.ArenaRows(g);
	},
	// Drains in a line of fire: a blast on one comes out of all. Bricks as in Open Field.
	drain(G)
	{
		const g = G.ArenaGrid();

		G.EachBrick(g, (x, y, mx, my) => { if ((mx * 5 + my * 7) % 3 != 0) g[y][x] = ' '; });
		[[5, 3], [9, 5], [13, 9], [17, 13], [21, 15], [5, 15], [21, 3]].forEach(([x, y]) => { g[y][x] = '#'; });

		return G.ArenaRows(g);
	},
	// Dead ends everywhere: the classic arena with every second brick gap filled - traps, hiding and digging.
	maze(G)
	{
		const g = G.ArenaGrid();

		for (let y = 1; y < 18; ++y)
			for (let x = 1; x < 26; ++x)
				if (g[y][x] == ' ' && (x + y) % 5 == 0 && !(x <= 3 && y <= 3) && !(x >= 23 && y <= 3) && !(x <= 3 && y >= 15) && !(x >= 23 && y >= 15) &&
					!(y <= 2 && Math.abs(x - 13) <= 2) && !(y >= 16 && Math.abs(x - 13) <= 2) && !(Math.abs(y - 9) <= 2 && (x <= 2 || x >= 24)))
					g[y][x] = '1';

		return G.ArenaRows(g);
	}
};

// Anything: every property is another stub, calls and `new` give stubs, numbers come out as 0.
function Stub()
{
	const store = {};
	const f = function() {};

	return new Proxy(f, {
		get(t, k)
		{
			if (k === Symbol.toPrimitive) return () => 0;
			if (k === 'then') return undefined;
			if (k === 'length') return 0;
			if (k in store) return store[k];
			if (typeof k === 'symbol') return undefined;
			return (store[k] = Stub());
		},
		set(t, k, v) { store[k] = v; return true; },
		apply() { return Stub(); },
		construct() { return Stub(); }
	});
}

function Scripts()
{
	const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
	const list = [];
	const re = /<script src="([^"]+)"/g;

	for (let m; (m = re.exec(html)); )
		if (m[1] != 'Main.js')
			list.push(m[1]);

	return list;
}

// AiController / AiDecide of the frozen baseline, with every helper private to it (the game's AiBuildView etc. are not
// touched). `dir`: folder with AiWorld.js and AiBrain.js. `set`: { AI_NAME: value } tuning constants to change in it.
function LoadAi(ctx, dir, set)
{
	const src = fs.readFileSync(path.join(dir, 'AiWorld.js'), 'utf8') + '\n' + fs.readFileSync(path.join(dir, 'AiBrain.js'), 'utf8');
	const tweaks = Object.entries(set || {}).map(([k, v]) => k + ' = ' + JSON.stringify(v) + ';').join('\n');

	return vm.runInContext('(function() {\n' + src + '\n' + tweaks + '\nreturn { AiController: AiController, AiDecide: AiDecide, AiBuildView: AiBuildView };\n})()', ctx, { filename: dir + '/AiBrain.js' });
}

// aiDir: load Game/AiWorld.js and Game/AiBrain.js from there instead (a snapshot, so edits during a bench do not leak in)
function CreateGame(aiDir)
{
	const doc = Stub();
	const storage = {};

	doc.getElementById = () => Stub();
	doc.createElement = () => Stub();
	doc.addEventListener = () => {};
	doc.hidden = false;

	const sandbox = {
		console, setTimeout, clearTimeout, setInterval, clearInterval, performance, MessageChannel, URL, Blob,
		document: doc,
		navigator: { getGamepads: () => [], maxTouchPoints: 0, userAgent: 'node' },
		location: { search: '', protocol: 'http:', host: 'localhost' },
		localStorage: { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); }, removeItem: k => { delete storage[k]; } },
		Image: function() { return Stub(); },
		ImageData: function() { return Stub(); },
		fetch: () => new Promise(() => {}),
		requestAnimationFrame: () => 0,
		addEventListener: () => {},
		innerWidth: 1152, innerHeight: 648, devicePixelRatio: 1
	};

	sandbox.window = sandbox;
	sandbox.self = sandbox;

	const ctx = vm.createContext(sandbox);

	for (const file of Scripts())
	{
		const src = aiDir && (file == 'Game/AiWorld.js' || file == 'Game/AiBrain.js') ? path.join(aiDir, path.basename(file)) : path.join(ROOT, file);

		vm.runInContext(fs.readFileSync(src, 'utf8'), ctx, { filename: file });
	}

	vm.runInContext('Engine.Run(document.getElementById("mainCanvas"), new PiNaBlaster(), 10); Engine.SetTurbo(true, { run: false });', ctx);

	return ctx;
}

// SeededRandom of Engine/Turbo.js, with the state readable
function Seeded(seed)
{
	let a = seed >>> 0;

	return function()
	{
		a = (a + 0x6D2B79F5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

let baselineDir = path.join(__dirname, 'ai_baseline');
let aiDir = null, aiSet = null, baseSet = null;

// opts: { mode: "campaign" | "battle", level (campaign), arena (battle: BATTLE_LEVELS index), demo (battle on the demo arena),
//         roster: ["kb0" | "ai:<level>" | "base:<level>"], seconds (default 60), seed, immortal (human seats), single,
//         rounds (battle: stop after this many rounds), baseline (folder of the A/B baseline) }
// Returns { ...Sim.Run's result, players: [{ index, side: "ai" | "base" | "human", level, deaths, own, kills, kickKills,
//           bombs, kicks, reversals, flips, alive }] }
function Run(opts)
{
	const ctx = CreateGame(opts.aiDir || aiDir);
	const G = ctx;

	if (opts.hook)
		opts.hook(ctx);

	const game = G.Engine.Application;
	const mode = opts.mode || 'campaign';
	const seconds = opts.seconds || 60;
	const steps = Math.round(seconds / G.Engine.TickSpeed);
	const seed = opts.seed === undefined ? 1 : opts.seed;
	const roster = opts.roster || ['kb0', 'ai:normal'];
	const base = roster.some(id => id.indexOf('base:') == 0) || opts.humanAi ? LoadAi(ctx, opts.baseline || baselineDir, opts.baseSet || baseSet) : null;

	// tuning constants of the AI under test
	Object.entries(opts.aiSet || aiSet || {}).forEach(([k, v]) => vm.runInContext(k + ' = ' + JSON.stringify(v) + ';', ctx));
	const result = { mode, level: opts.level || 0, arena: opts.arena || 0, seed, seconds: 0, outcome: 'time', kills: 0, enemies: 0, levels: 0,
		hits: [], rounds: [], winner: null, reasons: {} };

	const stats = roster.map((id, i) =>
	{
		const side = id.indexOf('ai:') == 0 ? 'ai' : id.indexOf('base:') == 0 ? 'base' : 'human';

		return { index: i, side, level: side == 'human' ? null : id.split(':')[1], deaths: 0, own: 0, kills: 0, kickKills: 0,
			bombs: 0, kicks: 0, reversals: 0, flips: 0, alive: 0, burned: 0 };
	});

	let done = 0, finished = false, levelNow = -1, enemiesNow = 0;
	const now = () => Math.round(done * G.Engine.TickSpeed * 100) / 100;
	const human = i => stats[i].side == 'human';

	vm.runInContext("Math", ctx).random = Seeded(seed);

	// count every decision (new AI through the global, the baseline through its own copy)
	const realDecide = G.AiDecide;

	function counting(decide)
	{
		return function(view, me, level, rng)
		{
			const plan = decide(view, me, level, rng);
			const r = result.reasons[me.index] = result.reasons[me.index] || {};

			r[plan.reason] = (r[plan.reason] || 0) + 1;

			return plan;
		};
	}

	G.AiDecide = counting(realDecide);

	// baseline seats get the baseline controller; every bot's moves are watched for jitter
	const applyRoster = game.ApplyRoster;

	game.ApplyRoster = function()
	{
		applyRoster.call(this);

		this.Bots = this.Bots.map((bot, i) =>
		{
			// opts.humanAi: a seat the game treats as a human's ("kb0": campaign rules for humans, power-ups they uncover are
			// theirs for a while, ...) played by the original AI at that level - a stand-in for a person who moves about
			if (!bot && opts.humanAi && stats[i].side == 'human')
				return Watch(new base.AiController(opts.humanAi), { index: i, deaths: 0, own: 0, kills: 0, kickKills: 0, bombs: 0, kicks: 0, reversals: 0, flips: 0, alive: 0, burned: 0 });

			if (!bot)
				return bot;

			const level = stats[i].level;
			const ctl = stats[i].side == 'base' ? new base.AiController(level) : bot;

			return Watch(ctl, stats[i]);
		});
	};

	// Jitter: a bot that turns round (opposite direction) within 0.4 s of its last move, and tile flip-flops (A, B, A, B).
	function Watch(ctl, st)
	{
		let lastDir = 0, lastAt = -1, tiles = [];

		return {
			Level: ctl.Level,
			Update: function(delta, player, env)
			{
				const act = ctl.Update(delta, player, env);

				if (player.IsDead)
					return act;

				st.alive += delta;

				const t = now();

				if (act.Dir)
				{
					if (lastDir && act.Dir != lastDir && Math.abs(act.Dir - lastDir) == 2 && t - lastAt < 0.4)
						++st.reversals;

					lastDir = act.Dir;
					lastAt = t;
				}

				if (act.BombPressed && player.Bombs > 0)
					++st.bombs;

				const tile = Math.floor((player.X + player.Width / 2) / player.Width) + ',' + Math.floor((player.Y + player.Height / 2) / player.Height);

				if (!tiles.length || tiles[tiles.length - 1].k != tile)
				{
					tiles.push({ k: tile, t });

					if (tiles.length > 4)
						tiles.shift();

					// A B A B within 1.5 s
					if (tiles.length == 4 && tiles[0].k == tiles[2].k && tiles[1].k == tiles[3].k && t - tiles[0].t < 1.5)
					{
						++st.flips;
						tiles = [tiles[3]];
					}
				}

				return act;
			}
		};
	}

	// Kicks: who set a bomb sliding
	const push = G.GameEntityManager.PushEntitiesAround;

	G.GameEntityManager.PushEntitiesAround = function(e)
	{
		const before = this.Entities.filter(b => b.Type == 'Bomb').map(b => [b, b.Direction]);
		const r = push.call(this, e);

		before.forEach(([b, d]) =>
		{
			if (b.Direction && b.Direction != d && e.Type == 'Player')
			{
				b.__kicker = e.Index;

				if (stats[e.Index])
					++stats[e.Index].kicks;
			}
		});

		return r;
	};

	function cause(p, e)
	{
		const c = G.SimCause(p, e);
		const bomb = e.Owner && e.Owner.Type == 'Bomb' ? e.Owner : null;

		return { cause: c, owner: bomb && bomb.Owner && bomb.Owner.Type == 'Player' ? bomb.Owner.Index : -1, kicker: bomb && bomb.__kicker !== undefined ? bomb.__kicker : -1 };
	}

	function watch()
	{
		const n = G.GameEntityManager.GetNumEntitiesByType('Enemy');

		if (game.LevelNumber !== levelNow)
		{
			if (levelNow >= 0 && mode == 'campaign')
			{
				result.levels++;
				result.kills += enemiesNow;

				if (opts.single)
				{
					result.outcome = 'cleared';
					finished = true;
					return;
				}
			}

			levelNow = game.LevelNumber;
			enemiesNow = n;
			result.enemies += n;

			if (mode == 'campaign' && levelNow == G.CAMPAIGN_END)
			{
				result.outcome = 'won';
				finished = true;
				return;
			}
		}
		else if (n < enemiesNow)
		{
			result.kills += enemiesNow - n;
			enemiesNow = n;
		}

		// power-ups burnt by a bomb's blast (not skulls: those are meant to be blown up), credited to the bomb's owner
		G.GameEntityManager.Entities.forEach(e =>
		{
			if (e.Type != 'PowerUp' || e.__burn)
				return;

			e.__burn = true;

			const touch = e.OnTouch;

			e.OnTouch = function(ent, of)
			{
				const was = this.Health;

				touch.call(this, ent, of);

				if (was > 0 && this.Health <= 0 && ent.Type == 'Explosion' && this.PowerUpType != G.SKULL_TYPE)
				{
					const bomb = ent.Owner, who = bomb && bomb.Type == 'Bomb' && bomb.Owner && bomb.Owner.Type == 'Player' ? bomb.Owner.Index : -1;

					if (who >= 0 && stats[who])
						++stats[who].burned;
				}
			};
		});

		G.PlayerManager.Players.forEach(function(p)
		{
			if (opts.immortal && human(p.Index))
				p.InvulnerableTime = Math.max(p.InvulnerableTime, 1);

			if (p.__sim)
				return;

			p.__sim = true;

			const touch = p.OnTouch;

			p.OnTouch = function(e, of)
			{
				const hearts = p.Hearts, dead = p.IsDead;

				touch.call(p, e, of);

				if (p.Hearts < hearts || (p.IsDead && !dead))
				{
					const c = cause(p, e);
					const st = stats[p.Index];

					result.hits.push({ player: p.Index, bot: !human(p.Index), cause: c.cause, t: now() });

					if (opts.onHit)
						opts.onHit(p, c, now());

					if (p.IsDead && !dead && st)
						++st.deaths;

					if (st && c.owner == p.Index && c.kicker < 0)
						++st.own;

					// credit: whoever kicked the bomb, else whoever dropped it
					const by = c.kicker >= 0 ? c.kicker : c.owner;

					if (by >= 0 && by != p.Index && stats[by])
					{
						++stats[by].kills;

						if (c.kicker >= 0)
							++stats[by].kickKills;
					}
					else if (c.kicker >= 0 && c.kicker == p.Index && st)
						++st.own;
				}
			};
		});

		if (G.Screens.Current())
		{
			if (mode == 'battle' && game.Battle)
			{
				result.rounds.push({ winner: game.RoundWinner, t: Math.round(game.BattleTime * 100) / 100 });

				if (game.Battle.Wins.some(w => w >= game.Battle.Target) || (opts.rounds && result.rounds.length >= opts.rounds))
				{
					result.outcome = 'match';
					result.winner = game.RoundWinner;
					finished = true;
				}
				else
				{
					// (each round on a fresh controller set, like a new level)
					game.StartRound();

					if (opts.give)
						G.PlayerManager.Players.forEach(p => Object.assign(p, opts.give));
				}
			}
			else
			{
				result.outcome = 'gameover';
				finished = true;
			}
		}
	}

	// (a lab is the 7th battle arena)
	if (opts.lab)
	{
		const rows = LABS[opts.lab](G);

		G.BATTLE_LEVELS.push({ Name: opts.lab, Build: () => rows });
		opts.arena = G.BATTLE_LEVELS.length - 1;
	}

	game.ShowTitle();
	game.StartGame(mode, G.RosterFromSources(roster.map(id => id.replace(/^base:/, 'ai:'))), !!opts.demo, opts.arena || 0);

	if (mode == 'campaign' && opts.level)
		game.SetLevel(opts.level);

	G.Screens.Clear();

	// a loadout for everybody (opts.give, e.g. { PushableBombsTime: 1e9, Power: 3 }); re-given after every respawn / round
	if (opts.give)
		G.PlayerManager.Players.forEach(p => Object.assign(p, opts.give));

	watch();

	while (!finished && done < steps)
	{
		G.Engine.Step();
		++done;
		watch();
	}

	result.seconds = now();
	result.players = stats;
	G.AiDecide = realDecide;

	return result;
}

module.exports = { LABS, Run, CreateGame, LoadAi, Stub, setBaseline: d => { baselineDir = d; }, setAiDir: d => { aiDir = d; }, setTweaks: (a, b) => { aiSet = a; baseSet = b; } };

if (require.main === module)
{
	const t0 = Date.now();
	const r = Run({ mode: 'battle', roster: ['ai:hard', 'base:hard', 'ai:hard', 'base:hard'], seconds: 300, seed: 1 });

	console.log(JSON.stringify({ outcome: r.outcome, seconds: r.seconds, rounds: r.rounds, players: r.players }, null, 1));
	console.log('wall ms', Date.now() - t0);
}
