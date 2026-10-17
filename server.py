"""PiN'a'Blaster server: serves the game files and relays LAN multiplayer traffic.

    python server.py                 # http://<this machine>:8000/ on all interfaces
    python server.py --port 9000
    python server.py --host 127.0.0.1   # this machine only

Python standard library only. The server contains no game logic: one player's browser
hosts the match, this process only serves files and passes messages between browsers.
Meant for a trusted local network; there is no authentication.
"""
import argparse
import asyncio
import json
import socket
from pathlib import Path

from lan import static
from lan import websocket as ws
from lan.rooms import RoomManager

ROOT = Path(__file__).resolve().parent
MAX_HEAD = 16 * 1024
SLOW_CLIENT_BYTES = 1_000_000

manager = RoomManager()
writers = {}  # client id -> StreamWriter


def lan_addresses():
    """Best-effort list of this machine's IPv4 addresses (for the startup banner)."""
    found = []

    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(("10.255.255.255", 1))  # no packet is sent for UDP connect
        found.append(probe.getsockname()[0])
        probe.close()
    except OSError:
        pass

    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in found and not ip.startswith("127."):
                found.append(ip)
    except OSError:
        pass

    return found


async def respond(writer, status, reason, body=b"", content_type="text/plain; charset=utf-8", head_only=False):
    head = (f"HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {len(body)}\r\n"
            f"Cache-Control: no-store\r\nConnection: close\r\n\r\n").encode()
    writer.write(head + (b"" if head_only else body))
    await writer.drain()


def deliver(out):
    for target, text in out:
        w = writers.get(target)

        if w is None or w.is_closing():
            continue

        # A slow client must not make the host's snapshots pile up in memory.
        if len(text) > 2000 and w.transport.get_write_buffer_size() > SLOW_CLIENT_BYTES:
            continue

        w.write(ws.encode_frame(ws.OP_TEXT, text.encode("utf-8")))


async def websocket_session(reader, writer, headers):
    key = headers.get("sec-websocket-key")

    if not key:
        await respond(writer, 400, "Bad Request", b"missing key")
        return

    cid = manager.connect()

    if cid is None:
        await respond(writer, 503, "Service Unavailable", b"server is full")
        return

    writer.write((f"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                  f"Sec-WebSocket-Accept: {ws.accept_key(key)}\r\n\r\n").encode())
    await writer.drain()
    writers[cid] = writer

    try:
        while True:
            opcode, payload = await ws.read_message(reader, lambda p: writer.write(ws.encode_frame(ws.OP_PONG, p)))

            if opcode == ws.OP_CLOSE:
                break

            if opcode == ws.OP_TEXT:
                try:
                    text = payload.decode("utf-8")
                except UnicodeDecodeError:
                    break

                deliver(manager.handle(cid, text))
    except (ws.ProtocolError, ConnectionError, OSError):
        pass
    finally:
        writers.pop(cid, None)
        deliver(manager.disconnect(cid))

        try:
            writer.write(ws.encode_frame(ws.OP_CLOSE, b""))
        except Exception:
            pass


async def handle_connection(reader, writer, root=ROOT):
    try:
        try:
            head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 10)
        except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, asyncio.TimeoutError):
            return

        if len(head) > MAX_HEAD:
            return

        lines = head.decode("latin1").split("\r\n")
        parts = lines[0].split(" ")

        if len(parts) != 3:
            await respond(writer, 400, "Bad Request", b"bad request")
            return

        method, target, _ = parts
        headers = {}

        for line in lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()

        path = target.split("?", 1)[0]

        if path == "/ws" and headers.get("upgrade", "").lower() == "websocket":
            await websocket_session(reader, writer, headers)
            return

        if method not in ("GET", "HEAD"):
            await respond(writer, 405, "Method Not Allowed", b"method not allowed")
            return

        head_only = method == "HEAD"

        if path == "/api/info":
            host_header = headers.get("host", "")
            port = host_header.rsplit(":", 1)[1] if ":" in host_header else "80"
            body = json.dumps({"server": "pinablaster-lan", "version": 1, "urls": [f"http://{ip}:{port}/" for ip in lan_addresses()]}).encode()
            await respond(writer, 200, "OK", body, "application/json; charset=utf-8", head_only)
            return

        file = static.resolve(root, target)

        if file is None:
            await respond(writer, 404, "Not Found", b"not found", head_only=head_only)
            return

        await respond(writer, 200, "OK", file.read_bytes(), static.mime_type(file), head_only)
    except (ConnectionError, OSError):
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def start_server(host, port, root=ROOT):
    return await asyncio.start_server(lambda r, w: handle_connection(r, w, root), host, port)


async def main(host, port):
    srv = await start_server(host, port)
    actual = srv.sockets[0].getsockname()[1]

    print("PiN'a'Blaster server running. Press Ctrl+C to stop.")
    print(f"  This machine:  http://localhost:{actual}/")

    if host in ("0.0.0.0", ""):
        for ip in lan_addresses():
            print(f"  On your LAN:   http://{ip}:{actual}/   <- share this with your coworkers")
        print("  (If others cannot connect, allow Python through the firewall for private networks.)")

    async with srv:
        await srv.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="0.0.0.0", help="interface to listen on (default: all)")
    args = parser.parse_args()

    try:
        asyncio.run(main(args.host, args.port))
    except KeyboardInterrupt:
        print("\nBye.")
