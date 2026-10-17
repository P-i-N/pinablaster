// Persistent user settings (volumes, integer scaling).

var SETTINGS_KEY = "pinablaster.settings.v1";
var DEFAULT_SETTINGS = { master: 0.8, sfx: 1.0, music: 0.6, integerScale: false, touchMode: "auto", effects: true };

function SanitizeSettings(raw)
{
	var out = {};

	for (var k in DEFAULT_SETTINGS)
		out[k] = DEFAULT_SETTINGS[k];

	if (!raw || typeof raw != "object")
		return out;

	["master", "sfx", "music"].forEach(function(key)
	{
		if (typeof raw[key] == "number" && isFinite(raw[key]))
			out[key] = Math.max(0, Math.min(1, raw[key]));
	});

	if (typeof raw.integerScale == "boolean")
		out.integerScale = raw.integerScale;

	if (typeof raw.effects == "boolean")
		out.effects = raw.effects;

	if (raw.touchMode === "auto" || raw.touchMode === "on" || raw.touchMode === "off")
		out.touchMode = raw.touchMode;

	return out;
}

function SettingsPrototype()
{
	this.Values = SanitizeSettings(null);

	this.Load = function()
	{
		try
		{
			var text = window.localStorage.getItem(SETTINGS_KEY);

			if (text)
				this.Values = SanitizeSettings(JSON.parse(text));
		}
		catch (e)
		{
			// Storage unavailable or corrupt: keep the defaults.
		}

		this.Apply();
	}

	this.Save = function()
	{
		try
		{
			window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.Values));
		}
		catch (e)
		{
			// Storage unavailable: settings last for this session only.
		}
	}

	this.Set = function(key, value)
	{
		var next = {};

		for (var k in this.Values)
			next[k] = this.Values[k];

		next[key] = value;
		this.Values = SanitizeSettings(next);

		this.Apply();
		this.Save();
	}

	this.Apply = function()
	{
		AudioMixer.SetVolume("master", this.Values.master);
		AudioMixer.SetVolume("sfx", this.Values.sfx);
		AudioMixer.SetVolume("music", this.Values.music);

		Display.IntegerScale = this.Values.integerScale;
		Display.Resize();

		TouchControls.SetMode(this.Values.touchMode);
	}
}

if (typeof Engine !== 'undefined') var Settings = new SettingsPrototype();

if (typeof module !== 'undefined') module.exports = { SanitizeSettings: SanitizeSettings };
