# LAN Multiplayer Design

Date: 2026-10-01
Status: approved by user

## Goal

Let people on the same office LAN play together, each on their own device, while keeping the game fully usable as it is today (single device, hotseat, plain static hosting). Local hotseat and LAN can be combined: a browser may contribute several local players (keyboards, gamepads, touch controls).

## Decisions (agreed)

- **Netcode: host's browser is authoritative.** One player hosts a room; that browser runs the existing simulation. A Python server relays messages. Guests send inputs and render snapshots; they run no game logic. (Lockstep and a Python port of the game were rejected: determinism risk and a ~3,000 line port.)
- **`server.py`, Python standard library only.** Replaces `serve.py`. Serves the game files, exposes `/api/info`, accepts WebSocket connections on `/ws`, manages rooms. It contains no game logic.
- **Max players in a room: 4 originally, raised to 6 later** (spawns: four corners plus top / bottom centre; HUD switches to compact cards above 4 players; the Battle arena has safe start spots for all six).
- **Plain static hosting keeps working**: the "Play on LAN" entry is greyed out when `/api/info` is not available.
- **No pause in LAN games.** Esc opens a Leave menu that does not pause the simulation. Result screens (Game Over, round / match results) are controlled by the host; guests see them read-only.
- **Join only in the room lobby**, not mid-match. After a match the room returns to the lobby with the same slots.
- **Disconnects:** a guest leaving kills their players (no respawn, slots freed); the host leaving closes the room and sends everyone back to the title with a message.
- **Background host tab:** simulation steps are driven by a Web Worker timer while the host tab is hidden, because hidden tabs get no animation frames.
- **Trusted LAN only:** no authentication. Caps on message size, room and client counts, name length; static file serving restricted to game assets (no path traversal, no `.py`, no `docs/`, `tests/`).
- **Names:** asked once via `prompt()`, stored in `localStorage`, shown in the lobby and HUD cards.

## Architecture

```
 Guest browser(s)                Python server                Host browser
 input (30 Hz) ---------------> relay -----------------------> virtual input device "net<slot>"
 snapshots, sounds <----------- relay <----------------------- simulation + snapshot (30 Hz)
```

### Server (`server.py` + `lan/` package)

- `lan/websocket.py`: RFC 6455 handshake and frame encode/decode (text, ping/pong, close, fragmentation, size limit).
- `lan/rooms.py`: `RoomManager`, a pure state machine. `handle(client_id, text) -> [(target_client_id, text)]`, `disconnect(client_id) -> [...]`. No sockets.
- `lan/static.py`: safe path resolution and MIME types.
- `server.py`: asyncio HTTP + WebSocket server, prints LAN URLs, `--port`, `--host`.

### Protocol (JSON text frames, field `t` = type)

Client -> server: `hello{name}`, `rooms`, `create{mode}`, `join{room}`, `leave`, `claim{src,label}`, `release{slot}`, `mode{mode}` (host), `start` (host), `snap{...}` (host), `input{slot,k,l}` (guest), `end` (host, back to lobby).

Server -> client: `welcome{id,name}`, `rooms{list}`, `room{...}` (full room state), `start{mode,slots}`, `snap{...}` (to guests), `input{from,slot,k,l}` (to host), `left{client,slots}` (to host), `back` (room returns to lobby), `closed{reason}`, `err{msg}`.

Room state: `{id, name, mode, state: "lobby"|"playing", host, members:[{id,name}], slots:[null | {client,name,src,label}] x6}`.

### Client

- `Net/NetClient.js`: WebSocket wrapper, `Net.Available` probe, name handling, room state cache, message dispatch.
- `Net/Snapshot.js` (pure, Node-testable): entity encode/decode, `Interpolator`, `OccupiedSlots`, player-state encode.
- Host: `PiNaBlaster` runs as today; after every ~33 ms of simulation time it sends a snapshot (entities, walls when changed, player HUD state, sound events, overlay). Remote players are bound as `{Net: slot}` and read through `Input` virtual sources (`net<slot>`), which are excluded from menu navigation and from the lobby device list.
- Guest: `Net/GuestView.js` applies snapshots, interpolates entity positions (~50 ms render delay), draws with the existing `Renderer`, `Hud` and screens, plays received sounds, and sends input per owned slot.
- Screens: LAN menu (Host / Join), join list, room lobby (claim slots with local devices, host picks mode and starts).

## Testing

- Python `unittest` (`python -m unittest discover -s server_tests`): frame codec, handshake key, room rules (claims, limits, host-only commands, disconnect handling), static path safety, one real two-client WebSocket exchange against a running server.
- `node --test`: snapshot codec, interpolation, slot mapping, virtual input sources, net-excluded menus.
- Browser: two tabs against `server.py` (host + guest) for lobby, play, sounds, disconnects.
- Needs real hardware/people: several physical devices, real network latency.
