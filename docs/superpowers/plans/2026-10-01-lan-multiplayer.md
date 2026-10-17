# LAN Multiplayer Implementation Plan

**Status: implemented and verified (host + guest in two browser tabs; Python and JS test suites green). Not yet tried on several physical devices.**

> **For agentic workers:** execute task by task, tests first. Steps use checkbox syntax. No git (user's choice).

**Goal:** LAN play with a host-authoritative browser and a Python relay server, combined with local hotseat.

**Architecture:** see `docs/superpowers/specs/2026-10-01-lan-multiplayer-design.md`.

**Tech Stack:** Python 3.13 stdlib (asyncio, unittest); browser JS (WebSocket, Web Worker); Node 22 `node --test`.

## Global Constraints

- Python server: standard library only. Max 4 slots, max 8 clients per room, max 16 rooms, max 64 clients, names max 16 chars, WebSocket message max 256 KiB.
- Server never contains game logic. It only routes.
- Static serving must never expose `.py` files, `docs/`, `tests/`, `server_tests/`, `lan/`, `.claude/`, or anything outside the project root.
- The game must keep working with a plain static server (LAN entry disabled when `GET /api/info` fails).
- Snapshot rate ~30 Hz (every >= 0.033 s of simulation time); input rate: on change plus 250 ms heartbeat; host zeroes a remote slot's input after 600 ms of silence.
- No pause in LAN games: `PauseScreen`/`OptionsScreen` must not set `Engine.Paused` while a LAN session is active.
- Tests: `python -m unittest discover -s server_tests` and `node --test tests/*.test.js` must both pass at the end of every task.

## Wire protocol

All frames are JSON text objects with field `t`.

| Direction | `t` | Fields |
|---|---|---|
| C->S | `hello` | `name` |
| S->C | `welcome` | `id`, `name` |
| C->S | `rooms` | |
| S->C | `rooms` | `list: [{id,name,mode,state,players,max}]` |
| C->S | `create` | `mode` (`campaign`/`battle`) |
| C->S | `join` | `room` |
| C->S | `leave` | |
| C->S | `claim` | `src` (device id, e.g. `kb0`), `label` |
| C->S | `release` | `slot` |
| C->S | `mode` | `mode` (host only, lobby only) |
| C->S | `start` | (host only; needs min players: campaign 1, battle 2) |
| S->C | `room` | `room: {id,name,mode,state,host,members,slots}` |
| S->C | `start` | `mode`, `slots` (same shape as `room.slots`) |
| C->S | `snap` | any payload (host only, state `playing`) -> relayed verbatim to all other members |
| C->S | `input` | `slot`, `k` (list of virtual key names held), `l` (list of names pressed since last send) (owner of `slot` only) -> relayed to host as `{t:"input", from, slot, k, l}` |
| C->S | `end` | (host only) room returns to lobby; members get `back` |
| S->C | `back` | |
| S->C | `left` | `client`, `slots` (to host when a guest disconnects while playing) |
| S->C | `closed` | `reason` (host left) |
| S->C | `err` | `msg` |

Virtual key names are the touch layout names: `Up Right Down Left Bomb Start Back`.

## Tasks

### Task 1: Python server (framing, rooms, static, main)
Files: `lan/__init__.py`, `lan/websocket.py`, `lan/rooms.py`, `lan/static.py`, `server.py`, `server_tests/test_websocket.py`, `test_rooms.py`, `test_static.py`, `test_server.py`. Remove `serve.py`; `.claude/launch.json` runs `server.py`.
Tests (written first): handshake accept key (RFC example `dGhlIHNhbXBsZSBub25jZQ==` -> `s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`); frame round-trip with and without mask, 16-bit and 64-bit lengths, oversize rejected, fragmented text assembled; rooms: hello/rooms/create/join/leave, claim picks first free slot and rejects duplicates per `src`, 4-slot cap, host-only commands rejected for guests, start needs min players, only owner may release / send input for a slot, snap relayed raw to others only, input relayed only to host, guest disconnect frees slots and notifies host, host disconnect closes room, joining a playing room rejected, `end` returns to lobby; static: traversal (`..`, encoded, backslash) and blocked dirs/extensions rejected, `/` -> index.html; integration: start server on a free port, two raw-socket WebSocket clients create/join/claim/start/snap.

### Task 2: Input virtual sources
Files: `Engine/Input.js`, `tests/input.test.js`.
`Input.Poll(keys, pads, latch, touch, virtuals)`: `virtuals` is `{id: {Keys, Latch}}`; each becomes `Raw[id]` via `keyAction` with `TOUCH_LAYOUT`. Bindings gain `Net: <slot>` -> `Raw["net"+slot]`. `Menu()` and `Sources()` ignore ids starting with `net`. `Input.Virtuals` (id -> object with `Snapshot()`) is polled in `Update()`.
Tests: net source acts like a keyboard; `Player()` with `{Net: 2}` reads `net2`; `Menu()`/`Sources()` exclude `net*`; unknown virtual ids don't leak into other players.

### Task 3: Client protocol helpers (pure)
Files: `Net/Snapshot.js`, `tests/snapshot.test.js`.
Exports: `EncodeEntity(e)` -> `[id, layer, x, y, frame, alpha100, offX, offY, tint]` and `DecodeEntity(a)`; `Interpolator(delayMs)` with `Push(timeMs, entities)` and `Sample(nowMs)` (linear interpolation by id between the two snapshots around `now - delay`, newest snapshot when none is newer, entities absent from the later snapshot dropped); `OccupiedSlots(slots)` -> ascending slot indexes with a player; `PlayerIndexOfSlot(slots, slot)`.
Tests: round trip, interpolation midpoint, no extrapolation beyond newest, entity appearing/disappearing, out-of-order push ignored, slot compaction.

### Task 4: NetClient + host game side
Files: `Net/NetClient.js`, `Game/PiNaBlaster.js`, `Engine/Engine.js`, `Engine/GameWorld.js` (`Version`), `Engine/Input.js`, `Game/Hud.js` (names), `Game/Screens.js` (non-pausing in LAN).
`Net`: `Available`, `Probe()`, `EnsureName()`, `Connect()`, `Send(obj)`, `Room`, `MyId`, `Role` (`"host"|"guest"|null`), callbacks. Host: `StartNetHost(room)` builds roster (local slot -> bindings from claim `src`, remote slot -> `{Net: slot}`), registers `Input.Virtuals["net"+slot]` backed by `RemoteInput`, runs the normal `StartGame`, then every >=0.033 s sim time sends a snapshot `{s, tm, lv, mode, w?, e, p, hud, snd, ov}`. `Engine.PlaySound/StopSound` also queue to `Net.SoundQueue` when hosting. Engine gains `Advance(now, draw)` and a Worker ticker used when `document.hidden` on the host.
Tests (node): `RemoteInput.Snapshot` zeroes after 600 ms silence, merges latches; snapshot builder (pure function over plain objects) output shape; walls only sent when `GameWorld.Version` changed.

### Task 5: Guest game side
Files: `Net/GuestView.js`, `Game/PiNaBlaster.js`, `tests/guestview.test.js`.
`StartNetGuest(room)`: sets `Role`, binds owned slots' local sources, `Engine.PauseModules = true`, ignores `Tick`, sends `input` per owned slot, applies `snap` (walls, interpolated proxy entities into `GameEntityManager.Entities`, `PlayerManager.Players` proxies, HUD, sounds, overlay), draws `Renderer.Draw` + `Hud.Draw` + `RemoteOverlay`.
Tests (node): `ApplySnapshot` into a plain-object view produces expected proxies; input diff logic sends only on change or after 250 ms.

### Task 6: LAN screens and flow
Files: `Game/Lan.js` (LanMenuScreen, JoinScreen, RoomScreen, MessageScreen, LeaveScreen), `Game/Lobby.js` (title entry), `Game/PiNaBlaster.js`.
Flow: Title -> Play on LAN -> Host / Join; RoomScreen lets local devices claim and release slots (fire / back), host changes mode (left/right) and starts; messages for `closed` / disconnect. Result screens in LAN: host items "Rematch" / "Back to room"; `end` sent on "Back to room".
Tests (node): pure helpers (`RoomSummaryLines`, claim bookkeeping `NextClaimAction`).

### Task 7: Docs and end-to-end verification
README (server usage, firewall note), spec status, two-tab browser run (host + guest): lobby, claim, start, move both players, sound events arrive, guest leaves, host leaves, hotseat + remote in the same room.
