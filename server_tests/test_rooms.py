import json
import unittest

from lan.rooms import RoomManager


class Harness:
    """Drives a RoomManager like a set of clients and records what each one receives."""

    def __init__(self):
        self.m = RoomManager()
        self.inbox = {}

    def connect(self, name="P"):
        cid = self.m.connect()
        self.inbox[cid] = []
        self.send(cid, {"t": "hello", "name": name})
        return cid

    def send(self, cid, obj):
        return self.deliver(self.m.handle(cid, json.dumps(obj)))

    def raw(self, cid, text):
        return self.deliver(self.m.handle(cid, text))

    def disconnect(self, cid):
        return self.deliver(self.m.disconnect(cid))

    def deliver(self, out):
        msgs = []
        for target, text in out:
            self.inbox.setdefault(target, []).append(text)
            msgs.append((target, json.loads(text)))
        return msgs

    def last(self, cid, t):
        for text in reversed(self.inbox[cid]):
            if json.loads(text)["t"] == t:
                return json.loads(text)
        return None

    def types(self, cid):
        return [json.loads(t)["t"] for t in self.inbox[cid]]


class RoomsTest(unittest.TestCase):
    def setUp(self):
        self.h = Harness()
        self.host = self.h.connect("Alice")
        self.h.send(self.host, {"t": "create", "mode": "campaign"})
        self.room = self.h.last(self.host, "room")["room"]
        self.guest = self.h.connect("Bob")
        self.h.send(self.guest, {"t": "join", "room": self.room["id"]})

    def test_hello_welcome_and_name_cleanup(self):
        cid = self.h.connect("  Bob\x00\x07   the   Builder-with-a-very-long-name ")
        name = self.h.last(cid, "welcome")["name"]
        self.assertLessEqual(len(name), 16)
        self.assertNotIn("\x00", name)
        self.assertTrue(name.startswith("Bob"))

    def test_must_say_hello_first(self):
        cid = self.h.m.connect()
        self.h.inbox[cid] = []
        self.h.send(cid, {"t": "rooms"})
        self.assertEqual(self.h.types(cid), ["err"])

    def test_garbage_gets_an_error_not_an_exception(self):
        for text in ["not json", "[]", '{"x":1}', '{"t": 5}', '{"t":"nope"}']:
            self.h.raw(self.guest, text)
        self.assertEqual(self.h.types(self.guest)[-5:], ["err"] * 5)

    def test_room_list(self):
        c = self.h.connect("Carol")
        self.h.send(c, {"t": "rooms"})
        lst = self.h.last(c, "rooms")["list"]
        self.assertEqual(len(lst), 1)
        self.assertEqual(lst[0]["id"], self.room["id"])
        self.assertEqual(lst[0]["players"], 0)
        self.assertEqual(lst[0]["state"], "lobby")

    def test_join_broadcasts_room_to_everyone(self):
        r = self.h.last(self.host, "room")["room"]
        self.assertEqual([m["id"] for m in r["members"]], [self.host, self.guest])

    def test_cannot_create_twice_or_with_bad_mode(self):
        self.h.send(self.host, {"t": "create", "mode": "campaign"})
        self.assertEqual(self.h.types(self.host)[-1], "err")
        c = self.h.connect("C")
        self.h.send(c, {"t": "create", "mode": "chess"})
        self.assertEqual(self.h.types(c)[-1], "err")

    def test_claim_takes_first_free_slot_and_rejects_duplicate_source(self):
        self.h.send(self.guest, {"t": "claim", "src": "kb0", "label": "Keyboard"})
        self.h.send(self.host, {"t": "claim", "src": "kb0", "label": "Keyboard"})
        self.h.send(self.host, {"t": "claim", "src": "kb0", "label": "Keyboard"})  # duplicate
        slots = self.h.last(self.host, "room")["room"]["slots"]
        self.assertEqual(slots[0]["client"], self.guest)
        self.assertEqual(slots[1]["client"], self.host)
        self.assertEqual(self.h.types(self.host)[-1], "err")

    def test_eight_slot_cap(self):
        for i in range(8):
            self.h.send(self.host, {"t": "claim", "src": "pad%d" % i, "label": "pad"})
        slots = self.h.last(self.host, "room")["room"]["slots"]
        self.assertEqual(len(slots), 8)
        self.assertTrue(all(slots))
        self.h.send(self.guest, {"t": "claim", "src": "kb0", "label": "k"})
        self.assertEqual(self.h.types(self.guest)[-1], "err")

    def test_release_only_by_owner(self):
        self.h.send(self.host, {"t": "claim", "src": "kb0", "label": "k"})
        self.h.send(self.guest, {"t": "release", "slot": 0})
        self.assertEqual(self.h.types(self.guest)[-1], "err")
        self.h.send(self.host, {"t": "release", "slot": 0})
        self.assertIsNone(self.h.last(self.host, "room")["room"]["slots"][0])

    def test_mode_is_host_only(self):
        self.h.send(self.guest, {"t": "mode", "mode": "battle"})
        self.assertEqual(self.h.types(self.guest)[-1], "err")
        self.h.send(self.host, {"t": "mode", "mode": "battle"})
        self.assertEqual(self.h.last(self.guest, "room")["room"]["mode"], "battle")

    def test_start_needs_host_and_enough_players(self):
        self.h.send(self.guest, {"t": "start"})
        self.assertEqual(self.h.types(self.guest)[-1], "err")
        self.h.send(self.host, {"t": "start"})  # nobody claimed a slot
        self.assertEqual(self.h.types(self.host)[-1], "err")
        self.h.send(self.host, {"t": "mode", "mode": "battle"})
        self.h.send(self.host, {"t": "claim", "src": "kb0", "label": "k"})
        self.h.send(self.host, {"t": "start"})  # battle needs 2
        self.assertEqual(self.h.types(self.host)[-1], "err")
        self.h.send(self.guest, {"t": "claim", "src": "kb0", "label": "k"})
        out = self.h.send(self.host, {"t": "start"})
        self.assertEqual({t for t, m in out if m["t"] == "start"}, {self.host, self.guest})
        self.assertEqual(self.h.last(self.guest, "start")["mode"], "battle")
        self.assertEqual(self.h.last(self.host, "room")["room"]["state"], "playing")

    def start_game(self):
        self.h.send(self.host, {"t": "claim", "src": "kb0", "label": "k"})
        self.h.send(self.guest, {"t": "claim", "src": "kb0", "label": "k"})
        self.h.send(self.host, {"t": "start"})

    def test_snap_relayed_verbatim_to_guests_only_and_only_from_host(self):
        self.start_game()
        before = len(self.h.inbox[self.host])
        text = '{"t":"snap","s":1,"e":[[1,2,3]]}'
        out = self.h.raw(self.host, text)
        self.assertEqual([t for t, m in out], [self.guest])
        self.assertEqual(self.h.inbox[self.guest][-1], text)  # byte-for-byte relay
        self.assertEqual(len(self.h.inbox[self.host]), before)
        self.h.raw(self.guest, text)
        self.assertEqual(self.h.types(self.guest)[-1], "err")

    def test_input_goes_to_host_only_and_only_for_owned_slot(self):
        self.start_game()
        out = self.h.send(self.guest, {"t": "input", "slot": 1, "k": ["Up", "Bomb"], "l": ["Bomb"]})
        self.assertEqual([t for t, m in out], [self.host])
        msg = out[0][1]
        self.assertEqual((msg["t"], msg["from"], msg["slot"], msg["k"], msg["l"]), ("input", self.guest, 1, ["Up", "Bomb"], ["Bomb"]))
        out = self.h.send(self.guest, {"t": "input", "slot": 0, "k": [], "l": []})  # host's slot
        self.assertEqual(out[0][1]["t"], "err")
        out = self.h.send(self.guest, {"t": "input", "slot": 1, "k": ["Hack"], "l": []})
        self.assertEqual(out[0][1]["t"], "err")

    def test_cannot_join_a_playing_room(self):
        self.start_game()
        c = self.h.connect("Late")
        self.h.send(c, {"t": "join", "room": self.room["id"]})
        self.assertEqual(self.h.types(c)[-1], "err")

    def test_claims_are_locked_while_playing_and_end_returns_to_lobby(self):
        self.start_game()
        self.h.send(self.host, {"t": "release", "slot": 0})
        self.assertEqual(self.h.types(self.host)[-1], "err")
        self.h.send(self.guest, {"t": "end"})
        self.assertEqual(self.h.types(self.guest)[-1], "err")
        self.h.send(self.host, {"t": "end"})
        self.assertEqual(self.h.types(self.guest)[-2:], ["back", "room"])
        self.assertEqual(self.h.last(self.guest, "room")["room"]["state"], "lobby")
        self.assertIsNotNone(self.h.last(self.guest, "room")["room"]["slots"][1])  # claims kept

    def test_guest_disconnect_frees_slots_and_notifies_host(self):
        self.start_game()
        self.h.disconnect(self.guest)
        left = self.h.last(self.host, "left")
        self.assertEqual((left["client"], left["slots"]), (self.guest, [1]))
        room = self.h.last(self.host, "room")["room"]
        self.assertIsNone(room["slots"][1])
        self.assertEqual([m["id"] for m in room["members"]], [self.host])

    def test_host_disconnect_closes_the_room(self):
        self.h.disconnect(self.host)
        self.assertEqual(self.h.last(self.guest, "closed")["reason"], "host left")
        c = self.h.connect("C")
        self.h.send(c, {"t": "rooms"})
        self.assertEqual(self.h.last(c, "rooms")["list"], [])
        # guest can create a new room afterwards
        self.h.send(self.guest, {"t": "create", "mode": "campaign"})
        self.assertEqual(self.h.types(self.guest)[-1], "room")

    def test_leave_in_lobby(self):
        self.h.send(self.host, {"t": "claim", "src": "kb0", "label": "k"})
        self.h.send(self.guest, {"t": "leave"})
        self.assertEqual([m["id"] for m in self.h.last(self.host, "room")["room"]["members"]], [self.host])

    def test_limits(self):
        m = RoomManager()
        ids = [m.connect() for _ in range(64)]
        self.assertTrue(all(i is not None for i in ids))
        self.assertIsNone(m.connect())
        h = Harness()
        hosts = []
        for i in range(17):
            c = h.connect("H%d" % i)
            h.send(c, {"t": "create", "mode": "campaign"})
            hosts.append(c)
        self.assertEqual(h.types(hosts[-1])[-1], "err")

    def test_room_member_cap(self):
        extra = [self.h.connect("E%d" % i) for i in range(7)]
        for c in extra:
            self.h.send(c, {"t": "join", "room": self.room["id"]})
        self.assertEqual(len(self.h.last(self.host, "room")["room"]["members"]), 8)
        self.assertEqual(self.h.types(extra[-1])[-1], "err")

    def test_host_adds_changes_and_removes_bots(self):
        self.h.send(self.host, {"t": "bot", "slot": 2, "level": "easy"})
        s = self.h.last(self.guest, "room")["room"]["slots"][2]
        self.assertEqual((s["bot"], s["src"], s["name"], s["label"], s["client"]), ("easy", "ai", "CPU", "AI - Easy", self.host))
        self.h.send(self.host, {"t": "bot", "slot": 2, "level": "hard"})
        self.assertEqual(self.h.last(self.host, "room")["room"]["slots"][2]["bot"], "hard")
        self.h.send(self.host, {"t": "unbot", "slot": 2})
        self.assertIsNone(self.h.last(self.host, "room")["room"]["slots"][2])

    def test_bot_rules(self):
        self.h.send(self.guest, {"t": "bot", "slot": 0, "level": "easy"})
        self.assertEqual(self.h.last(self.guest, "err")["msg"], "host only")
        for bad in [{"slot": 0, "level": "godlike"}, {"slot": 0, "level": ["x"]}, {"slot": 9, "level": "easy"}, {"slot": "0", "level": "easy"}]:
            self.h.send(self.host, dict(bad, t="bot"))
            self.assertEqual(self.h.types(self.host)[-1], "err")
        self.h.send(self.guest, {"t": "claim", "src": "kb0", "label": "Keyboard"})
        self.h.send(self.host, {"t": "bot", "slot": 0, "level": "easy"})
        self.assertEqual(self.h.last(self.host, "err")["msg"], "seat is taken")
        self.h.send(self.host, {"t": "unbot", "slot": 0})
        self.assertEqual(self.h.last(self.host, "err")["msg"], "not a bot")

    def test_bots_cannot_be_released_and_count_as_players(self):
        self.h.send(self.host, {"t": "mode", "mode": "battle"})
        self.h.send(self.host, {"t": "claim", "src": "kb0", "label": "Keyboard"})
        self.h.send(self.host, {"t": "bot", "slot": 1, "level": "normal"})
        self.h.send(self.host, {"t": "release", "slot": 1})
        self.assertEqual(self.h.last(self.host, "err")["msg"], "not your slot")
        self.h.send(self.host, {"t": "start"})
        start = self.h.last(self.guest, "start")
        self.assertEqual(start["slots"][1]["bot"], "normal")

    def test_no_bot_changes_while_playing(self):
        self.h.send(self.host, {"t": "claim", "src": "kb0", "label": "Keyboard"})
        self.h.send(self.host, {"t": "start"})
        self.h.send(self.host, {"t": "bot", "slot": 1, "level": "easy"})
        self.assertEqual(self.h.last(self.host, "err")["msg"], "game already running")

if __name__ == "__main__":
    unittest.main()
