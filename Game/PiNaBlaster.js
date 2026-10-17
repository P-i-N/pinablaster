// PiN'a'Blaster game module

// The wipe between campaign levels, in seconds: the circle closes, the screen stays black, the circle opens on the next level
var LEVEL_WIPE_CLOSE = 0.8;
var LEVEL_WIPE_HOLD = 0.2;
var LEVEL_WIPE_OPEN = 0.8;

// 0 -> 1, slow at both ends
function IrisEase(p)
{
	p = Math.max(0, Math.min(1, p));

	return p * p * (3 - 2 * p);
}
function PiNaBlaster()
{
	InstallNetGame(this);

	// Input bindings, one per player (length = number of players)
	this.Roster = DefaultRoster(1);

	// One AiController per bot slot (null for people)
	this.Bots = [];

	// "campaign" | "battle" | null (title screen)
	this.Mode = null;

	// A battle of CPU players on the demo arena (StartDemo)?
	this.Demo = false;

	// The battle level chosen in the lobby (index into BATTLE_LEVELS)
	this.BattleLevel = 0;

	this.GameOverTimer = 0.0;
	this.WinTimer = 0.0;
	this.WinShown = false;

	// Battle mode state
	this.Battle = null;
	this.BattleTime = 0.0;
	this.SuddenTimer = 0.0;
	this.SuddenOrder = null;
	this.SuddenIndex = 0;
	this.RoundOver = false;
	this.RoundDelay = 0.0;
	this.RoundWinner = -1;
    
    // Blink timer
    this.Blinker = 0.0;

    // Edit mode
    this.EditMode = false;
    
    // Enemy kinds the current level started with (InitializeLevelEntities)
    this.LevelEnemyTypes = [];

    // Level number
    this.LevelNumber = 0;

	// The wipe between campaign levels (StartLevelTransition): null, or { phase: "close" | "hold" | "open", t, next, cx, cy }
	this.Transition = null;

	// Entities standing on a carpet or drain tile ([x, y, tile], see Levels.js)
	this.LevelOver = [];

	this.SetLevel = function(level)
	{
		// (a level set from outside - retry, debug keys - ends a wipe; the wipe's own switch keeps going)
		if (!this.SwitchingLevel)
			this.EndTransition();

		if (level == "battle" || level == "demo")
		{
			var arena = level == "demo" ? BuildDemoArena() : BuildBattleLevel(this.BattleLevel);
			arena[1] = arena[1].setCharAt(1, "P");
			GameWorld.Walls = arena;
			this.LevelOver = [];
		}
		else
		{
			var lv = CampaignLevel(level);

			GameWorld.Walls = lv.Map;
			this.LevelOver = lv.Over;

			if (lv.Name && this.Mode == "campaign")
				this.ShowNotice(lv.Name + " - " + lv.Hint, 5000);
		}

        this.LevelNumber = level;
        this.GameOverTimer = 0.0;
        this.WinTimer = 0.0;
        this.WinShown = false;
		
		this.InitializeLevelEntities();
        
        // PF 2012 outro music hack
        if (this.LevelNumber == CAMPAIGN_END)
        {
            Engine.PlaySound("audioOutro");        
        }
        else
        {
            Engine.StopSound("audioOutro");
        }
	}

	this.AutoPause = function()
	{
		// A LAN game never pauses: the host's window losing focus must not freeze everyone. Nor does a simulation.
		if (Net.Role || Engine.Turbo)
			return;

		if (!Screens.Current() && PlayerManager.Players.length > 0)
			Screens.Push(new PauseScreen(this));
	}

	this.WantsPause = function()
	{
		if (Input.Menu().Back)
			return true;

		for (var i = 0; i < PlayerManager.Players.length; ++i)
		{
			var idx = PlayerManager.Players[i].Index;

			// Remote players and bots never open a menu on this machine.
			if (this.Roster[idx] && (this.Roster[idx].Net != null || this.Roster[idx].Bot))
				continue;

			if (Input.Player(idx).StartPressed)
				return true;
		}

		return false;
	}

	// Once per animation frame, even while paused.
	this.FrameUpdate = function()
	{
		if (Screens.Current())
			Screens.Update();
		else
		{
			// A right click pauses, like Esc; any other click made while no menu was open is not meant for the next one
			var rightClick = false;

			for (var c = Mouse.TakeClick(); c; c = Mouse.TakeClick())
			{
				if (c.button == 2)
					rightClick = true;
				else if (c.button == 0 && this.Demo)
					this.DemoClick(c.x - Renderer.MapOffsetX, c.y - Renderer.MapOffsetY);
			}

			Mouse.Flush();

			if (rightClick || this.WantsPause())
				Screens.Push(Net.Role ? new LeaveScreen(this) : new PauseScreen(this));
		}

		this.NetFrame();
	}

	this.ShowTitle = function()
	{
		this.LeaveNet();
		this.DisposeBots();
		this.Mode = null;
		this.Demo = false;

		Engine.StopSound("audioOutro");
		PlayerManager.Reset();

		Screens.Clear();
		Screens.Push(new TitleScreen(this));
	}

	// mode: "campaign" | "battle"; roster: array of input bindings (one per player)
	// demo: a battle of CPU players on the demo arena that goes on round after round
	// battleLevel: which of BATTLE_LEVELS a battle is played on (the first by default)
	this.StartGame = function(mode, roster, demo, battleLevel)
	{
		this.Mode = mode;
		this.Demo = !!demo;
		this.BattleLevel = battleLevel || 0;
		this.Roster = roster;
		this.ApplyRoster();

		// Local games label HUD cards P1..; with bots present they need names ("CPU 3"). LAN games bring their own.
		if (!Net.Role)
			this.PlayerNames = this.Bots.some(Boolean) ? roster.map(function(r, i) { return PlayerLabel(i, roster); }) : [];

		Screens.Clear();

		if (mode == "battle")
		{
			this.Battle = new BattleRules(roster.length, 3);
			this.StartRound();
		}
		else
		{
			// The campaign starts at the first level (the original build started on level 7 by mistake).
			this.SetLevel(0);
		}
	}

	this.StartRound = function()
	{
		Screens.Clear();

		this.BattleTime = 0.0;
		this.SuddenTimer = 0.0;
		this.SuddenOrder = null;
		this.SuddenIndex = 0;
		this.RoundOver = false;
		this.RoundDelay = 0.0;
		this.RoundWinner = -1;

		this.SetLevel(this.Demo ? "demo" : "battle");
	}

	// The demo is a toy: a click on the arena (x, y in map pixels) does what DemoClickAction says
	this.DemoClick = function(x, y)
	{
		var bw = GameWorld.BlockWidth, bh = GameWorld.BlockHeight;

		var todo = DemoClickAction(GameEntityManager.Entities, x, y, bw, bh, function(tx, ty)
		{
			return tx > 0 && ty > 0 && tx < GameWorld.WorldWidth - 1 && ty < GameWorld.WorldHeight - 1 && GameWorld.Walls[ty][tx] == " "
				&& GameEntityManager.IsEmptySpotThere(tx * bw, ty * bh, tx * bw + bw - 1, ty * bh + bh - 1);
		}, SKULL_TYPE);

		if (!todo)
			return;

		switch (todo.action)
		{
			case "bomb":
				var bomb = new Bomb();

				bomb.X = todo.tx * bw;
				bomb.Y = todo.ty * bh;
				bomb.ExplosionSize = 3;
				break;

			case "explode":
				todo.entity.Explode();
				break;

			case "timeout":
				todo.entity.SkullEnds();
				break;

			case "pickup":
				var taker = PlayerManager.Nearest(todo.entity.X + todo.entity.Width / 2, todo.entity.Y + todo.entity.Height / 2);

				if (taker && !taker.IsDead)
					taker.OnTouch(todo.entity, 1.0);
				else
					todo.entity.Health = 0.0;

				break;

			case "revive":
				var p = todo.entity;

				p.IsDead = false;
				p.Solid = true;
				p.Hearts = 0;
				p.InvulnerableTime = 2.0;
				p.Time = 0.0;
				p.Sprite.Frames = [0];
				break;
		}
	}

	// Eight CPU players on the demo arena
	this.StartDemo = function()
	{
		var levels = ["hard", "normal", "hard", "normal", "hard", "normal", "hard", "normal"];

		this.StartGame("battle", levels.map(function(l) { return { Bot: l }; }), true);
	}

	this.ApplyRoster = function()
	{
		for (var i = 0; i < MAX_PLAYERS; ++i)
			Input.Unbind(i);

		for (var i = 0; i < this.Roster.length; ++i)
			if (!this.Roster[i].Bot)
				Input.Bind(i, this.Roster[i]);

		this.DisposeBots();
		AiBoardClear();

		// every bot thinks in a worker thread of its own where the browser has them (AiWorker.js)
		var makeWorker = typeof Worker != "undefined" ? function() { return new Worker("Game/AiWorker.js"); } : null;

		this.Bots = this.Roster.map(function(r) { return r.Bot ? new AiController(r.Bot, null, makeWorker) : null; });
	}

	// Stops the bots' worker threads
	this.DisposeBots = function()
	{
		this.Bots.forEach(function(b) { if (b && b.Dispose) b.Dispose(); });
		this.Bots = [];
	}

	this.Init = function()
	{
		Settings.Load();
		Net.Probe();

		Renderer.SpriteSheet = new SpriteSheet("Media/SpriteSheet.png", 23, 23);
		Renderer.SpriteSheet.InnerOffsetX = 3;
		Renderer.SpriteSheet.InnerOffsetY = 3;

		GameWorld.WorldWidth = 27;
		GameWorld.WorldHeight = 19;
		
		GameWorld.BlockWidth = 17;
		GameWorld.BlockHeight = 17;
		
		GameWorld.WallSpriteOffset = 20;
		
		// A level has to exist so the world is valid behind the title screen: the finale looks the part.
		this.SetLevel(CAMPAIGN_END - 1);

		var m = /[?&]players=(\d)/.exec(window.location.search);

		if (Engine.Debug && m)
			this.StartGame("campaign", DefaultRoster(Math.max(1, Math.min(MAX_PLAYERS, parseInt(m[1])))));
		else
			this.ShowTitle();

		var game = this;

		window.addEventListener("blur", function() { game.AutoPause(); });
		document.addEventListener("visibilitychange", function() { if (document.hidden) game.AutoPause(); });
	}
    
	this.DrawSmallText = function(text, x, y)
	{
		Hud.Text(Engine.Context, text, x, y, "center");
	}

	// Title / extra info for the HUD (also sent to LAN guests)
	this.HudData = function()
	{
		var title, extra;

		if (this.Mode == "battle")
		{
			var left = Math.max(0, Math.ceil(BATTLE_SUDDEN_DEATH_AT - this.BattleTime));
			var sudden = this.BattleTime > BATTLE_SUDDEN_DEATH_AT;

			title = "ROUND " + this.Battle.Round;
			extra = { wins: this.Battle.Wins, clock: sudden ? (this.Blinker > 1.0 ? "SUDDEN" : "") : Math.floor(left / 60) + ":" + ("0" + (left % 60)).slice(-2) };
		}
		else
			title = "LEVEL " + (this.LevelNumber + 1);

		// the wipe between levels
		var iris = this.IrisData();

		if (iris)
		{
			extra = extra || {};
			extra.iris = iris;
		}

		if (this.PlayerNames.length)
		{
			extra = extra || {};
			extra.names = this.PlayerNames;
		}

		// what each CPU player is up to ("" for people)
		if (this.Bots.some(Boolean))
		{
			extra = extra || {};
			extra.intents = this.Bots.map(function(b) { return b ? b.Intent || "" : ""; });
		}

		return { title: title, extra: extra };
	}

	this.DrawHud = function()
	{
		var hd = this.HudData();

		Hud.Draw(Engine.Context, PlayerManager.Players, hd.title, PlayerManager.KeyFlags, this.Blinker > 1.0, hd.extra);
	}

	this.Draw = function()
	{
		this.DrawGame();
		Screens.Draw(Engine.Context);
	}

    this.DrawGame = function()
    {
        if (Net.Role == "guest")
        {
            GuestView.Draw(this);
            return;
        }

        Renderer.Draw();

        if (this.LevelNumber == CAMPAIGN_END)
        {
            if (this.Blinker > 1.0)
                this.DrawSmallText("You won! Thanks for playing!", Display.VirtualWidth / 2, 316);

            return;
        }

        if (this.EditMode)
            return;

        this.DrawHud();

        if (performance.now() < this.NoticeUntil)
            this.DrawSmallText(this.NoticeText, Display.VirtualWidth / 2, 14);
    }

	// ---- the wipe between campaign levels: the world stands still, a black circle closes round the first living human, the next
	// level is put in behind it, and the circle opens on that ----
	this.StartLevelTransition = function(next)
	{
		// (a simulation run - Sim, the benches - has no time for it)
		if (Engine.Turbo)
		{
			this.SetLevel(next);
			return;
		}

		var c = this.TransitionCentre();

		this.Transition = { phase: "close", t: 0.0, next: next, cx: c.x, cy: c.y };
		Engine.PauseModules = true;
		this.NoticeUntil = 0;   // (the old level's hint; the next level's shows as the circle opens)
	}

	// Where the circle closes: on the first living human, else any living player, else the middle of the map (canvas pixels)
	this.TransitionCentre = function()
	{
		var who = null;

		for (var i = 0; i < PlayerManager.Players.length; ++i)
		{
			var p = PlayerManager.Players[i];

			if (p.IsDead)
				continue;

			if (!(this.Roster[p.Index] && this.Roster[p.Index].Bot))
			{
				who = p;
				break;
			}

			who = who || p;
		}

		return who ? { x: Renderer.MapOffsetX + who.X + who.Width / 2, y: Renderer.MapOffsetY + who.Y + who.Height / 2 }
			: { x: Renderer.MapOffsetX + GameWorld.WorldWidth * GameWorld.BlockWidth / 2, y: Renderer.MapOffsetY + GameWorld.WorldHeight * GameWorld.BlockHeight / 2 };
	}

	this.EndTransition = function()
	{
		if (!this.Transition)
			return;

		this.Transition = null;

		if (!this.EditMode)
			Engine.PauseModules = false;
	}

	this.TransitionTick = function(delta)
	{
		var tr = this.Transition;

		tr.t += delta;

		if (tr.phase == "close" && tr.t >= LEVEL_WIPE_CLOSE)
		{
			// black: switch levels behind the circle, and open it on the new level's first player
			this.SwitchingLevel = true;
			this.SetLevel(tr.next);
			this.SwitchingLevel = false;

			var c = this.TransitionCentre();

			tr.cx = c.x;
			tr.cy = c.y;
			tr.phase = "hold";
			tr.t = 0.0;
		}
		else if (tr.phase == "hold" && tr.t >= LEVEL_WIPE_HOLD)
		{
			tr.phase = "open";
			tr.t = 0.0;
		}
		else if (tr.phase == "open" && tr.t >= LEVEL_WIPE_OPEN)
			this.EndTransition();
	}

	// The circle for the HUD to draw (null: none), in canvas pixels with the map area it is cut out of
	this.IrisData = function()
	{
		var tr = this.Transition;

		if (!tr)
			return null;

		var x = Renderer.MapOffsetX, y = Renderer.MapOffsetY, w = GameWorld.WorldWidth * GameWorld.BlockWidth, h = GameWorld.WorldHeight * GameWorld.BlockHeight;
		var reach = Math.sqrt(Math.pow(Math.max(tr.cx - x, x + w - tr.cx), 2) + Math.pow(Math.max(tr.cy - y, y + h - tr.cy), 2));
		var open = tr.phase == "close" ? 1.0 - IrisEase(tr.t / LEVEL_WIPE_CLOSE) : tr.phase == "open" ? IrisEase(tr.t / LEVEL_WIPE_OPEN) : 0.0;

		return { cx: Math.round(tr.cx), cy: Math.round(tr.cy), r: Math.round(reach * open), x: x, y: y, w: w, h: h };
	}

	this.GameTick = function(delta)
	{
		if (this.Transition)
		{
			this.TransitionTick(delta);
			return;
		}

		var players = PlayerManager.Players;
		var game = this;
		var env =
		{
			View: function() { return AiBuildView(game.Mode, game.Roster); },
			BombCount: function() { return GameEntityManager.GetNumEntitiesByType("Bomb"); },
			// (a turbo run - Sim - plans in step with the game, so that it is repeatable)
			Threads: function() { return !Engine.Turbo; }
		};

		for (var i = 0; i < players.length; ++i)
		{
			var p = players[i];
			var bot = this.Bots[p.Index];
			var act = bot ? bot.Update(delta, p, env) : Input.Player(p.Index);

			// In a LAN game the simulation keeps running under menus: keep this machine's players still.
			if (!bot && Net.Role && Screens.Current() && this.Roster[p.Index] && this.Roster[p.Index].Net == null)
				act = { Dir: 0, Bomb: false, BombPressed: false };

			p.ApplyInputDirection(act.Dir);

			// (ignore the bomb button for a limited time after a player spawns)
			if ((act.Bomb || act.BombPressed) && p.Time > 0.5)
			{
				if (!p.IsDead)
				{
					p.Poop();
				}
				else if (p.Lifes > 0)
				{
					--p.Lifes;

					this.RespawnPlayer(p);
				}
			}
		}

		if (this.Mode == "campaign")
		{
			// Everyone is out: give the death animation a moment, then offer a retry.
			if (AllOut(HumanPlayers(players, this.Roster)))
			{
				this.GameOverTimer += delta;

				if (this.GameOverTimer > 1.5)
				{
					this.GameOverTimer = 0.0;
					this.ShowGameOver();
					return;
				}
			}
			else
				this.GameOverTimer = 0.0;

			if (GameEntityManager.GetNumEntitiesByType("Enemy") == 0)
				this.StartLevelTransition(this.LevelNumber + 1);
		}
		else if (this.Mode == "battle")
			this.BattleTick(delta);
	}
    
	this.BattleTick = function(delta)
	{
		this.BattleTime += delta;

		if (this.BattleTime > BATTLE_SUDDEN_DEATH_AT && !this.RoundOver)
		{
			this.SuddenTimer += delta;

			while (this.SuddenTimer >= BATTLE_SUDDEN_STEP)
			{
				this.SuddenTimer -= BATTLE_SUDDEN_STEP;
				this.CloseNextCell();
			}
		}

		if (!this.RoundOver)
		{
			var outcome = RoundOutcome(PlayerManager.Players);

			if (outcome)
			{
				this.RoundOver = true;
				this.RoundDelay = 1.5;
				this.RoundWinner = outcome.winner;
			}
		}
		else
		{
			this.RoundDelay -= delta;

			if (this.RoundDelay <= 0.0)
				this.FinishRound();
		}
	}

	// Sudden death: the next arena tile (spiral from the outside in) becomes a wall and blasts whatever stands on it.
	this.CloseNextCell = function()
	{
		if (!this.SuddenOrder)
			this.SuddenOrder = SpiralOrder(GameWorld.WorldWidth, GameWorld.WorldHeight);

		if (this.SuddenIndex >= this.SuddenOrder.length)
			return;

		var c = this.SuddenOrder[this.SuddenIndex++];
		var x = c.x * GameWorld.BlockWidth;
		var y = c.y * GameWorld.BlockHeight;

		GameWorld.SetBlock(x, y, "0");

		// Whoever stands there is crushed - hearts or not (a player sealed in the wall would keep the round going forever)
		CrushedPlayers(PlayerManager.Players, c.x, c.y, GameWorld.BlockWidth, GameWorld.BlockHeight).forEach(function(p) { p.Die(); });

		var exp = new Explosion();
		exp.X = x;
		exp.Y = y;
		exp.Owner = { Type: "SuddenDeath" };
		exp.Sprite.Frames = [140, 141, 142, 143]; // the "cross" blast frames (Explosion's default frames are not blast sprites)
	}

	this.FinishRound = function()
	{
		var game = this;
		var winner = this.RoundWinner;
		var matchWinner = this.Battle.RecordRound(winner);

		var roster = this.Roster;
		var score = this.Battle.Wins.map(function(w, i) { return PlayerLabel(i, roster) + ": " + w; }).join("    ");

		// The demo carries on by itself: a line about who won, then the next round (or a new match)
		if (this.Demo)
		{
			this.ShowNotice(matchWinner >= 0 ? PlayerLabel(matchWinner, roster) + " wins the match" : (winner >= 0 ? PlayerLabel(winner, roster) + " wins the round" : "Draw"), 3000);

			if (matchWinner >= 0)
				this.StartGame("battle", this.Roster, true);
			else
				this.StartRound();

			return;
		}

		if (matchWinner >= 0)
		{
			Screens.Push(new ResultScreen(PlayerLabel(matchWinner, roster) + " WINS THE MATCH!", [score],
			[
				{ Label: "Rematch", OnConfirm: function() { game.StartGame("battle", game.Roster, false, game.BattleLevel); } },
				game.QuitItem()
			]));
		}
		else
		{
			Screens.Push(new ResultScreen(winner >= 0 ? PlayerLabel(winner, roster) + " WINS THE ROUND" : "DRAW", [score],
			[
				{ Label: "Next round", OnConfirm: function() { game.StartRound(); } },
				game.QuitItem()
			]));
		}
	}

	this.ShowGameOver = function()
	{
		var game = this;

		Screens.Push(new ResultScreen("GAME OVER", ["Everyone is out of lives."],
		[
			{ Label: "Retry level", OnConfirm: function() { Screens.Clear(); game.SetLevel(game.LevelNumber); } },
			game.QuitItem()
		]));
	}

	this.RespawnPlayer = function(p)
	{
		p.X = p.SpawnX;
		p.Y = p.SpawnY;
		p.IsDead = false;
		p.InvulnerableTime = 10.0;
		p.Hearts = 3;
		p.SkateTime = 0.0;
		p.PushableBombsTime = 0.0;
		p.SuperBombsTime = 0.0;
		p.BadLuckTime = 0.0;
		p.BadLuckFlags = 0;
		p.Time = 0.0;
		p.Solid = true;
		p.Sprite.Frames = [0];
	}
    
    this.EditModeTick = function(delta)
    {
    }
    
	this.PF2012Tick = function(delta)
	{
		this.WinTimer += delta;

		if (this.WinTimer > 4.0 && !this.WinShown && !Screens.Current())
		{
			this.WinShown = true;

			var game = this;

			Screens.Push(new ResultScreen("YOU WON!", ["Thanks for playing!"],
			[
				{ Label: "Play again", OnConfirm: function() { game.StartGame("campaign", game.Roster); } },
				game.QuitItem()
			]));
		}
	}

	this.Tick = function(delta)
	{
        if (Net.Role == "guest")
            return;

        this.Blinker += delta * 20;
        
        if (this.Blinker >= 2.0)
            this.Blinker -= 2.0;
    
        if (this.LevelNumber == CAMPAIGN_END)
            this.PF2012Tick(delta);        
        else if (this.EditMode)
            this.EditModeTick(delta);
        else
            this.GameTick(delta);
	}
    
    this.SwitchEditMode = function()
    {
        this.EditMode = !this.EditMode;
        
        if (this.EditMode)
        {
            Engine.PauseModules = true;            
        }
        else
        {
            Engine.PauseModules = false;
        }
    }
	
	this.KeyDown = function(e)
	{
		var key = parseInt(e.keyCode);

		// M mutes / unmutes everything
		if (key == 77)
		{
			AudioMixer.SetMuted(!AudioMixer.IsMuted());
			this.ShowNotice(AudioMixer.IsMuted() ? "Sound off" : "Sound on", 1200);
			return;
		}

		if (Engine.Debug && !Net.Role && this.LevelHotkey(e))
			return;

		if (Engine.Debug)
		{
			var p0 = PlayerManager.Players[0];

			if (key == 69) this.SwitchEditMode();
			else if (key == 82 && p0) { p0.IsDead = false; p0.Sprite.Frames = [0]; }
			else if (key == 68) Renderer.EnableDebugDraw = !Renderer.EnableDebugDraw;
			else if (key >= 49 && key <= 57) this.SetLevel(key - 49);
			else if (key == 33 && this.LevelNumber > 0) this.SetLevel(this.LevelNumber - 1);          // PageUp
			else if (key == 34 && this.LevelNumber < CAMPAIGN_END) this.SetLevel(this.LevelNumber + 1);  // PageDown
		}
		
	}
	
	// Debug hotkeys (offline only): + next level, - previous level (campaign), * revive every human player / refill their hearts.
	// Returns true when the key was one of them.
	this.LevelHotkey = function(e)
	{
		var plus = e.key == "+" || e.keyCode == 107, minus = e.key == "-" || e.keyCode == 109, star = e.key == "*" || e.keyCode == 106;

		if (!plus && !minus && !star)
			return false;

		if (this.Mode != "campaign")
			return true;

		if (plus && this.LevelNumber < CAMPAIGN_END)
			this.SetLevel(this.LevelNumber + 1);
		else if (minus && this.LevelNumber > 0)
			this.SetLevel(this.LevelNumber - 1);
		else if (star)
		{
			var humans = HumanPlayers(PlayerManager.Players, this.Roster);

			for (var i = 0; i < humans.length; ++i)
			{
				if (humans[i].IsDead)
					this.RespawnPlayer(humans[i]);
				else
					humans[i].Hearts = 3;
			}
		}

		return true;
	}

	this.KeyUp = function(e)
	{
	}
	
	this.InitializeLevelEntities = function()
	{
		PlayerManager.Reset();

		// The enemy kinds this level starts with (type numbers): all a skull may let out
		this.LevelEnemyTypes = [];

		GameEntityManager.Entities = [];
		
		GameWorld.DangerLevel = [];
		GameWorld.PlayerPosX = GameWorld.BlockWidth;
		GameWorld.PlayerPosY = GameWorld.BlockHeight;

		for (var y = 0; y < GameWorld.WorldHeight; ++y)
		{
			GameWorld.DangerLevel.push([]);
		
			for (var x = 0; x < GameWorld.WorldWidth; ++x)
			{
				GameWorld.DangerLevel[y].push(0);
			
				if (this.SpawnTileEntity(GameWorld.Walls[y][x], x, y))
					GameWorld.Walls[y] = GameWorld.Walls[y].setCharAt(x, ' ');
			}
		}

		// Enemies and ice riding a carpet or sitting on a drain
		for (var i = 0; i < this.LevelOver.length; ++i)
			this.SpawnTileEntity(this.LevelOver[i][2], this.LevelOver[i][0], this.LevelOver[i][1]);

		GameWorld.Invalidate();
		
		this.CreatePlayers();
	}

	// Creates what map tile `block` at tile (x, y) stands for; true when the tile itself is floor.
	this.SpawnTileEntity = function(block, x, y)
	{
		var clear = true;
		
		switch (block)
		{
			default:
				clear = false;
				break;
				
			case "a":
			case "b":
			case "c":
			case "d":
			case "e":
			case "f":
			case "g":
			{
				var enemy = new Enemy();
				var kind = block.charCodeAt(0) - "a".charCodeAt(0);

				enemy.X = x * GameWorld.BlockWidth;
				enemy.Y = y * GameWorld.BlockHeight;
				enemy.SetEnemyType(kind);

				if (this.LevelEnemyTypes.indexOf(kind) < 0)
					this.LevelEnemyTypes.push(kind);
			}
			break;
			
			case "P":
				GameWorld.PlayerPosX = x * GameWorld.BlockWidth;
				GameWorld.PlayerPosY = y * GameWorld.BlockHeight;
				break;
				
			case "i":
			{
				var iceblock = new IceBlock();
				iceblock.X = x * GameWorld.BlockWidth;
				iceblock.Y = y * GameWorld.BlockHeight;
			}
			break;

			case "I":
			{
				var iceblock = new IceBlock();
				iceblock.FrozenBomb = true;
				iceblock.X = x * GameWorld.BlockWidth;
				iceblock.Y = y * GameWorld.BlockHeight;
				iceblock.Sprite.Frames = [75];
			}
			break;
			
			case "#":
			{
				var drain = new Drain();
				drain.X = x * GameWorld.BlockWidth;
				drain.Y = y * GameWorld.BlockHeight;					
			}
			break;
			
			case "^":
			{
				var carpet = new MagicCarpet(1);
				carpet.X = x * GameWorld.BlockWidth;
				carpet.Y = y * GameWorld.BlockHeight;
			}
			break;
			
			case ">":
			{
				var carpet = new MagicCarpet(2);
				carpet.X = x * GameWorld.BlockWidth;
				carpet.Y = y * GameWorld.BlockHeight;
			}
			break;

			case ",":
			{
				var carpet = new MagicCarpet(3);
				carpet.X = x * GameWorld.BlockWidth;
				carpet.Y = y * GameWorld.BlockHeight;
			}
			break;
			
			case "<":
			{
				var carpet = new MagicCarpet(4);
				carpet.X = x * GameWorld.BlockWidth;
				carpet.Y = y * GameWorld.BlockHeight;
			}	
			break;
			
			case "T":
			{
				var key = new Key(0);
				key.X = x * GameWorld.BlockWidth;
				key.Y = y * GameWorld.BlockHeight;
			}
			break;				

			case "H":
			{
				var key = new Key(1);
				key.X = x * GameWorld.BlockWidth;
				key.Y = y * GameWorld.BlockHeight;
			}
			break;				

			case "N":
			{
				var key = new Key(2);
				key.X = x * GameWorld.BlockWidth;
				key.Y = y * GameWorld.BlockHeight;
			}
			break;				

			case "U":
			{
				var key = new Key(3);
				key.X = x * GameWorld.BlockWidth;
				key.Y = y * GameWorld.BlockHeight;
			}
			break;				

		}

		return clear;
	}

	this.CreatePlayers = function()
	{
		var W = GameWorld.WorldWidth, H = GameWorld.WorldHeight;
		var bw = GameWorld.BlockWidth, bh = GameWorld.BlockHeight;

		function isFree(x, y)
		{
			if (x < 0 || y < 0 || x >= W || y >= H || GameWorld.Walls[y][x] != ' ')
				return false;

			return GameEntityManager.IsEmptySpotThere(x * bw, y * bh, x * bw + bw - 1, y * bh + bh - 1);
		}

		var spawns = ComputeSpawns(isFree, W, H, Math.floor(GameWorld.PlayerPosX / bw), Math.floor(GameWorld.PlayerPosY / bh), this.Roster.length);

		// players 7 and 8 get a cleared pocket (the battle arena already has one for them)
		if (this.Mode == "campaign" && spawns.length > 6)
		{
			GameWorld.Walls = ClearSpawnPockets(GameWorld.Walls, spawns, 6);
			GameWorld.Invalidate();
		}

		for (var i = 0; i < spawns.length; ++i)
		{
			var p = new Player();

			p.Index = i;
			p.SpawnX = spawns[i].x * bw;
			p.SpawnY = spawns[i].y * bh;
			p.X = p.SpawnX;
			p.Y = p.SpawnY;
			p.Width = 17;
			p.Height = 17;

			// Battle: one hit kills, no respawns, short spawn protection
			if (this.Mode == "battle")
			{
				p.Hearts = 0;
				p.Lifes = 0;
				p.InvulnerableTime = 1.0;
			}
		}
	}
}
