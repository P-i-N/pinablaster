// Browser side of LAN play: talks to server.py over a WebSocket.
// Role: null (not in a game), "host" (runs the simulation) or "guest" (renders snapshots).

function NetPrototype()
{
	var NAME_KEY = "pinablaster.name";
	var self = this;

	this.Available = false;   // true when this page was served by server.py
	this.Name = "";
	this.MyId = 0;
	this.Room = null;         // latest room state from the server
	this.Role = null;
	this.Socket = null;
	this.SoundQueue = [];     // host: sound ids to forward with the next snapshot
	this.OnMessage = null;    // function(msg): current screen / game
	this.OnClose = null;      // function(reason)

	// Is there a server.py behind this page? (A plain static server answers 404.)
	this.Probe = function()
	{
		return fetch("/api/info", { cache: "no-store" })
			.then(function(r) { return r.ok ? r.json() : null; })
			.then(function(info) { self.Available = !!(info && info.server == "pinablaster-lan"); })
			.catch(function() { self.Available = false; });
	}

	this.EnsureName = function()
	{
		if (this.Name)
			return this.Name;

		var stored = "";

		try { stored = window.localStorage.getItem(NAME_KEY) || ""; } catch (e) {}

		if (!stored)
		{
			var guess = "Player" + Math.floor(100 + Math.random() * 900);
			var typed = window.prompt("Your name for LAN games:", guess);

			stored = (typed || guess).replace(/\s+/g, " ").trim().substr(0, 16) || guess;

			try { window.localStorage.setItem(NAME_KEY, stored); } catch (e) {}
		}

		this.Name = stored;
		return stored;
	}

	this.IsOpen = function()
	{
		return !!this.Socket && this.Socket.readyState == 1;
	}

	// done(ok): called once the server said hello back (or the attempt failed).
	this.Connect = function(done)
	{
		if (this.IsOpen())
		{
			done(true);
			return;
		}

		this.Name = this.EnsureName();

		var scheme = window.location.protocol == "https:" ? "wss://" : "ws://";
		var ws;

		try { ws = new WebSocket(scheme + window.location.host + "/ws"); }
		catch (e) { done(false); return; }

		var finished = false;

		function finish(ok)
		{
			if (!finished)
			{
				finished = true;
				done(ok);
			}
		}

		this.Socket = ws;
		this.Room = null;

		ws.onopen = function() { ws.send(JSON.stringify({ t: "hello", name: self.Name })); };

		ws.onmessage = function(e)
		{
			var msg;

			try { msg = JSON.parse(e.data); } catch (err) { return; }

			if (msg.t == "welcome")
			{
				self.MyId = msg.id;
				finish(true);
			}
			else if (msg.t == "room")
				self.Room = msg.room;
			else if (msg.t == "closed")
				self.Room = null;

			if (self.OnMessage)
				self.OnMessage(msg);
		};

		ws.onclose = function()
		{
			var wasOpen = self.Socket === ws;

			finish(false);

			if (wasOpen)
			{
				self.Socket = null;
				self.Room = null;

				if (self.OnClose)
					self.OnClose("connection lost");
			}
		};

		ws.onerror = function() { finish(false); };
	}

	this.Send = function(obj)
	{
		if (this.IsOpen())
			this.Socket.send(JSON.stringify(obj));
	}

	// Leaves the room and drops the connection (back to a normal local game).
	this.Disconnect = function()
	{
		var ws = this.Socket;

		this.Socket = null;
		this.Room = null;
		this.Role = null;
		this.SoundQueue = [];

		if (ws)
			try { ws.close(); } catch (e) {}
	}
}

var Net = new NetPrototype();
