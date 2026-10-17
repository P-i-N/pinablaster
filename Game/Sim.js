// Developer tool for AI experiments: Sim.Run plays one game at full speed (turbo: no sound, a frame drawn now and
// then) with seeded random numbers, so a run can be repeated, and reports what happened. In the browser console:
//   await Sim.Run({ mode: "battle", roster: ["ai:hard", "ai:normal", "ai:easy"], seconds: 300, seed: 1 })
//   Sim.Summary(await Sim.Batch([1, 2, 3].map(seed => ({ mode: "campaign", level: 5, roster: ["kb0", "ai:hard"], seed, immortal: true }))))

// Totals over Sim.Run results (pure).
function SimSummary(results)
{
	var s = { runs: results.length, seconds: 0, kills: 0, enemies: 0, hits: {}, wins: {}, draws: 0, roundSecs: 0 };
	var rounds = 0;

	results.forEach(function(r)
	{
		s.seconds += r.seconds;
		s.kills += r.kills;
		s.enemies += r.enemies;

		r.hits.forEach(function(h) { s.hits[h.cause] = (s.hits[h.cause] || 0) + 1; });

		r.rounds.forEach(function(rd)
		{
			if (rd.winner >= 0)
				s.wins[rd.winner] = (s.wins[rd.winner] || 0) + 1;
			else
				++s.draws;

			s.roundSecs += rd.t;
			++rounds;
		});
	});

	s.roundSecs = rounds ? s.roundSecs / rounds : 0;

	return s;
}

// What hurt player p: "own" (its bomb), "player<n>", "enemy:<map tile>" (touch, laser, shot: "enemy:g" is an Angry
// 4channer), "sudden" (battle arena closing), ...
function SimCause(p, e)
{
	var enemy = function(en) { return "enemy:" + "abcdefg".charAt(en.EnemyType); };

	if (e.Type == "Enemy")
		return enemy(e);

	var owner = e.Owner;

	if (!owner)
		return "?";

	if (owner.Type == "Enemy")
		return enemy(owner);

	if (owner.Type == "Bomb")
		return owner.Owner === p ? "own" : (owner.Owner && owner.Owner.Type == "Player" ? "player" + owner.Owner.Index : "bomb");

	return { SuddenDeath: "sudden", IceBlock: "frozen bomb", Skull: "skull" }[owner.Type] || owner.Type;
}

// opts: { mode: "campaign" | "battle", level (campaign start level), roster: lobby ids ("kb0" = a seat nobody plays,
//         "ai:easy|normal|hard"), seconds (game time, default 60), seed (default 1), immortal (human seats can't be
//         hurt), drawEvery (steps per drawn frame, default 300), stay (keep the game on screen afterwards),
//         single (campaign: stop once the first level is cleared, outcome "cleared") }
// Resolves to { mode, level, seed, seconds, outcome: "time" | "match" | "gameover" | "won" | "cleared", kills, enemies, levels,
//               hits: [{ player, bot, cause, t }], rounds: [{ winner, t }], winner, reasons: { player: { reason: n } } }
function SimRun(opts)
{
	var game = Engine.Application;
	var mode = opts.mode || "campaign";
	var steps = Math.round((opts.seconds || 60) / Engine.TickSpeed);
	var drawEvery = opts.drawEvery || 300;
	var seed = opts.seed === undefined ? 1 : opts.seed;
	var result = { mode: mode, level: opts.level || 0, seed: seed, seconds: 0, outcome: "time", kills: 0, enemies: 0, levels: 0,
		hits: [], rounds: [], winner: null, reasons: {} };

	var realRandom = Math.random, realDecide = AiDecide;
	var levelNow = -1, enemiesNow = 0, done = 0, finished = false;

	function now() { return Math.round(done * Engine.TickSpeed * 100) / 100; }
	function human(i) { return !(game.Roster[i] && game.Roster[i].Bot); }

	function watch()
	{
		var n = GameEntityManager.GetNumEntitiesByType("Enemy");

		if (game.LevelNumber !== levelNow)
		{
			// a campaign level ends when its last enemy dies (in the same step as the next level starts)
			if (levelNow >= 0)
			{
				result.levels++;
				result.kills += enemiesNow;

				if (opts.single)
				{
					result.outcome = "cleared";
					finished = true;
					return;
				}
			}

			levelNow = game.LevelNumber;
			enemiesNow = n;
			result.enemies += n;

			if (mode == "campaign" && levelNow == CAMPAIGN_END)
			{
				result.outcome = "won";
				finished = true;
				return;
			}
		}
		else if (n < enemiesNow)
		{
			result.kills += enemiesNow - n;
			enemiesNow = n;
		}

		PlayerManager.Players.forEach(function(p)
		{
			if (opts.immortal && human(p.Index))
				p.InvulnerableTime = Math.max(p.InvulnerableTime, 1);

			if (p.__sim)
				return;

			p.__sim = true;

			var touch = p.OnTouch;

			p.OnTouch = function(e, of)
			{
				var hearts = p.Hearts, dead = p.IsDead;

				touch.call(p, e, of);

				if (p.Hearts < hearts || (p.IsDead && !dead))
					result.hits.push({ player: p.Index, bot: !human(p.Index), cause: SimCause(p, e), t: now() });
			};
		});

		if (Screens.Current())
		{
			if (mode == "battle" && game.Battle)
			{
				// a round is over (FinishRound showed its result): record it, then play on until the match is decided
				result.rounds.push({ winner: game.RoundWinner, t: Math.round(game.BattleTime * 100) / 100 });

				if (game.Battle.Wins.some(function(w) { return w >= game.Battle.Target; }))
				{
					result.outcome = "match";
					result.winner = game.RoundWinner;
					finished = true;
				}
				else
					game.StartRound();
			}
			else
			{
				result.outcome = "gameover";
				finished = true;
			}
		}
	}

	return new Promise(function(resolve, reject)
	{
		var channel = new MessageChannel();

		function cleanup()
		{
			Math.random = realRandom;
			AiDecide = realDecide;
			result.seconds = now();
			Engine.Draw();
			Engine.SetTurbo(false);

			if (!opts.stay)
				game.ShowTitle();
		}

		// ~30 ms of simulation per task, then let the browser breathe (MessageChannel: not throttled in hidden tabs)
		channel.port1.onmessage = function()
		{
			try
			{
				var start = performance.now();

				while (!finished && done < steps && performance.now() - start < 30)
				{
					Engine.Step();
					++done;
					watch();

					if (done % drawEvery == 0)
						Engine.Draw();
				}
			}
			catch (e)
			{
				cleanup();
				reject(e);
				return;
			}

			if (finished || done >= steps)
			{
				cleanup();
				resolve(result);
			}
			else
				channel.port2.postMessage(0);
		};

		Math.random = SeededRandom(seed);

		// count every AI decision
		AiDecide = function(view, me, level, rng)
		{
			var plan = realDecide(view, me, level, rng);
			var r = result.reasons[me.index] = result.reasons[me.index] || {};

			r[plan.reason] = (r[plan.reason] || 0) + 1;

			return plan;
		};

		Engine.SetTurbo(true, { run: false });
		game.ShowTitle();
		game.StartGame(mode, RosterFromSources(opts.roster || ["kb0", "ai:normal"]));

		if (mode == "campaign" && opts.level)
			game.SetLevel(opts.level);

		Screens.Clear();
		watch();
		channel.port2.postMessage(0);
	});
}

// Runs one after another; resolves to the list of results.
function SimBatch(list)
{
	var out = [];

	return list.reduce(function(chain, opts)
	{
		return chain.then(function() { return SimRun(opts).then(function(r) { out.push(r); }); });
	}, Promise.resolve()).then(function() { return out; });
}

var Sim = { Run: SimRun, Batch: SimBatch, Summary: SimSummary };

if (typeof module !== 'undefined')
	module.exports = { SimSummary: SimSummary, SimCause: SimCause };
