import asyncio
import base64
import json
import os
import unittest
from pathlib import Path

import server
from lan import websocket as ws

ROOT = Path(__file__).resolve().parent.parent


async def http_get(port, target, method="GET"):
    reader, writer = await asyncio.open_connection("127.0.0.1", port)
    writer.write(f"{method} {target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n".encode())
    await writer.drain()
    data = await reader.read()
    writer.close()
    head, _, body = data.partition(b"\r\n\r\n")
    status = int(head.split(b" ", 2)[1])
    return status, head.decode("latin1"), body


class WsClient:
    def __init__(self, reader, writer):
        self.reader, self.writer = reader, writer

    @classmethod
    async def connect(cls, port):
        reader, writer = await asyncio.open_connection("127.0.0.1", port)
        key = base64.b64encode(os.urandom(16)).decode()
        writer.write((f"GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                      f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        await writer.drain()
        head = await reader.readuntil(b"\r\n\r\n")
        assert b" 101 " in head.split(b"\r\n")[0], head
        assert ws.accept_key(key).encode() in head
        return cls(reader, writer)

    async def send(self, obj):
        self.writer.write(ws.encode_frame(ws.OP_TEXT, json.dumps(obj).encode(), mask=True))
        await self.writer.drain()

    async def recv(self, timeout=3):
        op, payload = await asyncio.wait_for(ws.read_message(self.reader, lambda p: None, require_mask=False), timeout)
        return json.loads(payload) if op == ws.OP_TEXT else None

    async def recv_type(self, t):
        for _ in range(20):
            msg = await self.recv()
            if msg and msg["t"] == t:
                return msg
        raise AssertionError("never received " + t)

    async def close(self):
        self.writer.close()


class ServerTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.srv = await server.start_server("127.0.0.1", 0, ROOT)
        self.port = self.srv.sockets[0].getsockname()[1]

    async def asyncTearDown(self):
        self.srv.close()
        try:
            await asyncio.wait_for(self.srv.wait_closed(), 2)
        except asyncio.TimeoutError:
            pass  # a test left a socket open; do not hang the suite

    async def test_serves_game_files_and_info(self):
        status, head, body = await http_get(self.port, "/")
        self.assertEqual(status, 200)
        self.assertIn(b"mainCanvas", body)
        self.assertIn("no-store", head.lower())
        status, _, body = await http_get(self.port, "/api/info")
        self.assertEqual(status, 200)
        info = json.loads(body)
        self.assertEqual(info["server"], "pinablaster-lan")
        status, _, body = await http_get(self.port, "/Engine/Engine.js", "HEAD")
        self.assertEqual((status, body), (200, b""))

    async def test_refuses_private_files(self):
        for target in ["/server.py", "/lan/rooms.py", "/docs/superpowers/specs/2026-10-01-lan-multiplayer-design.md",
                       "/../server.py", "/%2e%2e/server.py", "/server_tests/test_server.py", "/nothing.js"]:
            status, _, _ = await http_get(self.port, target)
            self.assertEqual(status, 404, target)

    async def test_bad_method(self):
        status, _, _ = await http_get(self.port, "/", "DELETE")
        self.assertEqual(status, 405)

    async def test_two_clients_play_a_room(self):
        a = await WsClient.connect(self.port)
        b = await WsClient.connect(self.port)
        await a.send({"t": "hello", "name": "Alice"})
        await b.send({"t": "hello", "name": "Bob"})
        await a.recv_type("welcome")
        await b.recv_type("welcome")

        await a.send({"t": "create", "mode": "campaign"})
        room = (await a.recv_type("room"))["room"]
        await b.send({"t": "rooms"})
        self.assertEqual((await b.recv_type("rooms"))["list"][0]["id"], room["id"])
        await b.send({"t": "join", "room": room["id"]})
        await b.recv_type("room")

        await a.send({"t": "claim", "src": "kb0", "label": "k"})
        await b.send({"t": "claim", "src": "kb0", "label": "k"})

        # separate connections are not ordered: wait until the host has seen both claims
        while True:
            seen = (await a.recv_type("room"))["room"]["slots"]
            if sum(1 for x in seen if x) == 2:
                break

        await a.send({"t": "start"})
        start = await b.recv_type("start")
        self.assertEqual(start["mode"], "campaign")
        self.assertEqual([s["name"] for s in start["slots"] if s], ["Alice", "Bob"])

        await a.send({"t": "snap", "s": 1, "e": [[1, 2, 3]]})
        snap = await b.recv_type("snap")
        self.assertEqual(snap["e"], [[1, 2, 3]])

        await b.send({"t": "input", "slot": 1, "k": ["Left"], "l": []})
        got = await a.recv_type("input")
        self.assertEqual((got["slot"], got["k"]), (1, ["Left"]))

        await b.close()
        left = await a.recv_type("left")
        self.assertEqual(left["slots"], [1])
        await a.close()

    async def test_junk_websocket_data_does_not_kill_the_server(self):
        reader, writer = await asyncio.open_connection("127.0.0.1", self.port)
        writer.write(b"\x00\x01garbage\r\n\r\n")
        await writer.drain()
        await reader.read()
        writer.close()
        status, _, _ = await http_get(self.port, "/")
        self.assertEqual(status, 200)


if __name__ == "__main__":
    unittest.main()
