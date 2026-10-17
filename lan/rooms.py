"""Room / slot bookkeeping and message routing. Pure logic: no sockets, no game rules.

`handle()` and `disconnect()` return a list of (target_client_id, json_text) to deliver.
"""
import json
import re

MAX_SLOTS = 8
MAX_MEMBERS = 8
MAX_ROOMS = 16
MAX_CLIENTS = 64
MAX_NAME = 16
MIN_PLAYERS = {"campaign": 1, "battle": 2}
BOT_LEVELS = {"easy": "Easy", "normal": "Normal", "hard": "Hard"}
VIRTUAL_KEYS = {"Up", "Right", "Down", "Left", "Bomb", "Start", "Back"}


def clean_name(raw) -> str:
    text = raw if isinstance(raw, str) else ""
    text = re.sub(r"[\x00-\x1f\x7f]", "", text)
    text = re.sub(r"\s+", " ", text).strip()[:MAX_NAME].strip()
    return text or "Player"


def clean_text(raw, limit) -> str:
    text = raw if isinstance(raw, str) else ""
    return re.sub(r"[\x00-\x1f\x7f]", "", text).strip()[:limit]


class RoomManager:
    def __init__(self):
        self.clients = {}  # id -> {"name": str, "named": bool, "room": room id | None}
        self.rooms = {}  # id -> room dict
        self._next_client = 1
        self._next_room = 1

    # ---- connection lifecycle -------------------------------------------------

    def connect(self):
        if len(self.clients) >= MAX_CLIENTS:
            return None

        cid = self._next_client
        self._next_client += 1
        self.clients[cid] = {"name": "Player", "named": False, "room": None}
        return cid

    def disconnect(self, cid):
        if cid not in self.clients:
            return []

        out = self._leave_room(cid)
        del self.clients[cid]
        return out

    # ---- helpers ----------------------------------------------------------------

    @staticmethod
    def _msg(target, obj):
        return (target, json.dumps(obj, separators=(",", ":")))

    def _err(self, cid, text):
        return [self._msg(cid, {"t": "err", "msg": text})]

    def _room_of(self, cid):
        rid = self.clients[cid]["room"]
        return self.rooms.get(rid) if rid is not None else None

    def _public(self, room):
        return {
            "id": room["id"],
            "name": room["name"],
            "mode": room["mode"],
            "state": room["state"],
            "host": room["host"],
            "members": [{"id": m, "name": self.clients[m]["name"]} for m in room["members"]],
            "slots": room["slots"],
        }

    def _broadcast_room(self, room):
        data = self._public(room)
        return [self._msg(m, {"t": "room", "room": data}) for m in room["members"]]

    def _players(self, room):
        return sum(1 for s in room["slots"] if s)

    def _leave_room(self, cid):
        room = self._room_of(cid)

        if room is None:
            return []

        self.clients[cid]["room"] = None
        room["members"].remove(cid)
        out = []

        if room["host"] == cid:
            for m in room["members"]:
                self.clients[m]["room"] = None
                out.append(self._msg(m, {"t": "closed", "reason": "host left"}))

            del self.rooms[room["id"]]
            return out

        freed = [i for i, s in enumerate(room["slots"]) if s and s["client"] == cid]

        for i in freed:
            room["slots"][i] = None

        if room["state"] == "playing" and freed:
            out.append(self._msg(room["host"], {"t": "left", "client": cid, "slots": freed}))

        out += self._broadcast_room(room)
        return out

    # ---- message handling -----------------------------------------------------------

    def handle(self, cid, text):
        if cid not in self.clients:
            return []

        try:
            msg = json.loads(text)
        except (ValueError, RecursionError):
            return self._err(cid, "bad json")

        if not isinstance(msg, dict) or not isinstance(msg.get("t"), str):
            return self._err(cid, "bad message")

        t = msg["t"]
        client = self.clients[cid]

        if t == "hello":
            client["name"] = clean_name(msg.get("name"))
            client["named"] = True
            return [self._msg(cid, {"t": "welcome", "id": cid, "name": client["name"]})]

        if not client["named"]:
            return self._err(cid, "say hello first")

        handler = getattr(self, "_on_" + t, None) if re.fullmatch(r"[a-z]+", t) else None

        if handler is None:
            return self._err(cid, "unknown message")

        return handler(cid, msg, text)

    def _on_rooms(self, cid, msg, text):
        lst = [{"id": r["id"], "name": r["name"], "mode": r["mode"], "state": r["state"],
                "players": self._players(r), "max": MAX_SLOTS} for r in self.rooms.values()]
        return [self._msg(cid, {"t": "rooms", "list": lst})]

    def _on_create(self, cid, msg, text):
        if self._room_of(cid):
            return self._err(cid, "already in a room")

        mode = msg.get("mode")

        if mode not in MIN_PLAYERS:
            return self._err(cid, "bad mode")

        if len(self.rooms) >= MAX_ROOMS:
            return self._err(cid, "too many rooms")

        rid = self._next_room
        self._next_room += 1
        room = {"id": rid, "name": self.clients[cid]["name"] + "'s game", "mode": mode, "state": "lobby",
                "host": cid, "members": [cid], "slots": [None] * MAX_SLOTS}
        self.rooms[rid] = room
        self.clients[cid]["room"] = rid
        return self._broadcast_room(room)

    def _on_join(self, cid, msg, text):
        if self._room_of(cid):
            return self._err(cid, "already in a room")

        room = self.rooms.get(msg.get("room"))

        if room is None:
            return self._err(cid, "no such room")

        if room["state"] != "lobby":
            return self._err(cid, "game already running")

        if len(room["members"]) >= MAX_MEMBERS:
            return self._err(cid, "room is full")

        room["members"].append(cid)
        self.clients[cid]["room"] = room["id"]
        return self._broadcast_room(room)

    def _on_leave(self, cid, msg, text):
        return self._leave_room(cid)

    def _lobby_room(self, cid):
        """(room, error_output). Requires the client to be in a room that is still in its lobby."""
        room = self._room_of(cid)

        if room is None:
            return None, self._err(cid, "not in a room")

        if room["state"] != "lobby":
            return None, self._err(cid, "game already running")

        return room, None

    def _on_claim(self, cid, msg, text):
        room, err = self._lobby_room(cid)

        if err:
            return err

        src = clean_text(msg.get("src"), 12)
        label = clean_text(msg.get("label"), 40)

        if not src:
            return self._err(cid, "missing device")

        if any(s and s["client"] == cid and s["src"] == src for s in room["slots"]):
            return self._err(cid, "device already joined")

        for i, s in enumerate(room["slots"]):
            if s is None:
                room["slots"][i] = {"client": cid, "name": self.clients[cid]["name"], "src": src, "label": label}
                return self._broadcast_room(room)

        return self._err(cid, "no free slot")

    def _on_release(self, cid, msg, text):
        room, err = self._lobby_room(cid)

        if err:
            return err

        slot = msg.get("slot")

        if not isinstance(slot, int) or not 0 <= slot < MAX_SLOTS:
            return self._err(cid, "bad slot")

        s = room["slots"][slot]

        if s is None or s["client"] != cid or s.get("bot"):
            return self._err(cid, "not your slot")

        room["slots"][slot] = None
        return self._broadcast_room(room)

    def _host_slot(self, cid, msg):
        """(room, slot, error_output) for host-only slot commands in the lobby."""
        room, err = self._lobby_room(cid)

        if err:
            return None, None, err

        if room["host"] != cid:
            return None, None, self._err(cid, "host only")

        slot = msg.get("slot")

        if not isinstance(slot, int) or not 0 <= slot < MAX_SLOTS:
            return None, None, self._err(cid, "bad slot")

        return room, slot, None

    def _on_bot(self, cid, msg, text):
        room, slot, err = self._host_slot(cid, msg)

        if err:
            return err

        level = msg.get("level")

        if not isinstance(level, str) or level not in BOT_LEVELS:
            return self._err(cid, "bad level")

        s = room["slots"][slot]

        if s is not None and not s.get("bot"):
            return self._err(cid, "seat is taken")

        room["slots"][slot] = {"client": cid, "name": "CPU", "src": "ai", "label": "AI - " + BOT_LEVELS[level], "bot": level}
        return self._broadcast_room(room)

    def _on_unbot(self, cid, msg, text):
        room, slot, err = self._host_slot(cid, msg)

        if err:
            return err

        s = room["slots"][slot]

        if s is None or not s.get("bot"):
            return self._err(cid, "not a bot")

        room["slots"][slot] = None
        return self._broadcast_room(room)

    def _on_mode(self, cid, msg, text):
        room, err = self._lobby_room(cid)

        if err:
            return err

        if room["host"] != cid:
            return self._err(cid, "host only")

        if msg.get("mode") not in MIN_PLAYERS:
            return self._err(cid, "bad mode")

        room["mode"] = msg["mode"]
        return self._broadcast_room(room)

    def _on_start(self, cid, msg, text):
        room, err = self._lobby_room(cid)

        if err:
            return err

        if room["host"] != cid:
            return self._err(cid, "host only")

        if self._players(room) < MIN_PLAYERS[room["mode"]]:
            return self._err(cid, "not enough players")

        room["state"] = "playing"
        start = {"t": "start", "mode": room["mode"], "slots": room["slots"]}
        return [self._msg(m, start) for m in room["members"]] + self._broadcast_room(room)

    def _on_end(self, cid, msg, text):
        room = self._room_of(cid)

        if room is None or room["host"] != cid or room["state"] != "playing":
            return self._err(cid, "cannot end the game")

        room["state"] = "lobby"
        out = [self._msg(m, {"t": "back"}) for m in room["members"] if m != cid]
        return out + self._broadcast_room(room)

    def _on_snap(self, cid, msg, text):
        room = self._room_of(cid)

        if room is None or room["host"] != cid or room["state"] != "playing":
            return self._err(cid, "cannot send snapshots")

        return [(m, text) for m in room["members"] if m != cid]

    def _on_input(self, cid, msg, text):
        room = self._room_of(cid)

        if room is None or room["state"] != "playing" or room["host"] == cid:
            return self._err(cid, "cannot send input")

        slot = msg.get("slot")

        if not isinstance(slot, int) or not 0 <= slot < MAX_SLOTS:
            return self._err(cid, "bad slot")

        s = room["slots"][slot]

        if s is None or s["client"] != cid:
            return self._err(cid, "not your slot")

        keys = msg.get("k")
        latch = msg.get("l")

        for lst in (keys, latch):
            if not isinstance(lst, list) or len(lst) > len(VIRTUAL_KEYS) or any(k not in VIRTUAL_KEYS for k in lst):
                return self._err(cid, "bad input")

        return [self._msg(room["host"], {"t": "input", "from": cid, "slot": slot, "k": keys, "l": latch})]
