# Smarter AI Players Design

Date: 2026-10-01
Status: approved by user ("whatever you think" - design choices delegated)
Builds on: `2026-10-01-ai-players-design.md`

## Goal

Bots that understand the special parts of the maps and use them: drains, magic carpets, ice blocks, frozen bombs, enemy lasers and fire shots, kickable bombs, plus battle traps.

## Game mechanics (from the code, measured where noted)

- **Magic carpets** move every solid entity except players: bombs, ice blocks, enemies. A carried bomb crosses a tile in about 0.08 s (measured), follows turns and stops on the first non-carpet tile or in front of anything solid. A carpet cancels a kick.
- **Kicked bombs** (bombs dropped while the push power-up is active are `Pushable`): walking into one sets its direction. It slides at 1 px per step (0.17 s per tile) until something stops it.
- **Drains**: a bomb going off on a drain also blasts out of every other drain, with radius 1 (super bomb: full power, through soft walls).
- **Frozen bombs** (`I` ice blocks) burst with radius 1 when a blast reaches them. Plain ice breaks. Blasts pass through entities.
- **Shoop-da-whoop** (enemy type 2) charges for 1 s (was 3 s until 2026-10-05), then fires a laser along its whole line when 0.5 s of the charge are left. The laser stops before hard walls and on soft walls. `Enemy` gets a `ShoopDir` property so the AI can see the direction (the only game-code change).
- **Flamie** (type 4) spits a `Shot` that flies at 1 px per step until it is blocked, then bursts with radius 1. The shot itself is harmless.
- **Ice blocks** are pushable: walking into one moves it a tile if the tile behind it is free.

## Architecture

```
Game/AiWorld.js   (new, pure)  grid helpers, blast lines, bomb tracks, AiForecast (danger map + detonations)
Game/AiBrain.js   (pure planning + browser glue)  AiDecide, goals, kicks, traps, AiBuildView, AiController
```

`AiWorld.js` is loaded before `AiBrain.js` (index.html). In Node, `AiBrain.js` pulls it in with `Object.assign(global, require('./AiWorld.js'))`.

### View additions

```
bombs:   [{x, y, power, time, superBomb, pushable, dir}]   dir = sliding direction (0 = still)
ice:     [{x, y, frozen}]      (no longer in `blocked`)
carpets: [{x, y, dir}]
drains:  [{x, y}]
lasers:  [{x, y, dir, time}]   charging Shoop enemies: time until the laser fires
shots:   [{x, y, dir}]         (no longer in `fire`)
enemies: [{x, y, cover, type}]
me.kick: true while the push power-up is active
```

### Forecast (`AiForecast(view) -> { danger, bombs }`)

1. Every bomb gets a **track**: `[{x, y, t}]`, from carpets (0.08 s per tile, any direction changes) and from sliding (0.17 s per tile), until its timer runs out or something solid stops it.
2. Events: bomb detonations (at their timer), frozen bombs (when reached), live fire (t = 0), lasers (at `time`), shot bursts (at impact).
3. Process the earliest event. Its tiles burn at time t: a bomb burns its cross at its track position at t, plus every other drain's cross if it is on a drain. Every not-yet-fired bomb whose track position at t is inside, and every frozen bomb inside, fires at t too.
4. `danger[i]` = earliest burn time (Infinity = never). `AiDangerMap(view)` = `AiForecast(view).danger`.

### Planning changes (`AiBrain.js`)

- **Bomb effect.** `AiBombEffect(view, me, at, danger, opts)` gives `{ after, sooner, safe }`: the forecast with a new bomb at `at`, the tiles that would burn sooner than now, and whether the bot escapes from `at`. Attacks, teammate safety, cornered bombs and remote goals all use `sooner`, so drains, carpets and chains count everywhere.
- **Ice pushing** in `AiReach`: an ice tile can be entered when the tile behind it (same direction) is plain floor with nothing solid on it.
- **Remote goals** (level `Remote`): up to 24 of the nearest reachable drain / carpet tiles are tried as bomb spots. A spot whose bomb would hit a target, with a safe escape, and no teammate harm in Campaign, becomes a goal (`remote`).
- **Kicks** (level `Kicks`, `me.kick`): for each still, pushable bomb within 8 tiles and each direction, the stand tile is the tile behind it. A kick is good when the forecast with the bomb sliding hits a target, the stand tile stays safe, and no teammate gets hurt. If the bot is threatened, a kick from its own tile that makes the tile safe beats fleeing. Otherwise good kicks are goals (`kick`), and on arrival the plan is `{ kick: dir }`. The controller holds that direction for 0.08 s.
- **Traps** (level `Traps`, Battle): bomb when an opponent within 8 tiles can escape now, would be threatened after the bomb, and would have no escape then. Opponents run at speed 1 with no margin.
- **Line of fire** (level `AvoidSight`, Campaign): tiles in the line of sight (up to 8 tiles) of Shoop and Flamie enemies are never goals.

### Difficulty

| | Easy | Normal | Hard |
|---|---|---|---|
| Forecast, ice pushing | yes | yes | yes |
| `Remote` (drains / carpets) | - | yes | yes |
| `Traps` | - | yes | yes |
| `Kicks` | - | - | yes |
| `AvoidSight` | - | yes | yes |

## Known limits (accepted)

- Enemies and ice blocks riding carpets are planned where they are now.
- A path that pushes an ice block assumes the block moves one tile; a second push in the same direction is only checked when the bot gets there (stuck detection re-plans).
- Opponents are assumed to escape as well as possible (speed 1, no margin): traps are conservative.

## Testing

- `tests/aiworld.test.js`: carpet track (straight, corners, obstacle), kicked slide (and timer cut-off), drain crosses (normal / super), frozen bomb chain, laser line, shot burst.
- `tests/ai.test.js`: ice pushing paths, flee from a bomb a carpet carries over, remote drain attack (Normal yes, Easy no), Hard kick into an opponent (Normal no), kick to escape, battle trap (Normal yes, Easy no), line-of-fire goals, laser flee, controller kick steering.
- Browser: Campaign levels with drains (3, 5, 7), carpets (4, 6), ice and frozen bombs (4, 5), lasers; Battle with a Hard bot holding the push power-up.

## Findings from playtesting (2026-10-01)

1. "Never wait in a line of fire" originally covered laser enemies too. Every hunt spot is in the target's line by nature, so on the laser-corridor level (index 3) bots stopped hunting altogether (0 kills). Now attack spots ignore it, and it only covers fire-spitters (type 4). Lasers charge for 2.5 s and the forecast handles them.
2. A/B with the Sim harness (8 identical seeds, 40 s, Normal + Hard, human seat immortal). New tactics vs the same bots with Remote / Traps / Kicks / AvoidSight off:
   - level index 3 (laser corridors, carpets): 65/80 vs 35/66 kills; hits taken 9 vs 28
   - level index 4 (ice, frozen bombs, drains): 13/56 vs 14/56 (no difference)
   - level index 5 (carpets): 18/32 vs 14/32
   - No hit from the bots' own bombs in the smart runs. The baseline had 2.

## Bots stalling on level 6 (index 5, the carpet ring level) - fixed 2026-10-01

Reported: with 1 player and 2 bots, the bots "get bored or confused and just stop". Reproduced with `Sim.Run` (seed 1): from 12 s to 150 s both bots were `idle` and the last enemy survived. Causes, each with a regression test in `tests/ai.test.js`:

1. **Riding enemies.** The last enemy rides the outer carpet ring (~12 tiles/s), but the planner treated enemies as standing still. Enemies on carpets now get a predicted track (`AiTargetTracks`, horizon 2.5 s). Hit checks (`AiHitsTargets`) ask whether the blast burns a tile while the enemy is on it, so bots bomb ahead of it.
2. **Ambush** (Normal/Hard): bots wait beside, never on, a riding enemy's route and bomb when the timing works. **Approach** (all levels, Campaign): with nothing else to do, close in on the nearest enemy instead of freezing.
3. **The planner's own body** stops riding enemies too. Predicted routes ignored it.
4. **Deadlocks** (an enemy jammed on the ring behind an ice block and a bot): after 8 s without dropping a bomb, with only idle / approach / ambush to do, a bot is **restless**. It pokes (a safe bomb with a target within 3 tiles) or wanders to a random safe tile 3-8 steps away, and keeps that path until done; re-rolling it every plan only made it jitter.
5. **Ice blocks** break in a blast: tiles next to them are now "wall" goals. A bot was sealed in by an ice block that could not be pushed.
6. **Things stuck between tiles.** An ice block 1 px off its tile poked into the bot's tile, so the game refused the bomb and the bot retried every tick. Ice blocks and bombs now block every tile they cover.
7. **Bombs on carpets.** A bomb dropped on a carpet rode into the only way out (found because of 5). Moving bombs now block the tiles of their route.

Result (16 runs, 150 s, Normal + Hard and Normal + Normal, seeds 1-8): the level is cleared every time, in 7-78 s (before: seed 1 never). 1 hit by a bot's own bomb on that level in 16 runs.

Not changed: in a crowded 4-bot Battle, bots are sometimes trapped by an opponent's bomb dropped into their escape route. That is real play, but choosing escapes away from opponents could reduce it.

## Escapes away from opponents (Battle) - 2026-10-01

Bots got trapped when an opponent dropped a bomb into their way out. Now Normal and Hard (level `Wary: 2`) treat "contested" tiles - tiles an opponent can walk to within 2 steps (`AiContested`, a walk search from each opponent) - as no way out: a flight first looks for an escape that keeps out of them (then falls back to the usual ones), and a bomb only counts as safe if such an escape exists. Easy stays careless.

A/B with the Sim harness (4-bot battle, 120 s, seeds 1-8, identical on both sides):

| | own-bomb hits Hard | own-bomb hits Normal (2 bots) | attacks planned (Hard / Normal) | hits by opponents |
|---|---|---|---|---|
| off | 9 | 4 | 352 / 390 | 10 |
| radius 1 | 3 | 6 | 332 / 394 | 13 |
| radius 2 (chosen) | 1 | 0 | 309 / 395 | 7 |
