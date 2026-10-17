// Screen stack, menu model, and the pause / options screens.

function MenuModel(items)
{
	this.Items = items;
	this.Index = 0;

	function enabled(item)
	{
		return !item.Disabled || !item.Disabled();
	}

	this.Move = function(delta)
	{
		var n = this.Items.length;

		for (var i = 0; i < n; ++i)
		{
			this.Index = (this.Index + delta + n) % n;

			if (enabled(this.Items[this.Index]))
				return;
		}
	}

	this.LabelOf = function(i)
	{
		var l = this.Items[i].Label;
		return typeof l == "function" ? l() : l;
	}

	// m: the object returned by Input.Menu()
	this.Handle = function(m)
	{
		var item = this.Items[this.Index];

		if (m.Up) this.Move(-1);
		else if (m.Down) this.Move(1);
		else if (m.Left && item.OnAdjust) item.OnAdjust(-1);
		else if (m.Right && item.OnAdjust) item.OnAdjust(1);
		else if (m.Confirm && item.OnConfirm && enabled(item)) item.OnConfirm();
	}
}

// The topmost region (last added) containing the point, or null. Regions: { x, y, w, h, hover, click }.
function RegionAt(regions, x, y)
{
	for (var i = regions.length - 1; i >= 0; --i)
	{
		var r = regions[i];

		if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h)
			return r;
	}

	return null;
}

// A click on menu item `i`, `rel` of the way (0 left .. 1 right) across it: an item you can only adjust (a volume)
// changes down / up by the half you hit, anything else is confirmed. A disabled item does nothing.
function MenuClick(model, i, rel)
{
	var item = model.Items[i];

	if (!item || (item.Disabled && item.Disabled()))
		return false;

	model.Index = i;

	if (item.OnAdjust && !item.OnConfirm)
		item.OnAdjust(rel < 0.5 ? -1 : 1);
	else if (item.OnConfirm)
		item.OnConfirm();
	else
		return false;

	return true;
}

function ScreenManagerPrototype()
{
	// Where the mouse can act on the screen that was drawn last (see AddRegion)
	this.Regions = [];

	var stack = [];

	function sync()
	{
		var paused = false;

		for (var i = 0; i < stack.length; ++i)
			if (stack[i].PausesGame)
				paused = true;

		Engine.Paused = paused;
	}

	this.Current = function() { return stack.length ? stack[stack.length - 1] : null; }

	this.Push = function(screen) { stack.push(screen); sync(); }
	this.Pop = function() { stack.pop(); sync(); }
	this.Replace = function(screen) { stack.pop(); stack.push(screen); sync(); }
	this.Clear = function() { stack = []; sync(); }

	this.Update = function()
	{
		var top = this.Current();

		if (top)
			top.Update(this.HandleMouse(Input.Menu()));
		else
			Mouse.Flush();
	}

	// A clickable area of the screen being drawn: hover() when the pointer moves onto it, click(rel, rely) on a left click
	// (rel: 0..1 across it). Screens add theirs while they draw; only the top screen's regions stay.
	this.AddRegion = function(x, y, w, h, hover, click)
	{
		this.Regions.push({ x: x, y: y, w: w, h: h, hover: hover, click: click });
	}

	this.Hovered = function(x, y, w, h)
	{
		return Mouse.Inside && Mouse.X >= x && Mouse.Y >= y && Mouse.X < x + w && Mouse.Y < y + h;
	}

	// Applies what the mouse did to the regions of the screen on top; a right click counts as Back (and sets MouseBack).
	// Returns the menu input to give that screen (a copy, with Back set by a right click).
	this.HandleMouse = function(m)
	{
		var over = Mouse.Inside ? RegionAt(this.Regions, Mouse.X, Mouse.Y) : null;

		Mouse.SetCursor(!!(over && over.click));

		if (Mouse.TakeMoved() && over && over.hover)
			over.hover();

		for (var c = Mouse.TakeClick(); c; c = Mouse.TakeClick())
		{
			var hit = RegionAt(this.Regions, c.x, c.y);

			if (c.button == 0 && hit && hit.click)
				hit.click((c.x - hit.x) / hit.w, (c.y - hit.y) / hit.h);
			else if (c.button == 2)
			{
				m = Object.assign({}, m);
				m.Back = true;
				m.MouseBack = true;   // (screens that treat Back per device, like the lobbies, need to tell this one apart)
			}
		}

		return m;
	}

	// A drawn button (and its region): label centred in the box, brighter under the pointer, greyed when not enabled.
	this.Button = function(ctx, label, x, y, w, h, enabled, onClick)
	{
		var hot = enabled && this.Hovered(x, y, w, h);

		ctx.fillStyle = hot ? "#FFD040" : "#2a2a36";
		ctx.fillRect(x, y, w, h);
		ctx.fillStyle = enabled ? "#14141c" : "#101018";
		ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
		this.Text(ctx, label, x + w / 2, y + h / 2, 11, "center", enabled ? (hot ? "#FFFFFF" : "#C0C0C0") : "#505050");

		if (enabled)
			this.AddRegion(x, y, w, h, null, onClick);
	}

	this.Draw = function(ctx)
	{
		for (var i = 0; i < stack.length; ++i)
		{
			// (only the top screen's regions count: the ones below it are dimmed and out of reach)
			this.Regions = [];
			stack[i].Draw(ctx);
		}

		if (!stack.length)
			this.Regions = [];
	}

	// Outlined text. align: "left" | "center" | "right".
	this.Text = function(ctx, text, x, y, size, align, color)
	{
		ctx.textAlign = align || "left";
		ctx.textBaseline = "middle";
		ctx.font = "Bold " + size + "px Trebuchet MS";

		ctx.fillStyle = "#000000";
		ctx.fillText(text, x + 1, y + 1);
		ctx.fillText(text, x - 1, y - 1);
		ctx.fillText(text, x + 1, y - 1);
		ctx.fillText(text, x - 1, y + 1);

		ctx.fillStyle = color || "#FFFFFF";
		ctx.fillText(text, x, y);
		ctx.textAlign = "left";
	}

	this.Dim = function(ctx)
	{
		ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
		ctx.fillRect(0, 0, Display.VirtualWidth, Display.VirtualHeight);
	}

	this.DrawMenu = function(ctx, title, model, hint, top)
	{
		top = top || 124;
		var cx = Display.VirtualWidth / 2;

		this.Text(ctx, title, cx, 70, 26, "center", "#FFD040");

		for (var i = 0; i < model.Items.length; ++i)
		{
			var item = model.Items[i];
			var disabled = item.Disabled && item.Disabled();
			var selected = (i == model.Index);
			var label = model.LabelOf(i);
			var color = disabled ? "#505050" : (selected ? "#FFFFFF" : "#A0A0A0");

			this.Text(ctx, selected ? "> " + label + " <" : label, cx, top + i * 26, 15, "center", color);

			if (!disabled)
				this.AddRegion(cx - 150, top + i * 26 - 13, 300, 26, (function(index) { return function() { model.Index = index; }; })(i), (function(index) { return function(rel) { MenuClick(model, index, rel); }; })(i));
		}

		if (hint)
			this.Text(ctx, hint, cx, 306, 10, "center", "#C0C0C0");
	}
}

if (typeof Engine !== 'undefined') var Screens = new ScreenManagerPrototype();

function OptionsScreen()
{
	// In a LAN game the simulation keeps running under menus.
	this.PausesGame = !Net.Role;

	function volumeItem(label, key)
	{
		return {
			Label: function() { return label + ": " + Math.round(Settings.Values[key] * 100) + "%"; },
			OnAdjust: function(dir) { Settings.Set(key, Math.round((Settings.Values[key] + dir * 0.1) * 10) / 10); }
		};
	}

	var model = new MenuModel(
	[
		volumeItem("Master volume", "master"),
		volumeItem("Effects volume", "sfx"),
		volumeItem("Music volume", "music"),
		{
			Label: function() { return "Integer scaling: " + (Settings.Values.integerScale ? "On" : "Off"); },
			OnConfirm: function() { Settings.Set("integerScale", !Settings.Values.integerScale); },
			OnAdjust: function() { Settings.Set("integerScale", !Settings.Values.integerScale); }
		},
		{
			Label: function() { return "Wind effects: " + (Settings.Values.effects ? "On" : "Off"); },
			OnConfirm: function() { Settings.Set("effects", !Settings.Values.effects); },
			OnAdjust: function() { Settings.Set("effects", !Settings.Values.effects); }
		},
		{
			Label: function() { return "Touch controls: " + { auto: "Auto", on: "On", off: "Off" }[Settings.Values.touchMode]; },
			OnConfirm: function() { Settings.Set("touchMode", NextTouchMode(Settings.Values.touchMode, 1)); },
			OnAdjust: function(dir) { Settings.Set("touchMode", NextTouchMode(Settings.Values.touchMode, dir)); }
		},
		{ Label: "Fullscreen (F)", OnConfirm: function() { Display.ToggleFullscreen(); } }
	]);

	this.Update = function(m)
	{
		if (m.Back)
			Screens.Pop();
		else
			model.Handle(m);
	}

	this.Draw = function(ctx)
	{
		Screens.Dim(ctx);
		Screens.DrawMenu(ctx, "OPTIONS", model, null);
	}
}

function PauseScreen(game)
{
	this.PausesGame = true;

	var model = new MenuModel(
	[
		{ Label: "Resume", OnConfirm: function() { Screens.Pop(); } },
		{ Label: "Options", OnConfirm: function() { Screens.Push(new OptionsScreen()); } },
		{ Label: "Quit to title", OnConfirm: function() { game.ShowTitle(); } }
	]);

	this.Update = function(m)
	{
		if (m.Back)
			Screens.Pop();
		else
			model.Handle(m);
	}

	this.Draw = function(ctx)
	{
		Screens.Dim(ctx);
		Screens.DrawMenu(ctx, "PAUSED", model, null);
	}
}

function ResultScreen(title, lines, items)
{
	this.PausesGame = true;

	var model = new MenuModel(items);

	// What LAN guests see while the host picks an option.
	this.Describe = function()
	{
		return { title: title, lines: lines, items: items.map(function(it, i) { return model.LabelOf(i); }), sel: model.Index };
	}

	this.Update = function(m)
	{
		model.Handle(m);
	}

	this.Draw = function(ctx)
	{
		Screens.Dim(ctx);

		for (var i = 0; i < lines.length; ++i)
			Screens.Text(ctx, lines[i], Display.VirtualWidth / 2, 104 + i * 16, 12, "center", "#C0C0C0");

		Screens.DrawMenu(ctx, title, model, null, 104 + lines.length * 16 + 28);
	}
}

// In-game menu for LAN games: does not pause (everybody else keeps playing).
function LeaveScreen(game)
{
	this.PausesGame = false;

	var model = new MenuModel(
	[
		{ Label: "Resume", OnConfirm: function() { Screens.Pop(); } },
		{ Label: "Options", OnConfirm: function() { Screens.Push(new OptionsScreen()); } },
		{ Label: "Leave game", OnConfirm: function() { game.ShowTitle(); } }
	]);

	this.Update = function(m)
	{
		if (m.Back)
			Screens.Pop();
		else
			model.Handle(m);
	}

	this.Draw = function(ctx)
	{
		Screens.Dim(ctx);
		Screens.DrawMenu(ctx, "MENU", model, null);
	}
}

// A message with one button (connection problems and the like).
function MessageScreen(text)
{
	this.PausesGame = true;

	var model = new MenuModel([{ Label: "OK", OnConfirm: function() { Screens.Pop(); } }]);

	this.Update = function(m)
	{
		if (m.Back)
			Screens.Pop();
		else
			model.Handle(m);
	}

	this.Draw = function(ctx)
	{
		Screens.Dim(ctx);
		Screens.Text(ctx, text, Display.VirtualWidth / 2, 110, 13, "center", "#FFFFFF");
		Screens.DrawMenu(ctx, "", model, null, 150);
	}
}

if (typeof module !== 'undefined') module.exports = { MenuModel: MenuModel, MenuClick: MenuClick, RegionAt: RegionAt };
