// LAN play: host and guest behaviour, installed onto the PiNaBlaster game object.
//
// Host:  runs the normal simulation, feeds remote players through virtual input devices
//        ("net<slot>") and sends a snapshot to the room ~30 times a second.
// Guest: runs no simulation; sends its input and draws the host's snapshots (see GuestView).

function InstallNetGame(game)
{
	var SNAPSHOT_MS = 33;

	var startSlots = [];      // slots array from the server's "start" message
	var remote = {};          // slot -> RemoteInput (host)
	var seq = 0;
	var lastSnapAt = 0;
	var lastWallsVersion = -1;

	// Local player names shown on the HUD cards (empty in local games: cards say P1..P4)
	game.PlayerNames = [];

	game.NoticeText = "";
	game.NoticeUntil = 0;

	game.ShowNotice = function(text, ms)
	{
		this.NoticeText = text;
		this.NoticeUntil = performance.now() + (ms || 3500);
	}

	game.IsNetGame = function()
	{
		return Net.Role !== null;
	}

	// ---- host ---------------------------------------------------------------------

	// msg: the server's "start" message { mode, slots }
	game.StartNetHost = function(msg)
	{
		var occupied = OccupiedSlots(msg.slots);
		var roster = [];
		var names = [];

		Input.Virtuals = {};
		remote = {};

		for (var n = 0; n < occupied.length; ++n)
		{
			var slot = occupied[n];
			var s = msg.slots[slot];

			// CPU players run here, on the host
			if (s.bot)
			{
				roster.push({ Bot: s.bot });
				names.push("CPU " + (n + 1));
				continue;
			}

			if (s.client == Net.MyId)
			{
				roster.push(RosterFromSources([s.src])[0]);
			}
			else
			{
				roster.push({ Keyboard: null, Pad: null, Net: slot });
				remote[slot] = new RemoteInput(600, function() { return performance.now(); });
				Input.Virtuals["net" + slot] = remote[slot];
			}

			names.push(s.name);
		}

		startSlots = msg.slots;
		this.PlayerNames = names;
		seq = 0;
		lastWallsVersion = -1;
		Net.Role = "host";
		Net.SoundQueue = [];
		Net.OnMessage = hostMessage;
		Net.OnClose = function(reason) { game.NetLost("Lost the connection to the server."); };

		Engine.UseBackgroundTicker(true);
		this.StartGame(msg.mode, roster);
	}

	function hostMessage(msg)
	{
		if (msg.t == "input")
		{
			if (remote[msg.slot])
				remote[msg.slot].Receive(msg.k, msg.l);
		}
		else if (msg.t == "left")
		{
			for (var i = 0; i < msg.slots.length; ++i)
			{
				var slot = msg.slots[i];
				var idx = PlayerIndexOfSlot(startSlots, slot);
				var p = PlayerManager.Players[idx];

				delete remote[slot];
				delete Input.Virtuals["net" + slot];

				if (p && !p.IsDead)
				{
					p.Lifes = 0;
					p.Hearts = 0;
					p.InvulnerableTime = 0;
					p.GetHit();
				}

				game.ShowNotice((game.PlayerNames[idx] || "A player") + " left the game");
			}
		}
	}

	// Description of the host's current result screen for guests (null when there is none).
	game.OverlayInfo = function()
	{
		var screen = Screens.Current();

		return screen && screen.Describe ? screen.Describe() : null;
	}

	// Once per animation frame (also while a result screen is up and the simulation is stopped).
	game.NetFrame = function()
	{
		if (Net.Role == "host")
			sendSnapshot();
		else if (Net.Role == "guest")
			game.GuestFrame();
	}

	function sendSnapshot()
	{
		var now = performance.now();

		if (!Net.IsOpen() || now - lastSnapAt < SNAPSHOT_MS)
			return;

		lastSnapAt = now;

		var hud = game.HudData();
		var snap = BuildSnapshot(
		{
			seq: ++seq, timeMs: now, level: game.LevelNumber, mode: game.Mode,
			walls: GameWorld.Walls, cracks: GameWorld.Cracks, wallsVersion: GameWorld.Version, lastSentVersion: lastWallsVersion,
			entities: GameEntityManager.Entities, players: PlayerManager.Players, names: game.PlayerNames,
			hud: { title: hud.title, kf: PlayerManager.KeyFlags, extra: hud.extra, nt: now < game.NoticeUntil ? game.NoticeText : "" },
			sounds: Net.SoundQueue.splice(0), overlay: game.OverlayInfo()
		});

		if ("w" in snap)
			lastWallsVersion = snap.wv;

		Net.Send(snap);
	}

	// ---- guest --------------------------------------------------------------------

	// msg: the server's "start" message { mode, slots }
	game.StartNetGuest = function(msg)
	{
		var occupied = OccupiedSlots(msg.slots);
		var owned = [];

		for (var i = 0; i < MAX_PLAYERS; ++i)
			Input.Unbind(i);

		for (var n = 0; n < occupied.length; ++n)
		{
			var s = msg.slots[occupied[n]];

			if (s.client == Net.MyId)
			{
				Input.Bind(n, RosterFromSources([s.src])[0]);
				owned.push({ slot: occupied[n], idx: n });
			}
		}

		this.PlayerNames = occupied.map(function(slot) { return msg.slots[slot].name; });
		this.Roster = occupied.map(function() { return { Keyboard: null, Pad: null }; });
		this.Mode = msg.mode;

		Screens.Clear();
		PlayerManager.Reset();
		GameEntityManager.Entities = [];
		GuestView.Start(owned);

		Net.Role = "guest";
		Net.OnMessage = guestMessage;
		Net.OnClose = function(reason) { game.NetLost("Lost the connection to the server."); };
		Engine.PauseModules = true;
	}

	function guestMessage(msg)
	{
		if (msg.t == "snap")
			GuestView.Apply(msg, performance.now());
		else if (msg.t == "closed")
			game.NetLost("The host left the game.");
		else if (msg.t == "back")
			game.NetBackToRoom(false);
	}

	game.GuestFrame = function()
	{
		GuestView.SendInput(performance.now(), !!Screens.Current());
	}

	game.GuestReset = function()
	{
		Engine.PauseModules = false;
		GuestView.Reset();
	}

	// ---- shared -------------------------------------------------------------------

	// Leave the LAN session (if any) and return to purely local play.
	game.LeaveNet = function()
	{
		if (Net.Socket)
		{
			Net.Send({ t: "leave" });
			Net.Disconnect();
		}

		Net.Role = null;
		Net.OnMessage = null;
		Net.OnClose = null;
		Input.Virtuals = {};
		remote = {};
		game.PlayerNames = [];

		Engine.UseBackgroundTicker(false);

		if (game.GuestReset)
			game.GuestReset();
	}

	// Leave the match but stay in the room (everybody returns to the room lobby).
	game.NetBackToRoom = function(tellServer)
	{
		if (tellServer)
			Net.Send({ t: "end" });

		Net.Role = null;
		Net.OnMessage = null;
		Input.Virtuals = {};
		remote = {};
		this.PlayerNames = [];
		this.Mode = null;

		Engine.UseBackgroundTicker(false);
		Engine.StopSound("audioOutro");

		if (this.GuestReset)
			this.GuestReset();

		PlayerManager.Reset();
		GameEntityManager.Entities = [];

		Screens.Clear();
		Screens.Push(new RoomScreen(this));
	}

	// Last item of a result screen: back to the room in a LAN game, back to the title otherwise.
	game.QuitItem = function()
	{
		var lan = Net.Role == "host";

		return {
			Label: lan ? "Back to room" : "Quit to title",
			OnConfirm: function() { if (lan) game.NetBackToRoom(true); else game.ShowTitle(); }
		};
	}

	game.NetLost = function(text)
	{
		this.ShowTitle();
		Screens.Push(new MessageScreen(text));
	}
}
