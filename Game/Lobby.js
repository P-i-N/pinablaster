// Title screen and the "press fire to join" lobby.

var BOT_LEVELS = ["easy", "normal", "hard"];

function IsBotId(id) {
	return id.indexOf("ai:") == 0;
}

function BotLabel(level) {
	return "AI - " + level.charAt(0).toUpperCase() + level.substr(1);
}

// The bot level after Left (-1) / Right (+1); null = remove the bot.
function NextBotLevel(level, delta) {
	var i = BOT_LEVELS.indexOf(level) + delta;

	return i < 0 ? null : BOT_LEVELS[Math.min(i, BOT_LEVELS.length - 1)];
}

// Rows the lobby cursor can visit: every taken seat plus the first free one.
function LobbyRows(count, max) {
	return Math.min(count + 1, max);
}

// Left / Right on cursor row `row`: the free row adds a Normal bot, a bot row changes level (or removes the bot).
function LobbyAdjust(joined, row, delta, max) {
	var list = joined.slice();

	if (row == list.length) {
		if (list.length < max)
			list.push("ai:normal");

		return list;
	}

	if (!list[row] || !IsBotId(list[row]))
		return list;

	var next = NextBotLevel(list[row].substr(3), delta);

	if (next)
		list[row] = "ai:" + next;
	else
		list.splice(row, 1);

	return list;
}

// What Start does when pressed on device `id` while `joined` are the seats taken: "start" the game, "join" with this device,
// or null (nothing). A device that has a seat starts the game when there are enough players. A device without one joins -
// unless there are only CPU players so far: then it starts a game of bots only (campaign or battle, to watch).
function LobbyStartAction(joined, id, mode, max) {
	var minimum = mode == "battle" ? 2 : 1;
	var enough = joined.length >= minimum;

	if (joined.indexOf(id) >= 0)
		return enough ? "start" : null;

	if (joined.length && joined.every(IsBotId))
		return enough ? "start" : (joined.length < max ? "join" : null);

	return joined.length < max ? "join" : null;
}

function RosterFromSources(ids) {
	return ids.map(function (id) {
		if (IsBotId(id))
			return { Bot: id.substr(3) };

		if (id == "touch")
			return { Keyboard: null, Pad: null, Touch: true };

		if (id.indexOf("kb") == 0)
			return { Keyboard: parseInt(id.substr(2)), Pad: null };

		return { Keyboard: null, Pad: parseInt(id.substr(3)) };
	});
}

function SourceLabel(id) {
	if (IsBotId(id)) return BotLabel(id.substr(3));
	if (id == "touch") return "Touch controls";
	if (id == "kb0") return "Keyboard: arrows + Space";
	if (id == "kb1") return "Keyboard: WASD + Shift";

	return "Gamepad " + (parseInt(id.substr(3)) + 1);
}

// Where seat `i` is drawn: one column of (up to 8) seats. x: left edge, y: centre.
function SeatBox(i, cx) {
	return { x: cx - 150, y: 82 + i * 23, w: 300, h: 19 };
}

function MinPlayers(mode) {
	return mode == "battle" ? 2 : 1;
}

function TitleScreen(game) {
	this.PausesGame = true;

	var model = new MenuModel(
		[
			{ Label: "Campaign", OnConfirm: function () { Screens.Replace(new LobbyScreen(game, "campaign")); } },
			{
				Label: "Battle",
				// Enabled automatically once the Battle module is loaded.
				Disabled: function () { return typeof BattleRules === "undefined"; },
				OnConfirm: function () { Screens.Replace(new LobbyScreen(game, "battle")); }
			},
			{
				Label: "Demo",
				// Eight CPU players on a special arena, to watch
				Disabled: function () { return typeof BattleRules === "undefined"; },
				OnConfirm: function () { game.StartDemo(); }
			},
			{
				Label: "Play on LAN",
				// Needs the game to be served by server.py
				Disabled: function () { return !Net.Available; },
				OnConfirm: function () { Screens.Replace(new LanMenuScreen(game)); }
			},
			{ Label: "Options", OnConfirm: function () { Screens.Push(new OptionsScreen()); } }
		]);

	this.Update = function (m) {
		model.Handle(m);
	}

	this.Draw = function (ctx) {
		var cx = Display.VirtualWidth / 2;

		ctx.fillStyle = "#0b0b14";
		ctx.fillRect(0, 0, Display.VirtualWidth, Display.VirtualHeight);

		var ss = Renderer.SpriteSheet;

		if (ss && ss.IsLoaded) {
			for (var k = 0; k < 7; ++k)
				ss.DrawSpriteByIndex(ctx, cx - 7 * 14 + k * 28 + 4, 258, 67 + 20 * k);
		}

		Screens.DrawMenu(ctx, "PiN'a'Blaster", model, null);
		Screens.Text(ctx, "PiN's Dyna Blaster HTML5 clone", cx, 94, 11, "center", "#808080");

		// (only what is wrong with the sound is worth a line; how to play is not)
		var hint = !AudioMixer.IsReady() ? "Sound is not available in this browser" : (AudioMixer.IsRunning() ? "" : "Tap, press a key or click to enable sound");

		if (hint)
			Screens.Text(ctx, hint, cx, 306, 10, "center", "#C0C0C0");

		if (!Net.Available)
			Screens.Text(ctx, "LAN play needs the game to be served by: python server.py", cx, 290, 9, "center", "#707070");
	}
}

// The map `rows` (see Levels.js for the tile letters) as a picture, laid out like the game does: ground, then what lies on it, then walls.
function DrawLevelPreview(ctx, rows) {
	var ss = Renderer.SpriteSheet;

	if (!ss || !ss.IsLoaded)
		return;

	var bw = GameWorld.BlockWidth, bh = GameWorld.BlockHeight, ox = Renderer.MapOffsetX, oy = Renderer.MapOffsetY;
	var carpet = { "^": 1, ">": 2, ",": 3, "<": 4 };

	function wall(c) { return c >= "0" && c <= "9"; }

	for (var y = 0; y < rows.length; ++y) {
		for (var x = 0; x < rows[y].length; ++x) {
			var ch = rows[y][x], bx = ox + x * bw, by = oy + y * bh;

			ss.DrawSpriteByIndex(ctx, bx, by, GameWorld.GroundStyle);

			if (y > 0 && !wall(ch) && wall(rows[y - 1][x]))
				ss.DrawSpriteByIndex(ctx, bx, by, GameWorld.GroundStyle + 1);

			if (carpet[ch])
				ss.DrawSpriteByIndex(ctx, bx, by, 74 + carpet[ch] * 20);
			else if (ch == "#")
				ss.DrawSpriteByIndex(ctx, bx, by, 76);
		}
	}

	for (var y = 0; y < rows.length; ++y) {
		for (var x = 0; x < rows[y].length; ++x) {
			var ch = rows[y][x], bx = ox + x * bw, by = oy + y * bh;

			if (wall(ch))
				ss.DrawSpriteByIndex(ctx, bx, by, GameWorld.WallSpriteOffset + (ch.charCodeAt(0) - 48));
			else if (ch == "i")
				ss.DrawSpriteByIndex(ctx, bx, by, 74);
			else if (ch == "I")
				ss.DrawSpriteByIndex(ctx, bx, by, 75);
		}
	}
}

function LobbyScreen(game, mode) {
	this.PausesGame = true;

	var joined = [];
	var cursor = 0;
	var battle = mode == "battle";
	var level = game.BattleLevel || 0;   // battle: which of BATTLE_LEVELS (the cursor row -1 changes it)

	function nextLevel(delta) {
		var n = BATTLE_LEVELS.length;

		level = ((level + delta) % n + n) % n;
	}

	function has(id) { return joined.indexOf(id) >= 0; }

	this.Update = function (m) {
		// right click: back to the title
		if (m.MouseBack) {
			Screens.Replace(new TitleScreen(game));
			return;
		}

		var sources = Input.Sources();
		var live = {};

		sources.forEach(function (s) { live[s.Id] = true; });
		joined = joined.filter(function (id) { return live[id] || IsBotId(id); });

		// The cursor (any local device) manages bots: Up / Down pick a row, Left / Right add / change / remove.
		if (m.Up)
			cursor = Math.max(battle ? -1 : 0, cursor - 1);
		else if (m.Down)
			cursor = Math.min(LobbyRows(joined.length, MAX_PLAYERS) - 1, cursor + 1);
		else if (m.Left || m.Right) {
			if (cursor < 0)
				nextLevel(m.Right ? 1 : -1);
			else
				joined = LobbyAdjust(joined, cursor, m.Right ? 1 : -1, MAX_PLAYERS);
		}

		cursor = Math.min(cursor, LobbyRows(joined.length, MAX_PLAYERS) - 1);

		for (var i = 0; i < sources.length; ++i) {
			var id = sources[i].Id;
			var a = sources[i].Action;

			if (a.BackPressed) {
				if (has(id))
					joined.splice(joined.indexOf(id), 1);
				else {
					Screens.Replace(new TitleScreen(game));
					return;
				}
			}
			else if (a.BombPressed && !has(id) && joined.length < MAX_PLAYERS) {
				joined.push(id);
			}
			else if (a.StartPressed) {
				var action = LobbyStartAction(joined, id, mode, MAX_PLAYERS);

				if (action == "join")
					joined.push(id);
				else if (action == "start") {
					game.StartGame(mode, RosterFromSources(joined), false, level);
					return;
				}
			}
		}
	}

	this.Draw = function (ctx) {
		var cx = Display.VirtualWidth / 2;
		var ss = Renderer.SpriteSheet;

		ctx.fillStyle = "#0b0b14";
		ctx.fillRect(0, 0, Display.VirtualWidth, Display.VirtualHeight);

		if (battle) {
			// the chosen level behind everything, dimmed
			DrawLevelPreview(ctx, BuildBattleLevel(level));
			Screens.Dim(ctx);

			Screens.Text(ctx, "BATTLE", cx, 22, 20, "center", "#FFD040");

			var row = BATTLE_LEVELS[level].Name + "   " + (level + 1) + " / " + BATTLE_LEVELS.length;

			if (cursor < 0) {
				ctx.fillStyle = "#FFD040";
				ctx.fillRect(cx - 112, 36, 224, 22);
				ctx.fillStyle = "#14141c";
				ctx.fillRect(cx - 110, 38, 220, 18);
			}

			Screens.Text(ctx, cursor < 0 ? "<  " + row + "  >" : row, cx, 47, 12, "center", cursor < 0 ? "#FFFFFF" : "#C0C0C0");
			Screens.AddRegion(cx - 112, 36, 224, 22, function () { cursor = -1; }, function (rel) { cursor = -1; nextLevel(rel < 0.5 ? -1 : 1); });

			// big arrows at the sides of the screen
			[[-1, 24, "<"], [1, Display.VirtualWidth - 24, ">"]].forEach(function (a) {
				var hot = Screens.Hovered(a[1] - 20, 130, 40, 64);

				Screens.Text(ctx, a[2], a[1], 162, 40, "center", hot ? "#FFFFFF" : "#C0A040");
				Screens.AddRegion(a[1] - 20, 130, 40, 64, null, function () { nextLevel(a[0]); });
			});

			Screens.Text(ctx, "Who is playing?", cx, 65, 9, "center", "#C0C0C0");
		}
		else {
			Screens.Text(ctx, "CAMPAIGN", cx, 36, 22, "center", "#FFD040");
			Screens.Text(ctx, "Who is playing?", cx, 62, 12, "center", "#C0C0C0");
		}

		for (var i = 0; i < MAX_PLAYERS; ++i) {
			var box = SeatBox(i, cx);
			var x = box.x, y = box.y, top = y - box.h / 2;
			var selected = i == cursor;

			if (selected) {
				ctx.fillStyle = "#FFD040";
				ctx.fillRect(x - 2, top - 2, box.w + 4, box.h + 4);
			}

			ctx.fillStyle = i < joined.length ? PLAYER_COLORS[i] : "#2a2a36";
			ctx.fillRect(x, top, box.w, box.h);

			ctx.fillStyle = "#14141c";
			ctx.fillRect(x + 2, top + 2, box.w - 4, box.h - 4);

			if (i < joined.length) {
				if (ss && ss.IsLoaded)
					(Tint.GetSheet(i) || ss).DrawSpriteByIndex(ctx, x + 8, y - 8, 0);

				var label = SourceLabel(joined[i]);

				if (IsBotId(joined[i]) && selected)
					label = "<  " + label + "  >";

				Screens.Text(ctx, "P" + (i + 1), x + 40, y, 12, "left", PLAYER_COLORS[i]);
				Screens.Text(ctx, label, x + 74, y, 11, "left", "#FFFFFF");
			}
			else {
				Screens.Text(ctx, selected ? "Fire join   < > / click: add a CPU player" : "Press Fire to join", x + box.w / 2, y, 11, "center", selected ? "#A0A0A0" : "#606060");
			}

			// Mouse: point at a seat to select it; click a CPU seat (left half: easier, right half: harder) or the free seat (add a CPU)
			if (i <= joined.length && (i == joined.length || IsBotId(joined[i]))) {
				Screens.AddRegion(x, top, box.w, box.h,
					(function (row) { return function () { cursor = row; }; })(i),
					(function (row) { return function (rel) { cursor = row; joined = LobbyAdjust(joined, row, rel < 0.5 ? -1 : 1, MAX_PLAYERS); }; })(i));
			}
		}

		var need = MinPlayers(mode);
		var ready = joined.length >= need;

		var label = ready ? (joined.length && joined.every(IsBotId) ? "Start - watch the CPU players" : "Start") : "Need " + need + " player" + (need > 1 ? "s" : "") + " to begin";

		Screens.Button(ctx, label, cx - 130, 266, 260, 20, ready, function () { game.StartGame(mode, RosterFromSources(joined), false, level); });

	}
}

if (typeof module !== 'undefined')
	module.exports = {
		RosterFromSources: RosterFromSources, SourceLabel: SourceLabel, MinPlayers: MinPlayers,
		SeatBox: SeatBox, LobbyStartAction: LobbyStartAction, IsBotId: IsBotId, BotLabel: BotLabel, NextBotLevel: NextBotLevel, LobbyRows: LobbyRows, LobbyAdjust: LobbyAdjust
	};
