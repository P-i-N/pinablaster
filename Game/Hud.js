// Side-panel HUD. Virtual canvas is 576x324; the map sits in the middle,
// leaving a 58px panel on each side.

var PLAYER_COLORS = ["#e8e8e8", "#4aa3ff", "#ff5a4a", "#4fd35f", "#ffd640", "#be6eff", "#3cdcd7", "#ff8cc8"];

function HudPrototype()
{
	var PANEL_W = 58;
	var CARD_W = 52;
	var TOP_BAND = 24;
	var CARD_H = 148;
	var COMPACT_CARD_H = 100;   // 3 cards per side when more than 4 players share the screen
	var TIGHT_CARD_H = 75;      // 4 cards per side for 7-8 players
	var COMPACT_PITCH = 14;
	var PITCH = 16;

	this.Text = function(ctx, text, x, y, align)
	{
		ctx.textAlign = align || "left";
		ctx.textBaseline = "middle";
		ctx.font = "Bold 10px Trebuchet MS";

		ctx.fillStyle = "#000000";
		ctx.fillText(text, x + 1, y);
		ctx.fillText(text, x - 1, y);
		ctx.fillText(text, x, y - 1);
		ctx.fillText(text, x, y + 1);

		ctx.fillStyle = "#FFFFFF";
		ctx.fillText(text, x, y);
		ctx.textAlign = "left";
	}

	// Small print (what a CPU player is up to)
	this.SmallText = function(ctx, text, x, y, align)
	{
		ctx.textAlign = align || "left";
		ctx.textBaseline = "middle";
		ctx.font = "Bold 8px Trebuchet MS";

		ctx.fillStyle = "#000000";
		ctx.fillText(text, x + 1, y);
		ctx.fillText(text, x - 1, y);
		ctx.fillText(text, x, y - 1);
		ctx.fillText(text, x, y + 1);

		ctx.fillStyle = "#ffe9a0";
		ctx.fillText(text, x, y);
		ctx.textAlign = "left";
	}

	// The wipe between campaign levels: black everywhere in the map area except a circle (iris: { cx, cy, r, x, y, w, h } - the circle
	// and the map area, in canvas pixels). A circle that covers the whole area draws nothing.
	this.DrawIris = function(ctx, iris)
	{
		var reach = Math.sqrt(Math.pow(Math.max(iris.cx - iris.x, iris.x + iris.w - iris.cx), 2) + Math.pow(Math.max(iris.cy - iris.y, iris.y + iris.h - iris.cy), 2));

		if (iris.r >= reach)
			return;

		ctx.save();
		ctx.beginPath();
		ctx.rect(iris.x, iris.y, iris.w, iris.h);
		ctx.clip();
		ctx.beginPath();
		ctx.rect(iris.x - 1, iris.y - 1, iris.w + 2, iris.h + 2);

		if (iris.r > 0)
			ctx.arc(iris.cx, iris.cy, iris.r, 0, Math.PI * 2, true);

		ctx.fillStyle = "#000000";
		ctx.fill();
		ctx.restore();
	}

	// Timers blink during their last 5 seconds.
	function timerVisible(time, blink)
	{
		return time > 5.0 || blink;
	}

	this.DrawCard = function(ctx, p, label, color, x, y, blink, wins, intent)
	{
		var ss = Renderer.SpriteSheet;

		ctx.fillStyle = color;
		ctx.fillRect(x, y, CARD_W, 11);
		this.Text(ctx, label, x + CARD_W / 2, y + 6, "center");

		var ry = y + 14;

		if (wins !== undefined)
		{
			// Battle: no lives or hearts, just the round wins
			this.Text(ctx, "Wins: " + wins, x + 2, ry + 8);
			ry += PITCH;
		}
		else
		{
			// Lifes
			ss.DrawSpriteByIndex(ctx, x, ry, 194);
			this.Text(ctx, "x" + p.Lifes.toString(), x + 12, ry + 12);
			ry += PITCH;

			// Hearts
			if (p.Hearts > 0 || p.InvulnerableTime > 0.0 || (blink && !p.IsDead))
			{
				for (var i = 0; i < 3; ++i)
					ss.DrawSpriteByIndex(ctx, x + 3 + i * 7, ry, 198);
			}

			for (var i = 0; i < p.Hearts; ++i)
				ss.DrawSpriteByIndex(ctx, x + 3 + i * 7, ry, 178);

			if (p.InvulnerableTime > 0.0 && blink && p.Hearts < 3)
				ss.DrawSpriteByIndex(ctx, x + 3 + p.Hearts * 7, ry, 178);

			ry += PITCH;
		}

		// Bombs
		ss.DrawSpriteByIndex(ctx, x, ry, 61);
		this.Text(ctx, "x" + p.TotalBombs.toString(), x + 12, ry + 12);
		ry += PITCH;

		// Power
		ss.DrawSpriteByIndex(ctx, x, ry, 174);
		this.Text(ctx, "x" + p.Power.toString(), x + 12, ry + 12);
		ry += PITCH;

		// Timed power-ups
		var timers = [[p.SkateTime, 176], [p.PushableBombsTime, 177], [p.SuperBombsTime, 195], [p.BadLuckTime, 179]];

		for (var t = 0; t < timers.length; ++t)
		{
			if (timers[t][0] > 0.0)
			{
				if (timerVisible(timers[t][0], blink))
				{
					ss.DrawSpriteByIndex(ctx, x, ry, timers[t][1]);
					this.Text(ctx, parseInt(timers[t][0] + 0.5).toString(), x + 20, ry + 12);
				}

				ry += PITCH;
			}
		}

		if (intent && !p.IsDead)
			this.SmallText(ctx, intent, x + CARD_W / 2, Math.min(ry + 11, y + CARD_H - 8), "center");
	}

	// Smaller card for 5-8 players: stats in a two-column grid instead of one per row.
	this.DrawCardCompact = function(ctx, p, label, color, x, y, blink, wins, intent, cardH)
	{
		var ss = Renderer.SpriteSheet;

		ctx.fillStyle = color;
		ctx.fillRect(x, y, CARD_W, 11);
		this.Text(ctx, label, x + CARD_W / 2, y + 6, "center");

		var items = [];

		if (wins !== undefined)
			items.push({ text: "W:" + wins });
		else
			items.push({ icon: 194, text: "x" + p.Lifes.toString() });

		items.push({ icon: 61, text: "x" + p.TotalBombs.toString() });

		if (wins === undefined)
			items.push({ hearts: true });

		items.push({ icon: 174, text: "x" + p.Power.toString() });

		var timers = [[p.SkateTime, 176], [p.PushableBombsTime, 177], [p.SuperBombsTime, 195], [p.BadLuckTime, 179]];

		for (var t = 0; t < timers.length; ++t)
		{
			if (timers[t][0] > 0.0)
				items.push(timerVisible(timers[t][0], blink) ? { icon: timers[t][1], text: parseInt(timers[t][0] + 0.5).toString() } : {});
		}

		for (var n = 0; n < items.length; ++n)
		{
			var it = items[n];
			var ix = x + (n % 2) * 26;
			var iy = y + 13 + Math.floor(n / 2) * COMPACT_PITCH;

			if (it.hearts)
			{
				if (p.Hearts > 0 || p.InvulnerableTime > 0.0 || (blink && !p.IsDead))
					for (var h = 0; h < 3; ++h)
						ss.DrawSpriteByIndex(ctx, ix + 1 + h * 7, iy, 198);

				for (var h2 = 0; h2 < p.Hearts; ++h2)
					ss.DrawSpriteByIndex(ctx, ix + 1 + h2 * 7, iy, 178);

				if (p.InvulnerableTime > 0.0 && blink && p.Hearts < 3)
					ss.DrawSpriteByIndex(ctx, ix + 1 + p.Hearts * 7, iy, 178);

				continue;
			}

			if (it.icon !== undefined)
				ss.DrawSpriteByIndex(ctx, ix, iy, it.icon);

			if (it.text !== undefined)
				this.Text(ctx, it.text, ix + (it.icon !== undefined ? 11 : 1), iy + 8);
		}

		if (intent && !p.IsDead)
			this.SmallText(ctx, intent, x + CARD_W / 2, Math.min(y + 13 + Math.ceil(items.length / 2) * COMPACT_PITCH + 9, y + cardH - 5), "center");
	}

	// "P1".."P6" above each player for the first 3 seconds after spawning (map coordinates).
	this.DrawPlayerLabels = function(ctx, players)
	{
		for (var i = 0; i < players.length; ++i)
		{
			var p = players[i];

			if (p.Time < 3.0 && !p.IsDead)
				this.Text(ctx, "P" + (p.Index + 1), p.X + 8, p.Y - 7, "center");
		}
	}

	// title: text for the top-left band; keyFlags: bitmask of collected keys (top-right band).
	this.Draw = function(ctx, players, title, keyFlags, blink, extra)
	{
		var ss = Renderer.SpriteSheet;
		var rightX = Display.VirtualWidth - PANEL_W;

		this.Text(ctx, title, 3, 12);

		for (var i = 0, n = 0, flag = 1; i < 4; ++i, flag *= 2)
		{
			if (keyFlags & flag)
			{
				ss.DrawSpriteScaled(ctx, rightX + 3 + n * 13, 4, 98 + i * 20, 0.6);
				++n;
			}
		}

		if (extra && extra.clock)
			this.Text(ctx, extra.clock, rightX + 3, 12);

		if (extra && extra.iris)
			this.DrawIris(ctx, extra.iris);

		var compact = players.length > 4;

		for (var s = 0; s < players.length && s < MAX_PLAYERS; ++s)
		{
			var x = (s % 2 == 0) ? 3 : rightX + 3;
			var y = TOP_BAND + Math.floor(s / 2) * (players.length > 6 ? TIGHT_CARD_H : (compact ? COMPACT_CARD_H : CARD_H));

			var intent = extra && extra.intents ? extra.intents[s] : "";
			var cardH = players.length > 6 ? TIGHT_CARD_H : COMPACT_CARD_H;

			(compact ? this.DrawCardCompact : this.DrawCard).call(this, ctx, players[s], extra && extra.names && extra.names[s] ? extra.names[s].substr(0, 8) : "P" + (s + 1), PLAYER_COLORS[s], x, y, blink, extra && extra.wins ? extra.wins[s] : undefined, intent, cardH);
		}
	}
}

var Hud = new HudPrototype();
