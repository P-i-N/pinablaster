# PiN'a'Blaster

A Dyna Blaster style HTML5 game: a 12-level campaign that brings in one idea at a time (enemies, ice blocks, frozen-bomb fuses, drains, magic carpets, keys and doors) and then mixes them all, plus a Battle mode. 1-8 players on one screen, keyboard and gamepads (CPU players fill the free seats). Every player gets a different colour.

## Run

The game loads its sounds with `fetch`, so open it through a web server, not from `file://`. `server.py` serves the game files (with browser caching turned off, handy while developing) and also hosts LAN multiplayer rooms:

```bash
python server.py --port 8000
```

then browse to <http://localhost:8000/>. (`python -m http.server 8000` works too.)

## Controls

| | Move | Bomb | Menu |
|---|---|---|---|
| Player 1 (keyboard) | Arrow keys | Space | Enter = start / confirm, Esc = back / pause |
| Player 2 (keyboard) | W A S D | Left Shift | |
| Gamepad (any, up to 4 pads) | D-pad or left stick | A or X | Start = start / pause, B or Select = back |

**Touch (phones / tablets):** an on-screen d-pad, a BOMB button, `II` (start / pause) and `BACK` appear automatically on touch devices. Options -> *Touch controls* can force them `On` or `Off` (default `Auto`). Landscape works best. The touch controls join the lobby like any other device (tap BOMB to join, `II` to begin).

**Mouse:** every menu works with the mouse as well: point at an entry to select it, left-click to confirm it (on a volume, the left / right half of the entry lowers / raises it), right-click to go back (during a game a right click pauses, like Esc). In the lobby and the LAN room, click a seat to add a CPU player (on a CPU seat the left / right half makes it easier / harder), and use the Start button at the bottom (right-click leaves the lobby or the room).

`F` toggles fullscreen (so does the button at the bottom-right of the page). `M` mutes / unmutes all sound. In the lobby (a list of eight seats) each player presses Fire on their device to join; Start begins the game. Battle needs 2+ players (CPU players count). A game can also be played by CPU players alone, to watch: add only CPU players and press Start (Enter) on any device (a campaign needs one CPU player, a battle two); Esc / Start still pauses. On a LAN the host can do the same from a room that only has CPU seats.

**CPU players:** in the lobby move the highlight with Up / Down and press Left / Right on the free row to add a computer player. On a CPU row Left / Right switches Easy / Normal / Hard; Left on Easy removes it. CPU players help in Campaign (they never bomb a teammate) and fight everybody in Battle. They read the whole map: bombs riding magic carpets, drains passing blasts on, frozen bombs in ice, charging lasers and fire shots, and they push ice blocks out of the way. Normal and Hard bots also bomb through drains and onto carpets, set traps in Battle, pick escape routes away from opponents and keep out of shooters' lines; Normal and Hard bots kick bombs when they hold the push power-up - any bomb, whoever dropped it: one that threatens them away from themselves, or into an opponent - and go a long way to pick that power-up up. In a Battle all CPU players play more aggressively: they hunt from anywhere on the map, dig towards the nearest opponent rather than just any brick, close in on opponents when there is nothing else to do and (Normal and Hard) drop a bomb on an opponent that gets within three tiles whenever their own way out is safe. This tuning (`AiAggressive` in `Game/AiBrain.js`) applies to battles only. The bots also know about the arena closing in (sudden death): they look 8 seconds ahead at which cells will shut and when, treat those cells like a blast about to land (they leave them, do not plan a way through one that shuts before they are across, and do not pick spots on them) and retreat towards the middle in good time. Players do not collide with each other, and CPU players keep apart on purpose: they plan round one another when there is room (through them only when there is none), a bot standing on another player steps off to a free tile at once, and nobody can drop a bomb on a tile another player stands on. Under each CPU player's stats the HUD shows one word for what it is doing: FLEEING, DODGING (steps away from an enemy), SPREAD (steps off another player), DIGGING, LOOTING (power-ups), KEYS, KICKING, SKULL, SEARCHING, WAITING (no bombs left), CHASING (battle) and, when it goes for an enemy, HUNTING / KILLING - or GUARDING when that enemy is close to a human; ATTACK in a battle. Their movement is steadier than it was: a bot keeps the goal, escape tile and digging spot of its last plan unless something is clearly better, does not turn back mid-step for a goal that is no nearer, and a way out may include waiting for a blast to pass. The forecast knows that a tile can burn twice, that a kicked or carpet-borne bomb goes off when it slides into a tile that is still burning, and that bombs stop in front of players; a bomb is only dropped where a tile that never burns can be reached, and a bot kicks a threatening bomb away only when the kick also hits somebody (otherwise it runs). Bots dig carefully: the forecast knows a brick is gone once a blast has destroyed it (a later blast then reaches past it), and a bot will not drop a digging bomb whose blast would burn a power-up that another bomb is about to uncover (the second blast comes half a second or more after the first) or one that is already lying there - it digs elsewhere or waits for the first bomb to go off (attacks still count for more). In the campaign the CPU players cooperate: they put what they are going for on a shared board and keep off goals (a brick, an enemy, a key) that a teammate who is at least as near has claimed, so they spread out instead of piling onto one spot; they leave a power-up to a human who is clearly nearer to it; and they go for enemies that are close to a human first. Normal and Hard bots also stalk: from how the enemies move (straight on until blocked, then to one of the sides; the ones that seek or flee a player lined up with them do that first) they forecast where a walking enemy will be in the next few seconds, and drop a bomb when the blast is likely (50% or more) to catch it when the bomb goes off 2 s later, rather than only when the enemy is in the blast line now. They know the skull power-up too (see *Skulls*): they keep out of a blinking skull's reach, and Normal and Hard bots use it as a delayed bomb.

## Playing on a LAN (office network)

Start the server on one machine and let everybody open its address:

```bash
python server.py
```

It prints something like `http://192.168.1.20:8000/` - share that with your coworkers. (If they cannot connect, allow Python through the Windows firewall for *private* networks. `python server.py --host 127.0.0.1` keeps it local to your machine.)

1. On the title screen choose **Play on LAN**. One person picks **Host a game**, everybody else picks **Join a game** and chooses the room.
2. In the room, every player presses **Fire** on the device they want to play with (keyboard 1, keyboard 2, gamepad, touch controls). One browser can take several seats, so hotseat and LAN combine freely - **8 players in total** (for example two keyboards plus four gamepads and two CPU players on one PC).
3. The host moves a highlight with Up / Down: on the mode row Left / Right switches Campaign / Battle, on a seat row it adds / changes / removes a CPU player (only the host can add CPU players; they run in the host's browser). The host starts the game with Start (Enter / `II`). `Esc` / B on a seat you already took releases it; on a free device it leaves the room.

How it works: the host's browser runs the game and the server only relays messages, so **the host must keep their browser open**. A LAN game cannot be paused (Esc opens a menu while the game keeps running). If a guest leaves, their player dies; if the host leaves, the room closes. Result screens are controlled by the host, who can send everybody back to the room lobby. Joining is only possible while a room is in its lobby.

The server is meant for a trusted network: there are no passwords. It serves only the game files (never `.py` files or the `docs` / `tests` folders).

## Modes

- **Campaign** - 1-8 players (players 7 and 8 start in the middle of the left / right side, with the bricks around them cleared), shared keys and doors. Everyone starts each level with fresh stats. The game is over when all human players are dead with no lives left (CPU players alone cannot carry on). When the last enemy dies the game freezes and a black circle closes round the first living human (0.8 s), the next level is put in behind it and the circle opens again on the new level's start (0.8 s); simulation runs (`?sim`, `Sim.Run`) skip the wipe. Each level opens with its name and a hint:
  1. *First Steps* - bricks and slow balloons. 2. *Mop on Meth* - seekers in a plaza. 3. *Hide and Seek* - corner fast, power-up-stealing drakes in a maze.
  4. *Ice Rink* - push ice, crack an ice-gated pen. 5. *Chain Reaction* - light frozen-bomb fuses through enemy cages. 6. *Down the Drain* - sealed pens only drains reach.
  7. *Shoop da Whoop* - laser snipers. 8. *Conveyor* - a belt loop carrying bombs and monsters. 9. *Lock and Key* - a four-key vault chain.
  10. *The Factory* - frozen bombs riding twin belts. 11. *Sewer Vault* - drains, keys and lasers together. 12. *Final Blast* - moat, belt ring and a two-chamber fortress.
- **Battle** - last player standing wins a round, first to 3 round wins takes the match. One-hit kills, bombs hurt everybody including their owner. After 2 minutes the arena closes in from the outside, crushing whoever it closes on. No heart or extra-life power-ups drop in Battle. Choose the arena in the battle lobby (the level shown dimmed behind the seats; the arrows at the sides of the screen, or Up to the level row and then Left / Right, change it): *Classic*, *Open Field* (most bricks gone), *Carousel* (a loop of magic carpets round a pen of ice, four drains), *Ice Rink* (ice blocks instead of many bricks, four frozen bombs), *Conveyor* (belts of magic carpets across the arena) and *Sewers* (five drains - a bomb that goes off on one goes off on all). Every arena keeps room for eight players at their starting spots. They are defined in `Game/Battle.js` (`BATTLE_LEVELS`).

- **Demo** - a Battle of eight CPU players (Hard and Normal) on a special arena, to watch: fewer bricks, a loop of magic carpets carrying bombs round a pen of ice blocks (one with a frozen bomb in the middle), and four drains (a bomb that goes off on a drain also goes off on every other drain, with the same strength). It goes on by itself, round after round and match after match, until you quit (Esc or right click, then *Quit to title*). In the demo the mouse plays too: click an empty tile to put a bomb there, a bomb (anybody's) to set it off, a power-up to have the nearest player pick it up, a skull to make it time out (it blows up or lets out an enemy right away), a dead player to bring them back.

## Kicking bombs

While you hold the push power-up (20 seconds per pick-up, shown on your card) you can kick **any** bomb - yours, a CPU player's, anybody's: walk into it and it slides on until something is in its way. Without the power-up a bomb is a wall.

## Skulls

The skull power-up is a curse: picking it up gives a player random bad luck for 10 seconds (slow or fast walking, bombs dropped too slowly or too quickly, no bombs, no fire, random explosions, random bomb pushes). Left lying around it does not stay harmless:

- After **10 seconds** it starts blinking quickly.
- **5 seconds later** it ends, by a coin flip: it **explodes** with a random reach of 1-5 flames, or it **breaks open and lets out a random enemy** with the ice-breaking sound. In the Campaign that is one of the kinds the level started with (level 1 only ever gets balloons, never a laser sniper), even if all of them have been killed since; in a Battle, which has no enemies of its own, any of the seven kinds can turn up in the arena (an enemy also counts towards clearing a campaign level).
- A blast that reaches a skull first destroys it - and if that happens while it is blinking (its last 5 seconds), it turns into a random other power-up (never another skull; in a Battle never a heart or an extra life) instead of just vanishing. Before it starts blinking, a blast simply destroys it. An enemy (Drakentus, the thief) can still steal it.
- Whatever ends it, the skull crumbles into blue dust (a broken-open skull also gives off a gust of wind). Other power-ups destroyed by a blast crumble into blue dust too.

CPU players plan for the worst: a blinking skull counts as a bomb of reach 5 that goes off when its time is up, unless another blast gets it first. Normal and Hard bots also lurk just outside a skull's reach, by the exits of an opponent (or enemy) standing inside it, and bomb when that traps or hits the target. Easy bots do not do that. Normal and Hard bots with a free bomb also try to blow up a blinking skull for the power-up it turns into: they walk to a spot from which their blast reaches it, if they can get there and let the fuse burn (2 s) before its time is up, and do not run from its reach meanwhile; a skull that a bomb is already going to reach is left alone. In Battle the bots treat an enemy let out by a skull as a threat and a target.

## Options

Master / effects / music volume, integer scaling (crisp pixels at whole-number zoom), touch controls (Auto / On / Off) and fullscreen. Settings are remembered in `localStorage`.

## Wind effects

Explosions and moving creatures stir a grid based Navier-Stokes fluid (`Game/Fluid.js`): blasts push air out through corridors and gaps, bricks and walls block it, and it carries smoke and a hot glow. A destroyed brick crumbles into brick-coloured fragments that fly on that wind and bounce off walls and bricks (`Game/Particles.js`); breaking ice throws shards, power-ups sparkle when picked up, and a broken power-up (or a skull) crumbles into blue dust. Ice blocks block the wind and bounce fragments: `Game/CollisionGrid.js` keeps one tile grid of level walls plus entities flagged `BlocksFluid`, updated every tick. Every explosion also darkens the ground a little, most at the bomb and fading away from it, until the level ends. Smoke and glow are drawn under the explosions; fragments lie between the ground and the walls. It is purely cosmetic (it only observes the game, uses its own random numbers, and is off in `?sim` / turbo runs), and LAN guests simulate it locally from the snapshots. Options -> *Wind effects* turns it off. The glue and rendering are in `Game/Fx.js`. The fluid itself runs in a worker thread (`Game/FluidWorker.js`, driven through `Game/FluidProxy.js`, so the wind and smoke you see are a frame or two behind the game); where workers are unavailable it runs on the main thread instead.

## Developer notes

- `?debug` enables debug hotkeys (offline games only): `E` edit mode (freezes entities), `D` danger overlay, `1`-`9` jump to a level, `PageUp` / `PageDown` or `-` / `+` previous / next campaign level, `R` revive player 1, `*` revive every human player or refill their hearts. `?debug&players=N` skips the title and starts a campaign with N players.
- Simulation mode for AI work: `?sim` fast-forwards the game (no sound, a frame drawn every 60 steps; `Engine.SetTurbo(false)` in the console returns to real time). `Sim.Run({ mode, level, roster, seconds, seed, immortal, single })` in the console plays a seeded, repeatable game at full speed and returns kills, hits by cause, round winners and AI decision counts; `Sim.Batch([...])` and `Sim.Summary(results)` run and total many. Example: `Sim.Summary(await Sim.Batch([1, 2, 3, 4].map(seed => ({ mode: "campaign", level: 3, roster: ["kb0", "ai:normal", "ai:hard"], seconds: 40, seed, immortal: true }))))`.
- Every CPU player plans in a worker thread of its own (`Game/AiWorker.js`, driven by `AiController`; the same split as the fluid worker): the controller sends the tile view, keeps walking its old path until the plan comes back (about a millisecond later), drops an answer that no longer fits where the bot now is, and plans on the main thread when workers are unavailable, in turbo (`?sim`, `Sim.Run`, so seeded runs stay repeatable), or if a worker fails or takes over half a second. Workers are stopped when the game is left.
- Headless AI bench (Node, all cores, no browser): `node tests/aibench.js battle [seeds] [level] [seconds]` plays seeded 4-bot battles on every arena, the current AI (`Game/`) against a frozen copy of an older one (`tests/ai_baseline/`), with the seats swapped as well, and prints wins, deaths by cause, kills, kicks and jitter (direction reversals and A-B-A-B tile flip-flops per minute). `duel` and `campaign` modes too; the environment variables are listed at the top of the file (`BASE_DIR` / `AI_SET` test a tuning change head to head). `tests/headless.js` is the headless game it uses, with test arenas for single skills (`LAB=kick|drain|maze`, and `GIVE='{"PushableBombsTime":1e9,"Power":3}'` to hand every bot a loadout), e.g. `LAB=kick GIVE=... node tests/aibench.js battle 12 hard 240`; `ALLNEW=1` fills every seat with the new AI. `COOP=normal node tests/aibench.js campaign 14 hard 200` plays the campaign with the human seat played by the original AI at that level (a stand-in for a person who moves about) and reports who hurt whom (enemies, own bombs, friendly fire) and the clear time.
- Campaign maps live in `Game/Levels.js` (tile legend at the top). `LevelProblems` checks a level can be finished (every enemy and key reachable or drain-reachable, doors have keys, every spawn can survive its first bomb); `tests/levels.test.js` runs it on every level for 1-8 players and checks the difficulty never drops. Add `single: true` to a `Sim.Run` to stop when the first level is cleared.
- Tests (no dependencies): `node --test tests/*.test.js` (Node 22) and `python -m unittest discover -s server_tests`
- `server.py` + `lan/` is the Python side (static files, WebSocket codec, rooms). `Net/` and `Game/NetGame.js`, `Game/Lan.js` are the browser side. See `docs/superpowers/specs/2026-10-01-lan-multiplayer-design.md`.
- The game runs on a fixed 10 ms simulation step inside `requestAnimationFrame`; the virtual canvas is 576x324 and is scaled to the window by CSS.
- `Library/jQuery.js` is no longer used or loaded.
