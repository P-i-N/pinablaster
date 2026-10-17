// A/B bench for the CPU players: new AI (Game/) against the frozen baseline (tests/ai_baseline/), seeded, on all cores.
//   node tests/aibench.js battle [seeds=12] [level=hard] [seconds=400]   - 4-player battles, 2 new vs 2 old, every arena,
//                                                                         each seed with the seats swapped as well
//   node tests/aibench.js duel [seeds=12] [level=hard]                   - 1 vs 1
//   node tests/aibench.js campaign [seeds=6] [level=hard]                - each campaign level, 1 immortal human + 2 bots,
//                                                                         new and old separately on the same seeds
// Environment: ALLNEW=1 (every seat the new AI: do games get decided?), ARENAS=0,1 / LEVELS=3,4 (which ones), PLAYERS (battle seats, default 4), PER_ARENA / PER_LEVEL=1 (break
// down), BASE_DIR (the "old" side: a folder with AiWorld.js and AiBrain.js, default tests/ai_baseline - e.g. a snapshot of
// the current AI, to test a tweak head to head), AI_SET / BASE_SET='{"AI_STICKY": 2}' (tuning constants per side).
// Prints totals per side: round wins, deaths (own bomb), kills (by kick), bombs, kicks, jitter (reversals and A-B-A-B tile
// flip-flops per minute alive) and how long a decision takes.

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const fs = require('fs');
const path = require('path');

if (!isMainThread)
{
	const H = require('./headless.js');

	if (workerData.baseline)
		H.setBaseline(workerData.baseline);

	if (workerData.aiDir)
		H.setAiDir(workerData.aiDir);

	H.setTweaks(workerData.aiSet, workerData.baseSet);

	parentPort.on('message', job =>
	{
		if (job == null)
			return process.exit(0);

		const t0 = Date.now();
		let r;

		try { r = H.Run(job); }
		catch (e) { parentPort.postMessage({ error: String(e.stack || e), job }); return; }

		parentPort.postMessage({ job, ms: Date.now() - t0, r: { outcome: r.outcome, seconds: r.seconds, rounds: r.rounds, players: r.players,
			kills: r.kills, enemies: r.enemies, levels: r.levels, hits: r.hits, reasons: r.reasons } });
	});

	return;
}

function RunAll(jobs, opts)
{
	opts = opts || {};

	const n = Math.min(opts.threads || Math.max(1, os.cpus().length - 1), jobs.length);
	const out = [];
	let next = 0, live = n;

	// the AI under test as it is now (Game/ may be edited while the bench runs)
	const aiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aibench-'));

	['AiWorld.js', 'AiBrain.js'].forEach(f => fs.copyFileSync(path.join(__dirname, '..', 'Game', f), path.join(aiDir, f)));

	return new Promise((resolve, reject) =>
	{
		for (let i = 0; i < n; ++i)
		{
			const w = new Worker(__filename, { workerData: { baseline: opts.baseline || process.env.BASE_DIR, aiDir,
				aiSet: process.env.AI_SET ? JSON.parse(process.env.AI_SET) : null, baseSet: process.env.BASE_SET ? JSON.parse(process.env.BASE_SET) : null } });
			const feed = () => w.postMessage(next < jobs.length ? jobs[next++] : null);

			w.on('message', m =>
			{
				if (m.error)
				{
					console.error('job failed', JSON.stringify(m.job), m.error);
					process.exitCode = 1;
				}
				else
					out.push(m);

				if (opts.progress)
					process.stderr.write('.');

				feed();
			});
			w.on('error', reject);
			w.on('exit', () => { if (--live == 0) resolve(out); });
			feed();
		}
	});
}

function Totals(results)
{
	const sides = {};
	const side = s => sides[s] || (sides[s] = { seats: 0, wins: 0, deaths: 0, own: 0, kills: 0, kickKills: 0, bombs: 0, kicks: 0, reversals: 0, flips: 0, alive: 0, burned: 0 });
	let rounds = 0, draws = 0, roundSecs = 0, stale = 0, kills = 0, enemies = 0, levels = 0, gameSecs = 0, ms = 0;

	results.forEach(({ r, ms: t }) =>
	{
		ms += t;
		gameSecs += r.seconds;
		kills += r.kills;
		enemies += r.enemies;
		levels += r.levels;

		r.players.forEach(p =>
		{
			if (p.side == 'human')
				return;

			const s = side(p.side);

			++s.seats;
			['deaths', 'own', 'kills', 'kickKills', 'bombs', 'kicks', 'reversals', 'flips', 'alive', 'burned'].forEach(k => s[k] += p[k]);
		});

		// what the bots died of
		r.hits.forEach(h =>
		{
			const p = r.players[h.player];

			if (!p || p.side == 'human')
				return;

			const c = h.cause == 'own' ? 'byOwn' : /^player/.test(h.cause) ? 'byOpp' : h.cause == 'sudden' ? 'bySudden' : 'byOther';
			const s = side(p.side);

			s[c] = (s[c] || 0) + 1;
		});

		r.rounds.forEach(rd =>
		{
			++rounds;
			roundSecs += rd.t;

			if (rd.t > 125)
				++stale;   // (sudden death had to settle it)

			if (rd.winner >= 0 && r.players[rd.winner])
				++side(r.players[rd.winner].side).wins;
			else
				++draws;
		});
	});

	const table = {};

	for (const k in sides)
	{
		const s = sides[k], min = s.alive / 60;

		table[k] = { seats: s.seats, wins: s.wins, deaths: s.deaths, own: s.own, opp: s.byOpp || 0, sudden: s.bySudden || 0, other: s.byOther || 0,
			kills: s.kills, kickKills: s.kickKills, kicks: s.kicks,
			'bombs/min': +(s.bombs / min).toFixed(1), burnedPU: s.burned, 'rev/min': +(s.reversals / min).toFixed(2), 'flip/min': +(s.flips / min).toFixed(2) };
	}

	return { table, stale, rounds, draws, roundSecs: rounds ? +(roundSecs / rounds).toFixed(1) : 0, kills, enemies, levels,
		speed: +(gameSecs / (ms / 1000)).toFixed(1) };
}

function Seeds(n) { return Array.from({ length: n }, (_, i) => i + 1); }

function BattleJobs(seeds, level, seconds, arenas, players, extra)
{
	const jobs = [];

	arenas.forEach(arena => Seeds(seeds).forEach(seed =>
	{
		[0, 1].forEach(swap =>
		{
			const roster = [];

			for (let i = 0; i < players; ++i)
				roster.push((process.env.ALLNEW ? 'ai:' : (i + swap) % 2 ? 'base:' : 'ai:') + level);

			jobs.push(Object.assign({ mode: 'battle', arena, roster, seconds, seed }, extra || {}));
		});
	}));

	return jobs;
}

function CampaignJobs(seeds, level, seconds, levels)
{
	const jobs = [];
	// COOP=normal: the human seat is played by the original AI at that level (and is mortal): do the bots work with it?
	const coop = process.env.COOP;

	levels.forEach(lv => Seeds(seeds).forEach(seed => ['ai', 'base'].forEach(side =>
		jobs.push({ mode: 'campaign', level: lv, roster: ['kb0', side + ':' + level, side + ':' + level], seconds, seed, immortal: !coop, single: true, tag: side,
			humanAi: coop || undefined }))));

	return jobs;
}

async function Main()
{
	const [what = 'battle', a, b, c] = process.argv.slice(2);
	const t0 = Date.now();

	if (what == 'battle' || what == 'duel')
	{
		const seeds = +(a || 12), level = b || 'hard', seconds = +(c || (what == 'duel' ? 240 : 400));
		// LAB=kick|drain|maze: a test arena instead of the six; GIVE='{"PushableBombsTime":1e9}': everybody starts with that
		const labs = (process.env.LAB || '').split(',').filter(Boolean);
		const arenas = labs.length ? labs : (process.env.ARENAS || '0,1,2,3,4,5').split(',').map(Number);
		const give = process.env.GIVE ? JSON.parse(process.env.GIVE) : null;
		const jobs = [];

		arenas.forEach(a => jobs.push(...BattleJobs(seeds, level, seconds, [0], what == 'duel' ? 2 : +(process.env.PLAYERS || 4),
			Object.assign({}, typeof a == 'string' ? { lab: a } : { arena: a }, give ? { give } : {}))));

		const res = await RunAll(jobs, { progress: true });

		console.error();
		console.log(what, 'level', level, 'seeds', seeds, 'arenas', arenas.join(','));
		const t = Totals(res);
		console.table(t.table);
		console.log('rounds', t.rounds, 'draws', t.draws, 'ended by sudden death', t.stale, 'avg round s', t.roundSecs, 'x real time per thread', t.speed);

		if (process.env.PER_ARENA)
			arenas.forEach(ar =>
			{
				const tt = Totals(res.filter(m => (m.job.lab || m.job.arena) == ar));
				console.log('arena', ar, Object.entries(tt.table).map(([k, s]) => k + ' wins ' + s.wins + ' own ' + s.own + ' deaths ' + s.deaths).join(' | '), 'draws', tt.draws);
			});
	}
	else if (what == 'campaign')
	{
		const seeds = +(a || 6), level = b || 'hard', seconds = +(c || 150);
		const levels = (process.env.LEVELS || '0,1,2,3,4,5,6,7,8,9,10,11').split(',').map(Number);
		const res = await RunAll(CampaignJobs(seeds, level, seconds, levels), { progress: true });

		console.error();
		console.log('campaign level', level, 'seeds', seeds);

		['ai', 'base'].forEach(side =>
		{
			const mine = res.filter(m => m.job.tag == side);
			const t = Totals(mine);
			const cleared = mine.filter(m => m.r.outcome == 'cleared');
			const secs = cleared.reduce((s, m) => s + m.r.seconds, 0);

			console.log(side, 'cleared', cleared.length + '/' + mine.length, 'avg clear s', cleared.length ? (secs / cleared.length).toFixed(1) : '-',
				'kills', t.kills + '/' + t.enemies, JSON.stringify(t.table[side]));
		});

		if (process.env.COOP)
		{
			// who hurt whom: seat 0 is the (simulated) human, 1 and 2 are the bots under test
			['ai', 'base'].forEach(side =>
			{
				const c = { 'human<-enemy': 0, 'human<-own': 0, 'human<-bot': 0, 'bot<-enemy': 0, 'bot<-own': 0, 'bot<-human': 0, 'bot<-bot': 0 };
				const mine = res.filter(m => m.job.tag == side);

				mine.forEach(m => m.r.hits.forEach(h =>
				{
					const who = h.player == 0 ? 'human' : 'bot';
					const by = /^enemy/.test(h.cause) ? 'enemy' : h.cause == 'own' ? 'own' : /^player(\d)/.test(h.cause) ? (+h.cause.slice(6) == 0 ? 'human' : 'bot') : 'other';
					const k = who + '<-' + by;

					c[k] = (c[k] || 0) + 1;
				}));

				const cl = mine.filter(m => m.r.outcome == 'cleared');
				const over = mine.filter(m => m.r.outcome == 'gameover').length;

				console.log(side, 'cleared', cl.length + '/' + mine.length, 'gameover', over, 'avg clear s', cl.length ? (cl.reduce((x, m) => x + m.r.seconds, 0) / cl.length).toFixed(1) : '-', JSON.stringify(c));
			});
		}

		if (process.env.PER_LEVEL)
			levels.forEach(lv => console.log('level', lv, ['ai', 'base'].map(side =>
			{
				const mine = res.filter(m => m.job.tag == side && m.job.level == lv);
				const cl = mine.filter(m => m.r.outcome == 'cleared');
				const d = mine.reduce((s, m) => s + m.r.players.filter(p => p.side == side).reduce((x, p) => x + p.deaths, 0), 0);

				return side + ' ' + cl.length + '/' + mine.length + ' ' + (cl.length ? (cl.reduce((s, m) => s + m.r.seconds, 0) / cl.length).toFixed(0) + 's' : '-') + ' deaths ' + d;
			}).join(' | ')));
	}

	console.log('wall s', ((Date.now() - t0) / 1000).toFixed(1));
}

module.exports = { RunAll, Totals, BattleJobs, CampaignJobs };

if (require.main === module)
	Main();
