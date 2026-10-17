"""Minimal RFC 6455 WebSocket support (server side), standard library only."""
import base64
import hashlib
import os
import struct

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

OP_CONT, OP_TEXT, OP_BIN, OP_CLOSE, OP_PING, OP_PONG = 0x0, 0x1, 0x2, 0x8, 0x9, 0xA

MAX_MESSAGE = 256 * 1024


class ProtocolError(Exception):
    pass


def accept_key(key: str) -> str:
    return base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()


def encode_frame(opcode: int, payload: bytes = b"", mask: bool = False, fin: bool = True) -> bytes:
    head = bytearray([(0x80 if fin else 0) | opcode])
    n = len(payload)
    mask_bit = 0x80 if mask else 0

    if n < 126:
        head.append(mask_bit | n)
    elif n < 65536:
        head.append(mask_bit | 126)
        head += struct.pack(">H", n)
    else:
        head.append(mask_bit | 127)
        head += struct.pack(">Q", n)

    if mask:
        key = os.urandom(4)
        head += key
        payload = bytes(b ^ key[i % 4] for i, b in enumerate(payload))

    return bytes(head) + payload


async def read_frame(reader, max_size: int = MAX_MESSAGE, require_mask: bool = True):
    """Returns (fin, opcode, payload). Raises ProtocolError / asyncio.IncompleteReadError."""
    b0, b1 = await reader.readexactly(2)
    fin = bool(b0 & 0x80)
    opcode = b0 & 0x0F
    masked = bool(b1 & 0x80)
    n = b1 & 0x7F

    if b0 & 0x70:
        raise ProtocolError("reserved bits set")

    if require_mask and not masked:
        raise ProtocolError("client frames must be masked")

    if n == 126:
        n = struct.unpack(">H", await reader.readexactly(2))[0]
    elif n == 127:
        n = struct.unpack(">Q", await reader.readexactly(8))[0]

    if n > max_size:
        raise ProtocolError("frame too large")

    if opcode >= 0x8 and (n > 125 or not fin):
        raise ProtocolError("bad control frame")

    key = await reader.readexactly(4) if masked else None
    payload = await reader.readexactly(n) if n else b""

    if key:
        payload = bytes(b ^ key[i % 4] for i, b in enumerate(payload))

    return fin, opcode, payload


async def read_message(reader, on_ping, max_size: int = MAX_MESSAGE, require_mask: bool = True):
    """Reads one complete data message. Returns (opcode, payload); (OP_CLOSE, b"") on close or EOF."""
    import asyncio

    opcode = None
    buf = b""

    while True:
        try:
            fin, op, payload = await read_frame(reader, max_size, require_mask)
        except asyncio.IncompleteReadError:
            return OP_CLOSE, b""

        if op == OP_CLOSE:
            return OP_CLOSE, payload
        if op == OP_PING:
            on_ping(payload)
            continue
        if op == OP_PONG:
            continue

        if op != OP_CONT:
            opcode = op
            buf = payload
        else:
            if opcode is None:
                raise ProtocolError("unexpected continuation")
            buf += payload

        if len(buf) > max_size:
            raise ProtocolError("message too large")

        if fin:
            return opcode, buf
