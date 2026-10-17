// What a LAN guest sees: the host's snapshots, drawn with the normal Renderer and HUD.
// Guests run no game logic. Entities are interpolated between snapshots.

function GuestViewPrototype()
{
	var interp = new Interpolator(50);
	var sender = new InputSender(250);
	var owned = [];            // [{ slot, idx }] slots this machine plays (idx = player index)

	this.Players = [];
	this.Hud = { title: "", kf: 0, extra: undefined, nt: "" };
	this.Overlay = null;
	this.Mode = null;
	this.Level = 0;
	this.GotSnapshot = false;

	this.Start = function(ownedSlots)
	{
		this.Reset();
		owned = ownedSlots;
	}

	this.Reset = function()
	{
		interp = new Interpolator(50);
		sender = new InputSender(250);
		owned = [];
		this.Players = [];
		this.Overlay = null;
		this.GotSnapshot = false;
	}

	this.Apply = function(snap, nowMs)
	{
		if (snap.w)
		{
			GameWorld.Walls = snap.w.slice();
			GameWorld.Invalidate();
		}

		interp.Push(nowMs, snap.e.map(DecodeEntity));

		this.Players = snap.p.map(DecodePlayer);
		PlayerManager.Players = this.Players;
		PlayerManager.KeyFlags = snap.hud.kf;

		this.Hud = snap.hud;
		this.Overlay = snap.ov;
		this.Mode = snap.mode;
		this.Level = snap.lv;
		this.GotSnapshot = true;

		for (var i = 0; i < snap.snd.length; ++i)
		{
			var id = snap.snd[i];

			if (id.charAt(0) == "!")
				AudioMixer.Stop(id.substr(1));
			else
				AudioMixer.Play(id);
		}
	}

	// Once per animation frame: send the input of this machine's players to the host.
	this.SendInput = function(nowMs, menuOpen)
	{
		for (var i = 0; i < owned.length; ++i)
		{
			var keys = menuOpen ? { held: [], pressed: [] } : ActionToKeys(Input.Player(owned[i].idx));
			var msg = sender.Next(owned[i].slot, keys.held, keys.pressed, nowMs);

			if (msg)
				Net.Send(msg);
		}
	}

	function sheetFor(tint)
	{
		return Tint.GetSheet(tint);
	}

	function flameFor(index)
	{
		return Tint.GetFlameSheet(index % PLAYER_FLAME_COLORS.length);
	}

	this.Draw = function(game)
	{
		var ctx = Engine.Context;

		GameEntityManager.Entities = interp.Sample(performance.now()).map(function(d) { return ToProxy(d, sheetFor, flameFor); });

		// Regenerates the cached floor / wall image after the host changed the walls.
		GameWorld.Tick(0);

		Renderer.Draw();

		if (!this.GotSnapshot)
		{
			Screens.Text(ctx, "Waiting for the host...", Display.VirtualWidth / 2, Display.VirtualHeight / 2, 14, "center", "#C0C0C0");
			return;
		}

		var blink = Math.floor(performance.now() / 100) % 2 == 1;

		Hud.Draw(ctx, this.Players, this.Hud.title, this.Hud.kf, blink, this.Hud.extra);

		if (this.Hud.nt)
			Hud.Text(ctx, this.Hud.nt, Display.VirtualWidth / 2, 14, "center");

		if (this.Overlay)
			this.DrawOverlay(ctx, this.Overlay);
	}

	// The host's result screen, read-only for guests.
	this.DrawOverlay = function(ctx, ov)
	{
		var cx = Display.VirtualWidth / 2;

		Screens.Dim(ctx);
		Screens.Text(ctx, ov.title, cx, 70, 26, "center", "#FFD040");

		for (var i = 0; i < ov.lines.length; ++i)
			Screens.Text(ctx, ov.lines[i], cx, 104 + i * 16, 12, "center", "#C0C0C0");

		for (var j = 0; j < ov.items.length; ++j)
			Screens.Text(ctx, ov.items[j], cx, 104 + ov.lines.length * 16 + 28 + j * 26, 15, "center", j == ov.sel ? "#FFFFFF" : "#808080");

		Screens.Text(ctx, "Waiting for the host...", cx, 306, 10, "center", "#C0C0C0");
	}
}

var GuestView = new GuestViewPrototype();
