import asyncio
import unittest

from lan import websocket as ws


def run(fn, data: bytes, *args, **kwargs):
    """Feeds `data` to a fresh StreamReader inside a running loop and awaits fn(reader, ...)."""
    async def go():
        reader = asyncio.StreamReader()
        reader.feed_data(data)
        reader.feed_eof()
        return await fn(reader, *args, **kwargs)

    return asyncio.run(go())


class AcceptKeyTest(unittest.TestCase):
    def test_rfc6455_example(self):
        self.assertEqual(ws.accept_key("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")


class FrameTest(unittest.TestCase):
    def roundtrip(self, payload: bytes, mask: bool):
        data = ws.encode_frame(ws.OP_TEXT, payload, mask=mask)
        return run(ws.read_frame, data, require_mask=mask)

    def test_small_unmasked(self):
        fin, op, payload = self.roundtrip(b"hello", False)
        self.assertEqual((fin, op, payload), (True, ws.OP_TEXT, b"hello"))

    def test_masked(self):
        fin, op, payload = self.roundtrip(b"hello world", True)
        self.assertEqual(payload, b"hello world")

    def test_16_bit_length(self):
        body = b"x" * 1000
        self.assertEqual(self.roundtrip(body, True)[2], body)

    def test_64_bit_length(self):
        body = b"y" * 70000
        data = ws.encode_frame(ws.OP_TEXT, body, mask=True)
        fin, op, payload = run(ws.read_frame, data, max_size=100000, require_mask=True)
        self.assertEqual(payload, body)

    def test_oversize_rejected(self):
        data = ws.encode_frame(ws.OP_TEXT, b"z" * 5000, mask=True)
        with self.assertRaises(ws.ProtocolError):
            run(ws.read_frame, data, max_size=1000, require_mask=True)

    def test_unmasked_client_frame_rejected(self):
        data = ws.encode_frame(ws.OP_TEXT, b"hi", mask=False)
        with self.assertRaises(ws.ProtocolError):
            run(ws.read_frame, data, require_mask=True)


class MessageTest(unittest.TestCase):
    def test_fragments_are_assembled(self):
        data = (ws.encode_frame(ws.OP_TEXT, b"hel", mask=True, fin=False)
                + ws.encode_frame(ws.OP_CONT, b"lo", mask=True, fin=True))
        op, payload = run(ws.read_message, data, lambda p: None)
        self.assertEqual((op, payload), (ws.OP_TEXT, b"hello"))

    def test_ping_is_answered_and_skipped(self):
        pings = []
        data = ws.encode_frame(ws.OP_PING, b"p", mask=True) + ws.encode_frame(ws.OP_TEXT, b"x", mask=True)
        op, payload = run(ws.read_message, data, pings.append)
        self.assertEqual(pings, [b"p"])
        self.assertEqual(payload, b"x")

    def test_close_is_returned(self):
        data = ws.encode_frame(ws.OP_CLOSE, b"", mask=True)
        op, _ = run(ws.read_message, data, lambda p: None)
        self.assertEqual(op, ws.OP_CLOSE)

    def test_eof_means_close(self):
        op, _ = run(ws.read_message, b"", lambda p: None)
        self.assertEqual(op, ws.OP_CLOSE)


if __name__ == "__main__":
    unittest.main()
