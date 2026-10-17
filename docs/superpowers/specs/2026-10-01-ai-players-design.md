# AI Players Design

Date: 2026-10-01
Status: approved by user

## Goal

Let the host fill seats with computer-controlled players ("CPU"). In Campaign they cooperate with the humans; in Battle they fight everybody. Works in local games and in LAN rooms. Only the host adds, changes or removes bots (locally, whoever sits at the machine is the host).

## Decisions (agreed)

- **Per-bot difficulty:** Easy / Normal / Hard, chosen per bot in the lobby.
- **Local lobby and LAN room**, same controls. In a LAN room only the host can manage bots (enforced by the server).
- **Campaign game over** when every *human* is out of lives. Bots use lives and respawn like humans, but cannot carry the team alone.
- **Friendly fire:** in Campaign a bot never places a bomb whose blast reaches a teammate (human or bot), and treats every bomb as danger.
- **Bots count** toward the 6-player cap and the minimum player count (Battle with 1 human + 1 bot is allowed).
- **Bots run on the host only.** LAN guests see them as ordinary players in snapshots.

## Architecture

The bot drives a normal `Player` entity. Nothing about players, bombs, HUD or snapshots changes.

```
GameTick (host, every 10 ms)
  for each player:
    act = Bots[idx] ? Bots[idx].Update(delta, player) : Input.Player(idx)
    (same {Dir, Bomb, BombPressed} shape as today)
```

### `Game/AiBrain.js` (pure, no DOM, Node-testable)

Works on a plain **view** of the world, rebuilt at each re-plan:

```
view = {
  w, h,                                  // grid size
  walls: [string],                       // GameWorld.Walls rows
  bombs:  [{x, y, power, time, superBomb}],   // tile coords, seconds left
  fire:   [{x, y}],                      // tiles with a live explosion, hot wall, or a shot
  blocked:[{x, y}],                      // solid non-player entities: ice blocks, hot walls
  enemies:[{x, y}],                      // campaign enemies (tile)
  powerups:[{x, y, type}],
  keys:   [{x, y}],
  players:[{x, y, index, dead, bot}],
  keyFlags,                              // team key bitmask (doors A-D open when held)
  mode                                   // "campaign" | "battle"
}
```

Pure functions:

- `TileWalkable(view, x, y)`: `' '` tiles, door tiles whose key the team holds, no bomb, not blocked. The tile the bot stands on is always walkable (a bot may walk off its own bomb).
- `BlastCells(view, bomb)`: the cross a bomb will burn, `power` tiles each way. It stops before hard walls, stops *on* soft walls `'1'` (super bombs pass through), and ignores entities, matching `CreateExplosionLine`.
- `DangerMap(view)`: grid of seconds-until-burn (`Infinity` = safe). Bombs caught in another bomb's blast inherit the earlier time (chain reactions). `fire` tiles are `0`.
- `FindPath(view, from, goalFn, danger, opts)`: BFS over walkable tiles. A tile is enterable only if the bot reaches it before its burn time minus a margin, or after the burn is over. It returns the tile path to the first goal tile.
- `SafeAfterBomb(view, at, power, danger)`: adds a hypothetical bomb at `at` and checks that a reachable tile stays safe through the new timings.
- `HitsTeammate(view, at, power, selfIndex)`: Campaign only. True if the blast would reach any other living player's tile.
- `Decide(view, me, level, rng)` returns `{ path, bomb }` in this order:
  1. **Danger:** if the bot's tile burns within the danger horizon, path to the nearest safe tile. Never bomb.
  2. **Attack:** place a bomb now if an attack target sits in this tile's blast cross, `SafeAfterBomb` holds, and (Campaign) `!HitsTeammate`. In Campaign the targets are enemies; in Battle they are other players.
  3. **Goal:** path to the best goal by level (see *Difficulty*). Goals are a power-up, a key, a tile from which a target is in blast line, or a tile next to a soft wall (on arrival: bomb if safe).
  4. **Idle:** stay put, or wander to a safe random neighbour.
- In Campaign, tiles next to an enemy are never walked through and never chosen as goals. A bot that is cornered (next to an enemy, no way out) bombs it if it is in blast line, because contact hurts anyway.
- Obstacles: other living players and enemies are solid, so every tile their body overlaps blocks paths (two tiles while they walk). Normal and Hard also treat bad-luck power-ups as obstacles: bad luck makes a player drop bombs by itself.
- Goal paths only cross tiles no blast will touch. Waiting beats squeezing past a bomb and then having to flee back. Escapes may cross burning-soon tiles. When no escape fits the safety margin, the bot takes the tightest one that physically works rather than standing still.

### Findings from playtesting (2026-10-01)

Watching bots play in the browser turned up these failure modes; each now has a regression test in `tests/ai.test.js`:

1. A bot stopped as soon as its centre crossed into a safe tile, with half its body still in the blast. Idle bots now settle onto the tile centre.
2. Paths crossed bad-luck power-ups; the curse then dropped bombs by itself.
3. A safe bot planned a goal path through a tile about to burn, stepped in, fled back, and repeated.
4. Players and enemies were planned as walkable, so escapes ran into them and stalled.
5. A feasible escape was dropped because it was a few milliseconds tighter than the safety margin.
6. Movers were planned as their centre tile only, but block both tiles while walking.
7. With power 1 every hunt spot touched the enemy; and a bot cornered by an enemy just took repeated contact damage.

Constants come from the game: bombs last 2.0 s; a player covers one tile in ~0.17 s at speed 1. The brain uses the player's real `Speed` to estimate arrival times.

### `AiController` (in `Game/AiBrain.js`, browser-side glue)

- `new AiController(level, rng)`, `Update(delta, player)` returns an action.
- Re-plans every `level.ThinkMs` of simulation time, building the view from `GameWorld`, `GameEntityManager.Entities`, `PlayerManager` and `game.Mode`. It also re-plans right away when a new bomb appears.
- **Steering:** follows the path tile by tile with pixel targets `tile * 17`. If the bot is off-axis for the next step, it first aligns on the perpendicular axis, then moves. A tile is reached when `X, Y` equal the target. It stops (`Dir 0`) at the end of the path.
- **Bomb:** pressed only when aligned on the planned tile, as a single `BombPressed` edge.
- **Dead with lives:** presses bomb after 1.0 s to respawn (the same rule humans use).
- `act` never sets `Start`/`Back`, so bots never pause or open menus.

### Difficulty (`AI_LEVELS`)

| | Easy | Normal | Hard |
|---|---|---|---|
| Think interval | 400 ms | 150 ms | 50 ms |
| Danger reaction | 20% chance per re-plan to skip the danger check, unless the tile burns within 0.6 s | always | always |
| Safety margin | 0.35 s | 0.25 s | 0.15 s |
| Hunting | only targets within 4 tiles (mostly breaks walls) | targets within 8 tiles | any reachable target, preferred over walls |
| Power-ups | ignores | picks up when within 5 tiles | always |
| Avoids bad-luck power-up (type 5) | no | yes | yes |

The safety rules (escape check, teammate check) apply at every level. Easy's skipped danger check is its only deliberate weakness.

## Game integration (`Game/PiNaBlaster.js`, `Game/Players.js`)

- Roster entry `{ Bot: "easy" | "normal" | "hard" }` creates `this.Bots[i] = new AiController(...)` in `ApplyRoster`. Bot slots are unbound in `Input`.
- `GameTick` takes the bot's action for bot slots. `WantsPause` skips bot slots.
- `AllOut` becomes human-only in Campaign: `AllOut(humans)`, where humans are the players whose roster entry has no `Bot`. With zero humans (not reachable from the lobby) it falls back to all players.
- Labels: `PlayerLabel(i)` returns `"CPU " + (i+1)` for bots and `"P" + (i+1)` otherwise. It feeds the HUD cards (via `PlayerNames` in local games when any bot is present) and the round/match result titles.

## Lobby UX (`Game/Lobby.js`, `Game/Lan.js`)

- Bot entries in the local lobby list use the id `"ai:<level>"`. `RosterFromSources` maps them to `{ Bot: level }`, and `SourceLabel` shows `"AI - Normal"`.
- **Cursor:** Up/Down from any local device (`Input.Menu()`) moves a highlight over the rows. The rows are the filled seats plus the first empty seat (when one is free).
  - On the empty row, Left/Right adds a Normal bot.
  - On a bot row, Left/Right cycles `Easy <-> Normal <-> Hard`. Left on Easy removes the bot.
  - On a human row, Left/Right does nothing.
  - Fire / Start / Back keep their meaning (join, begin, leave seat / back), so joining is unchanged.
- The row text for a bot is `<  AI - Normal  >` when highlighted, and the hint line mentions `< > add bot`.
- **LAN room:** the host gets the same cursor, plus a top row with the mode (`<  CAMPAIGN  >`). The cursor starts on the mode row, so Left/Right switches mode as before. Guests have no cursor and see bot rows read-only. Bot changes go to the server; the screen redraws from the server's `room` state.
- Pure helpers (exported for tests): `LobbyRows(count, max)`, `NextBotLevel(level, delta)` (returns `null` to remove).

## LAN protocol (`lan/rooms.py`, `Game/NetGame.js`)

New client -> server messages. Both are host-only and lobby-only:

- `bot{slot, level}`: if the slot is empty, add a bot there; if it is a bot, change its level. Errors: `seat is taken` for a human seat, `bad slot`, `bad level`, `host only`.
- `unbot{slot}`: remove a bot. Error: `not a bot`.

A bot slot is `{client: <host id>, name: "CPU", src: "ai", label: "AI - Hard", bot: "hard"}`. `release` refuses bot slots (use `unbot`). A bot slot's `client` is the host, so `_leave_room` frees it with the host's other slots. The room closes anyway when the host leaves. Guests never send input for it, and the `input` handler already rejects slots that are not the sender's.

`StartNetHost` maps a bot slot to `{ Bot: s.bot }` and names it `"CPU " + (n+1)`. `StartNetGuest` ignores bot slots (their `client` is not the guest).

## Error handling

- The brain never throws on odd maps: unknown wall chars count as hard walls, and out-of-range tiles count as walls.
- With no path or goal, the bot stays put (or steps to a safe neighbour). It is never stuck holding a direction into a wall: the controller drops the direction when the position has not changed for 0.3 s and re-plans.
- Server validation as above; bad messages get `err` replies like every other message.

## Known limits (accepted)

- Drains (`#`) teleporting blasts, ice-block pushing, enemy lasers (`Shot` tiles count as fire only where the shot is now) and magic carpets are not modelled beyond "walkable / blocked".
- Bots do not plan multi-bomb traps.

## Testing

- `node --test tests/ai.test.js`: blast cells (wall stop, soft-wall stop, super bomb), danger map timings including chains, escape path, `SafeAfterBomb` rejects a dead-end bomb, `HitsTeammate` blocks a campaign bomb but not a battle one, `Decide` flees when in danger, attacks a target in line, picks power-ups per level, and the controller steering (off-axis alignment, arrival).
- `tests/lobby.test.js`: `ai:` ids in `RosterFromSources` / `SourceLabel`, `LobbyRows`, `NextBotLevel`.
- `tests/players.test.js`: human-only game over.
- `server_tests/test_rooms.py`: `bot` / `unbot` host-only, lobby-only, empty-slot / bot-slot rules, level validation, `release` refuses bot slots, bots appear in `start`.
- Browser: local Battle with 1 human + 3 bots of mixed levels; a Campaign level with 1 human + 2 bots; a two-tab LAN room where the host adds a bot and the guest sees it.
