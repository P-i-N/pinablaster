# Campaign Levels Design

Date: 2026-10-01
Status: requested by user ("design better campaign levels with increasing difficulty and complexity, have fun with it")

## Problem

The original 7-level campaign has no difficulty curve. Level 1 throws all seven enemy types at once. Later levels
bring in ice, drains, carpets and keys without introducing them. The level data is a `switch` inside
`PiNaBlaster.SetLevel`. The finale ("level 7", the PF 2012 outro) is hard-coded in four places.

## Goal

A 12-level campaign that brings in one idea at a time and then combines them. Each level has a name and a one-line
hint shown when it starts. Plus a checker that proves every level can be finished.

## The campaign

| # | Name | New | Enemies |
|---|------|-----|---------|
| 1 | First Steps | bombs, bricks | Dumballoons |
| 2 | Mop on Meth | seekers, a central plaza | + Mops |
| 3 | Hide and Seek | a maze full of dead ends | + Drakentus (fast, flee, steal power-ups) |
| 4 | Ice Rink | pushable ice, an ice-gated pen, first frozen bombs | mix |
| 5 | Chain Reaction | caged enemies behind frozen-bomb fuses | + Flamies (fire) |
| 6 | Down the Drain | sealed pens that only drains can reach | mix |
| 7 | Shoop da Whoop | broken sight lines, sniper row | + Shoops (lasers) |
| 8 | Conveyor | a belt loop that carries bombs and enemies | + Blowfrogs (build walls) |
| 9 | Lock and Key | nested vaults, key chain A -> B -> C -> D | + Angry 4channers (shields) in the last vault |
| 10 | The Factory | twin belt loops carrying ice and frozen bombs | all but Dumballoons |
| 11 | Sewer Vault | drains + keys + lasers, asymmetric | heavy mix |
| 12 | Final Blast | moat, belt ring, two-chamber fortress | everything |

Then the original PF 2012 outro ("You won!").

## Data (`Game/Levels.js`, pure)

- `CAMPAIGN_LEVELS`: `{ Name, Hint, Map: [19 strings of 27], Over: [[x, y, ch], ...] }`. The map uses the existing
  tile legend. `Over` holds entities that stand on top of a carpet or drain tile, for example an enemy riding a
  belt. The map has room for only one character per tile.
- `CAMPAIGN_END` = number of levels = the outro's level number. `CampaignLevel(n)` returns a copy. The game
  mutates `GameWorld.Walls`, so the source maps must never be handed out.
- `LevelProblems(level, spawns)` lists what is wrong (empty = fine):
  - Shape and legend: 19 x 27, known characters, solid border, `Over` only on floor or carpet / drain tiles.
  - Reachability: flood from spawn 1, through bricks, ice and entities. Picking up a reachable key opens its doors.
    Repeat until nothing changes. Every spawn and key must be reached.
  - Every enemy is killable: reachable, or its pen touches a drain while some drain is reachable, or its pen
    touches a frozen-bomb chain that a player can reach.
  - Spawn safety: the spawn tile is free, no enemy within 4 tiles (Manhattan), and a free tile outside the
    power-1 blast cross is within 4 steps. The first bomb is always survivable.
- `LevelThreat(level)`: weighted enemy count (Dumballoon 1, Mop 2, Drakentus / Flamie / Blowfrog 3, Shoop 4,
  4channer 5). Tests require it to never drop from one level to the next.

## Game changes

- `SetLevel` reads `CampaignLevel(n)`. Tile handling moves into `SpawnTileEntity(ch, x, y)`, shared by the map pass
  and the `Over` pass.
- The outro is `CAMPAIGN_END` instead of `7` (PiNaBlaster, Sim). The title background is the finale map.
- Level start: `ShowNotice("NAME - hint")` for 5 s. It works for LAN guests too, because the notice is in the snapshot.
- Debug: PageUp / PageDown move to the previous / next level, because digit keys only reach levels 1-9.
- `Sim.Run({ single: true })` stops when the first level is cleared. It is used to measure each level.

## Verification

- `tests/levels.test.js`: every level passes `LevelProblems`, threat never drops, every enemy type and mechanic
  appears, copies are independent, and the checker catches sealed enemies, unsafe spawns and bad shapes.
- Seeded Sim runs per level with hard bots (human seat immortal): every level gets cleared, and clear time / bot
  hits rise across the campaign.
