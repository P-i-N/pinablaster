# Simulation Mode Design

Date: 2026-10-01
Status: requested by user ("simulate the game as fast as possible ... render every 60th frame or so")

## Goal

Iterate on the AI quickly: play games at full CPU speed in the browser, without sound or per-frame drawing, and get measurable, repeatable results.

## Turbo mode (engine)

- `Engine.SetTurbo(on, opts)`, opts `{ drawEvery = 60, sliceMs = 12, run = true }`. Also `?sim` in the URL turns it on at start.
- While on: the animation-frame loop does nothing. A `MessageChannel` loop (not throttled in hidden tabs) runs `TurboRunner.RunSlice`: as many fixed steps as fit in `sliceMs` of wall time, then yields to the browser. Every `drawEvery` steps one frame is drawn.
- `Engine.Step()`: one fixed step (input poll, screen update, simulation tick). `Engine.Draw()`: draw once.
- No sound: `Engine.PlaySound` / `StopSound` return early. No auto-pause when the tab is hidden. The background ticker for hidden LAN hosts stays out of the way.
- `run: false`: turbo state (no sound, no frame loop) without the automatic loop, for callers that step themselves (Sim).
- Off: the normal loop resumes (the frame clock is reset so no time is "caught up").

`Engine/Turbo.js` (pure, Node-tested): `TurboRunner(step, draw, drawEvery, sliceMs)` and `SeededRandom(seed)` (mulberry32).

## Sim harness (`Game/Sim.js`, developer tool)

```
await Sim.Run({ mode: "campaign", level: 5, roster: ["kb0", "ai:normal", "ai:hard"], seconds: 60, seed: 7, immortal: true })
await Sim.Batch([...options])        // sequential
Sim.Summary(results)                 // aggregate
```

- Roster entries are lobby ids (`"kb0"` = a human seat nobody presses, `"ai:<level>"`). `immortal`: human seats can't be hurt, so bots play on.
- `Math.random` is replaced by `SeededRandom(seed)` for the run and restored afterwards: same seed, same code -> same game.
- Steps run in ~30 ms slices with a yield in between, so the page stays responsive. One frame every `drawEvery` (default 300) steps.
- Recorded:
  - `kills` / `enemies`: Campaign enemy kills, and the enemies on the levels played.
  - `levels`: levels cleared.
  - `hits: [{ player, bot, cause, t }]`: cause is `own`, `player<n>`, `enemy:<tile>` (`enemy:g` = Angry 4channer; touch, laser or shot), `frozen bomb`, `sudden`.
  - `rounds: [{ winner, t }]`, `winner`: Battle. Rounds continue automatically until the match is over.
  - `reasons: { playerIndex: { reason: count } }`: AiDecide results.
  - `outcome`: `"time"`, `"match"`, `"gameover"` or `"won"`, plus `seconds` of game time.
- `Sim.Summary(results)` (pure, Node-tested): run count, total kills / enemies, hits by cause, round wins by player, average round length.

## Testing

- `tests/turbo.test.js`: `TurboRunner` runs steps until the slice is used up, draws every N steps across slices, always makes progress. `SeededRandom` is repeatable, in [0, 1), and differs by seed.
- `tests/sim.test.js`: `SimSummary` aggregation.
- Browser: a 120 s battle with three bots finishes in a few seconds of wall time. The same seed run twice gives an identical result. Turbo with `?sim` visibly fast-forwards, and turning it off restores normal speed and sound.

## Results (2026-10-01)

- Battle arena (3 bots): 300 game seconds in 1.6 s (~190x real time). The same seed run twice gives identical results, also across page reloads.
- Entity-heavy Campaign level (index 3: 81 magic-carpet tiles) was ~16x real time. The cost was in the engine's entity loops, not in the AI (AI planning was ~1.4% of the step time). Two behaviour-preserving engine changes:
  - `GameEntityManager.MoveEntity` returns at once for entities with no direction and no next direction. The rest of the function cannot change anything then; it only paid for a collision scan.
  - Magic carpets and drains are `Static`. The touch pass skips pairs of two static entities, whose `OnTouch` only reacts to solid entities or bombs.
  - Proof: three seeded golden runs (battle, two campaign levels) gave byte-identical results before and after. The level-3 step went from 0.60 ms to 0.34 ms (box tests per step from 9183 to 2959), now ~27-30x real time.
- Further speed would need a spatial broad-phase for the entity loops. Not done.
