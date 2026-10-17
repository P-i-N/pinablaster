# PiN'a'Blaster Revival: Design

Date: 2026-10-01
Status: approved by user (design discussion), pending written-spec review

## Goals

Revive a 14-year-old HTML5 Dynablaster-style game and add:

1. 16:9 scaling with fullscreen support
2. Better sound mixing
3. Local multiplayer (co-op campaign and battle mode)
4. Gamepad support
5. General bug fixes and polish

## Non-goals

- Online multiplayer (explicitly out of scope; local same-screen only)
- A rewrite or a build step. The game stays plain JS served as static files.
- New campaign levels or new art, apart from one Battle arena and UI chrome.

## Current state (findings)

- Single-player campaign, 8 levels (ASCII maps in `Game/PiNaBlaster.js`), enemies, keys/doors, ice blocks, magic carpets, drains, power-ups.
- Canvas 459x340; map is 27x19 tiles at 17px (459x323) plus a bottom HUD strip. About 1.35:1, not 16:9.
- Loop: `setInterval` at 10ms in `Engine/Engine.js`; renderer runs as a module tick.
- Input: `keyCode` polled from `Engine.Keys`, hard-coded to one player in `PiNaBlaster.js`.
- Audio: one `<audio>` tag per sound, via `Engine.PlaySound`. Replaying a playing sound restarts it, so overlapping sounds cut off.
- Single player stored as `GameWorld.PlayerEntity` / `PiNaBlaster.Player`.
- Depends on jQuery only for document-ready and key events.

## Architecture

Modernize in place. Keep the engine and entity classes; change how they are driven.

### Game loop
`requestAnimationFrame` with a fixed-timestep accumulator (10ms sim step, clamped max catch-up per frame). Rendering once per frame. Pause when the tab is hidden or when the game is paused.

### Input module (`Engine/Input.js`)
- Merges keyboard and gamepads into per-player action state: `up, down, left, right, bomb, start`.
- Game code reads `Input.Player(i)`; nothing outside this module touches `keyCode` or the Gamepad API.
- Keyboard layouts: P1 arrows + Space; P2 WASD + Left Shift (configurable table). P3/P4 are gamepad only.
- Gamepad: D-pad and left stick with dead zone, snapped to 4 directions (grid game). A = bomb, Start = pause/join. Hot-plug supported with a connect/disconnect toast. Pads are assigned to players in the lobby.
- Edge detection (pressed this frame) provided for menu navigation and respawn.

### Audio module (`Engine/Audio.js`)
- Web Audio API. Fetch and decode all sounds once at load (wav; mp3 fallback if wav decode fails).
- Each play creates a new `AudioBufferSourceNode`, so overlapping instances do not cut each other off.
- Buses: master -> sfx, music. Independent volume. A compressor/limiter on master to prevent clipping during bomb chains.
- Per-sound voice cap (e.g. explosions: 6) with oldest-voice stealing; small random pitch variation (+/- a few %) for repeated sounds.
- Music (outro) is a looping source on the music bus with `Stop`.
- Resumes the AudioContext on first user input (autoplay policy).
- `Engine.PlaySound(id)` / `StopSound(id)` kept as thin wrappers so entity code changes minimally. `<audio>` tags removed from `index.html`.

### Players
- Replace the `GameWorld.PlayerEntity` global with `players[]`. Each Player has an index, color/palette, controller binding, lives, stats and alive state.
- Enemies target the nearest living player. Entity code that referenced the single player is updated to iterate or look up by owner.
- Bombs record their owner (for Battle scoring and colour).
- Player sprites are tinted per player index (palette swap on sprite sheet draw or pre-tinted offscreen copies), since no new art is being drawn.

### Scaling and layout (`Engine/Renderer.js`, `style.css`)
- Internal canvas is a fixed virtual 576x324 (16:9). The 459x323 map sits at full height, centred or offset per layout; spare width is split into two side panels.
- Side panels hold HUD: single-player uses one card (lives, bombs, power, active power-up timers, keys); multiplayer shows one card per player, split left/right.
- The canvas is scaled to the window preserving 16:9 with letterboxing, `image-rendering: pixelated`, `devicePixelRatio` aware, live-resized. Option to snap to integer scale.
- Fullscreen via Fullscreen API: `F` key and an on-screen button. The page title block is removed so the game fills the viewport.
- All text/HUD draws in virtual coordinates; no layout depends on window size.

### Screens and flow
- Title screen: Campaign / Battle / Options.
- Lobby: "press a button to join" for 1-4 players; shows assigned controller per player.
- Game, Pause overlay, Round/Match result for Battle, Win screen for Campaign (replaces the level-7 "PF 2012" hack with a proper end state that keeps the outro music).
- Options: master/SFX/music volume, integer scaling toggle, fullscreen. Persisted in `localStorage` (guarded with try/catch).

## Game modes

### Co-op campaign
- Existing 8 levels. 1-4 players spawn at `P` plus mirrored free corner tiles.
- Keys and doors are team-shared; a key picked up by any player opens doors for all.
- A dead player waits for respawn using a life (lives are per-player). If all players are out of lives, game over.
- Level completes when all enemies are dead (current rule).

### Battle
- One new symmetric 27x19 arena: four corner spawns with safe L-shaped starter space, destructible blocks, power-ups, no enemies.
- Bombs and chain explosions hurt every player including the owner.
- Last player standing wins the round; first to 3 round wins takes the match. Draw if the last players die in the same tick.
- Sudden death after a timer (e.g. 120s): hot walls close in from the edges (reuse `HotWall`).

## Fixes and polish

- Remove `console.log(key)`; gate debug hotkeys (editor, level skip, power cheats) behind a `?debug` URL flag.
- Pause on tab blur, Esc, or gamepad Start, with a visible overlay.
- Remove the jQuery dependency (document-ready and key events become native).
- While converting entities to N players, fix shared-state and timing bugs found; record each in the final summary instead of changing behaviour silently.
- Fix the typo "Counot" in the init error and add a real error screen instead of `alert`.

## Error handling

- No Web Audio, or decode failure: the game runs silently and shows a one-line notice.
- No Gamepad API or no pads: keyboard only; no errors.
- Fullscreen refused: silently stay windowed.
- `localStorage` unavailable: defaults are used and nothing is saved.

## Testing and verification

- Run the game through a static server and drive it in the in-app browser.
- Check scaling and letterboxing at several viewport sizes (including phone-like and ultrawide), plus fullscreen toggling.
- Check keyboard input for 1 and 2 players; check the 1-4 player lobby.
- Simulate the Gamepad API (`navigator.getGamepads` stub) for pad input and hot-plug, since no physical pad is available here. Real-hardware confirmation is left to the user.
- Audio: check overlap behaviour (voice cap, no cut-off) using a headless check on the Audio module's voice bookkeeping, plus listening checks by the user.
- Pure logic (loop accumulator, input snapping, battle win conditions) gets small unit checks runnable in Node where the code is DOM-free.

## Phasing for the implementation plan

1. Loop, Input and Audio modules; remove jQuery; fix and gate debug code.
2. Virtual 16:9 canvas, scaling, fullscreen, side-panel HUD (single-player).
3. Players refactor to `players[]`, enemy targeting, per-player tint and HUD cards.
4. Title/lobby/pause screens, options and persistence.
5. Co-op campaign rules, then Battle mode and the arena.
6. Bug sweep and final verification.

## Open items

- Exact keyboard layout for P2 (proposal above) can be adjusted.
- Battle ships with one arena; more can be added later.
- The workspace is not a git repository, so this spec is not committed. Initialising git is recommended before the implementation starts.
