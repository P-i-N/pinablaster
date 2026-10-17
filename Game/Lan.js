// LAN screens: menu, join list and the room lobby.

// ---- pure helpers -------------------------------------------------------------------

// device id -> slot index, for the devices this client has put into the room
function ClaimedSources(room, myId)
{
	var map = {};

	if (!room)
		return map;

	for (var i = 0; i < room.slots.length; ++i)
		if (room.slots[i] && room.slots[i].client == myId && !room.slots[i].bot)
			map[room.slots[i].src] = i;

	return map;
}

function PlayerCount(room)
{
	return room.slots.filter(function(s) { return !!s; }).length;
}

function CanStart(room)
{
	return PlayerCount(room) >= (room.mode == "battle" ? 2 : 1);
}

function NextMode(mode)
{
	return mode == "battle" ? "campaign" : "battle";
}

function ModeName(mode)
{
	return mode == "battle" ? "Battle" : "Campaign";
}

function RoomRow(r)
{
	return r.name + "  -  " + ModeName(r.mode) + "  -  " + r.players + "/" + r.max + (r.state == "playing" ? "  (playing)" : "");
}

// Host, room lobby: what Left / Right on cursor row `row` asks the server (row 0 = mode, row n = slot n - 1).
function RoomAdjust(room, row, delta)
{
	if (row == 0)
		return { t: "mode", mode: NextMode(room.mode) };

	var slot = row - 1;
	var s = room.slots[slot];

	if (!s)
		return { t: "bot", slot: slot, level: "normal" };

	if (!s.bot)
		return null;

	var next = NextBotLevel(s.bot, delta);

	return next ? { t: "bot", slot: slot, level: next } : { t: "unbot", slot: slot };
}

// ---- screens --------------------------------------------------------------------------

function LanMenuScreen(game)
{
	this.PausesGame = true;

	var status = "";
	var busy = false;

	// Connects (asking for a name first), then calls next().
	function connect(next)
	{
		if (busy)
			return;

		busy = true;
		status = "Connecting...";

		Net.EnsureName();
		Net.Connect(function(ok)
		{
			busy = false;
			status = ok ? "" : "Could not reach the server.";

			if (ok)
				next();
		});
	}

	var model = new MenuModel(
	[
		{
			Label: "Host a game",
			OnConfirm: function()
			{
				connect(function()
				{
					Net.OnMessage = function(msg)
					{
						if (msg.t == "room")
							Screens.Replace(new RoomScreen(game));
						else if (msg.t == "err")
							status = msg.msg;
					};

					Net.OnClose = function() { game.NetLost("Lost the connection to the server."); };
					Net.Send({ t: "create", mode: "campaign" });
				});
			}
		},
		{
			Label: "Join a game",
			OnConfirm: function() { connect(function() { Screens.Replace(new JoinScreen(game)); }); }
		}
	]);

	this.Update = function(m)
	{
		if (m.Back)
		{
			Net.Disconnect();
			Screens.Replace(new TitleScreen(game));
		}
		else if (!busy)
			model.Handle(m);
	}

	this.Draw = function(ctx)
	{
		ctx.fillStyle = "#0b0b14";
		ctx.fillRect(0, 0, Display.VirtualWidth, Display.VirtualHeight);

		Screens.DrawMenu(ctx, "PLAY ON LAN", model, null);
		Screens.Text(ctx, status || ("Playing as " + (Net.Name || "(asked on connect)")), Display.VirtualWidth / 2, 290, 11, "center", status ? "#FF9090" : "#808080");
	}
}

function JoinScreen(game)
{
	this.PausesGame = true;

	var list = [];
	var index = 0;
	var lastAsk = -10000;
	var error = "";

	Net.OnMessage = function(msg)
	{
		if (msg.t == "rooms")
			list = msg.list;
		else if (msg.t == "room")
			Screens.Replace(new RoomScreen(game));
		else if (msg.t == "err")
			error = msg.msg;
	};

	Net.OnClose = function() { game.NetLost("Lost the connection to the server."); };

	this.Update = function(m)
	{
		var now = performance.now();

		if (now - lastAsk > 1500)
		{
			lastAsk = now;
			Net.Send({ t: "rooms" });
		}

		if (index >= list.length)
			index = Math.max(0, list.length - 1);

		if (m.Back)
		{
			Screens.Replace(new LanMenuScreen(game));
		}
		else if (m.Up && index > 0)
			--index;
		else if (m.Down && index < list.length - 1)
			++index;
		else if (m.Confirm && list.length && list[index].state == "lobby")
		{
			error = "";
			Net.Send({ t: "join", room: list[index].id });
		}
	}

	this.Draw = function(ctx)
	{
		var cx = Display.VirtualWidth / 2;

		ctx.fillStyle = "#0b0b14";
		ctx.fillRect(0, 0, Display.VirtualWidth, Display.VirtualHeight);

		Screens.Text(ctx, "JOIN A GAME", cx, 50, 24, "center", "#FFD040");

		if (!list.length)
			Screens.Text(ctx, "No games found. Ask a coworker to host one.", cx, 150, 12, "center", "#A0A0A0");

		for (var i = 0; i < list.length && i < 8; ++i)
		{
			var open = list[i].state == "lobby";
			var color = i == index ? "#FFFFFF" : (open ? "#A0A0A0" : "#505050");

			Screens.Text(ctx, (i == index ? "> " : "") + RoomRow(list[i]), cx, 100 + i * 22, 13, "center", color);

			Screens.AddRegion(cx - 220, 100 + i * 22 - 10, 440, 20,
				(function (row) { return function () { index = row; }; })(i),
				(function (row) { return function () { index = row; if (list[row].state == "lobby") { error = ""; Net.Send({ t: "join", room: list[row].id }); } }; })(i));
		}


		if (error)
			Screens.Text(ctx, error, cx, 280, 11, "center", "#FF9090");

	}
}

function RoomScreen(game)
{
	this.PausesGame = true;

	var error = "";
	var errorUntil = 0;
	var cursor = 0;

	function fail(text)
	{
		error = text;
		errorUntil = performance.now() + 3000;
	}

	Net.OnMessage = function(msg)
	{
		if (msg.t == "start")
		{
			Screens.Clear();

			if (msg.slots && Net.Room && Net.Room.host == Net.MyId)
				game.StartNetHost(msg);
			else
				game.StartNetGuest(msg);
		}
		else if (msg.t == "closed")
			game.NetLost("The host closed the room.");
		else if (msg.t == "err")
			fail(msg.msg);
	};

	Net.OnClose = function() { game.NetLost("Lost the connection to the server."); };

	this.Update = function(m)
	{
		var room = Net.Room;

		if (!room)
			return;

		var mine = ClaimedSources(room, Net.MyId);
		var isHost = room.host == Net.MyId;
		var sources = Input.Sources();

		// right click: leave the room
		if (m.MouseBack)
		{
			Net.Send({ t: "leave" });
			Net.Disconnect();
			Screens.Replace(new LanMenuScreen(game));
			return;
		}

		// Host cursor: row 0 = mode, rows 1.. = seats (Left / Right add / change / remove CPU players)
		if (isHost)
		{
			if (m.Up)
				cursor = Math.max(0, cursor - 1);
			else if (m.Down)
				cursor = Math.min(room.slots.length, cursor + 1);
			else if (m.Left || m.Right)
			{
				var cmd = RoomAdjust(room, cursor, m.Right ? 1 : -1);

				if (cmd)
					Net.Send(cmd);
			}
		}

		for (var i = 0; i < sources.length; ++i)
		{
			var id = sources[i].Id;
			var a = sources[i].Action;
			var claimed = mine[id] !== undefined;

			if (a.BackPressed)
			{
				if (claimed)
					Net.Send({ t: "release", slot: mine[id] });
				else
				{
					Net.Send({ t: "leave" });
					Net.Disconnect();
					Screens.Replace(new LanMenuScreen(game));
					return;
				}
			}
			else if (a.BombPressed && !claimed)
				Net.Send({ t: "claim", src: id, label: SourceLabel(id) });
			else if (a.StartPressed)
			{
				// The host with nobody but CPU players seated can start a game of bots only
				var botsOnly = room.slots.some(function(s) { return !!s; }) && !room.slots.some(function(s) { return s && !s.bot; });

				if (!claimed && !(isHost && botsOnly && CanStart(room)))
					Net.Send({ t: "claim", src: id, label: SourceLabel(id) });
				else if (isHost)
					Net.Send({ t: "start" });
			}
		}
	}

	this.Draw = function(ctx)
	{
		var room = Net.Room;
		var cx = Display.VirtualWidth / 2;
		var ss = Renderer.SpriteSheet;

		ctx.fillStyle = "#0b0b14";
		ctx.fillRect(0, 0, Display.VirtualWidth, Display.VirtualHeight);

		if (!room)
		{
			Screens.Text(ctx, "Connecting...", cx, 150, 14, "center", "#C0C0C0");
			return;
		}

		var isHost = room.host == Net.MyId;

		Screens.Text(ctx, room.name, cx, 30, 18, "center", "#FFD040");

		if (isHost && cursor == 0)
		{
			ctx.strokeStyle = "#FFD040";
			ctx.lineWidth = 2;
			ctx.strokeRect(cx - 80, 46, 160, 21);
		}

		Screens.Text(ctx, isHost ? "<  " + ModeName(room.mode).toUpperCase() + "  >" : ModeName(room.mode).toUpperCase(), cx, 56, 14, "center", "#FFFFFF");

		// Mouse (host): click the left / right half of a row to change it like Left / Right does
		function adjustRow(row, rel)
		{
			var cmd = RoomAdjust(room, row, rel < 0.5 ? -1 : 1);

			cursor = row;

			if (cmd)
				Net.Send(cmd);
		}

		if (isHost)
			Screens.AddRegion(cx - 80, 46, 160, 21, function() { cursor = 0; }, function(rel) { adjustRow(0, rel); });

		var playerIndex = 0;

		for (var i = 0; i < room.slots.length; ++i)
		{
			var box = SeatBox(i, cx);
			var x = box.x, y = box.y, top = y - box.h / 2;
			var s = room.slots[i];
			var selected = isHost && cursor == i + 1;

			if (selected)
			{
				ctx.fillStyle = "#FFD040";
				ctx.fillRect(x - 2, top - 2, box.w + 4, box.h + 4);
			}

			ctx.fillStyle = s ? PLAYER_COLORS[playerIndex] : "#2a2a36";
			ctx.fillRect(x, top, box.w, box.h);
			ctx.fillStyle = "#14141c";
			ctx.fillRect(x + 2, top + 2, box.w - 4, box.h - 4);

			if (s)
			{
				if (ss && ss.IsLoaded)
					(Tint.GetSheet(playerIndex) || ss).DrawSpriteByIndex(ctx, x + 8, y - 8, 0);

				if (s.bot)
					Screens.Text(ctx, selected ? "<  " + s.label + "  >" : s.label, x + 36, y, 12, "left", "#FFFFFF");
				else
				{
					Screens.Text(ctx, s.name, x + 36, y, 12, "left", s.client == Net.MyId ? "#FFFFFF" : PLAYER_COLORS[playerIndex]);
					Screens.Text(ctx, s.label, x + box.w - 8, y, 10, "right", "#A0A0A0");
				}

				++playerIndex;
			}
			else
				Screens.Text(ctx, selected ? "Fire join   < > / click: add a CPU player" : "Press Fire to join", x + box.w / 2, y, 11, "center", selected ? "#A0A0A0" : "#606060");

			if (isHost && (!s || s.bot))
				Screens.AddRegion(x, top, box.w, box.h, (function(row) { return function() { cursor = row; }; })(i + 1), (function(row) { return function(rel) { adjustRow(row, rel); }; })(i + 1));
		}

		var ready = CanStart(room);

		if (isHost)
			Screens.Button(ctx, ready ? "Start" : "Need " + (room.mode == "battle" ? 2 : 1) + " player(s) to begin", cx - 130, 257, 260, 20, ready, function() { Net.Send({ t: "start" }); });
		else
			Screens.Text(ctx, "Waiting for the host to start", cx, 266, 12, "center", "#C0C0C0");

		var others = room.members.length - 1;
		Screens.Text(ctx, "In the room: " + room.members.map(function(m) { return m.name; }).join(", "), cx, 286, 10, "center", "#808080");

		if (error && performance.now() < errorUntil)
			Screens.Text(ctx, error, cx, 300, 11, "center", "#FF9090");
	}
}

if (typeof module !== 'undefined')
	module.exports = { ClaimedSources: ClaimedSources, PlayerCount: PlayerCount, CanStart: CanStart, NextMode: NextMode, ModeName: ModeName, RoomRow: RoomRow, RoomAdjust: RoomAdjust };
