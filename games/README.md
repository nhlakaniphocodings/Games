# X Games — game module API

Every game lives in `games/<slug>/` and exports a single `GameModule`.

```ts
// games/my-game/index.ts
import type { GameModule } from '@/lib/game/types'

class Runtime implements GameRuntime { /* ... */ }

export const game: GameModule = { ... }
export default game
```

The React shell (`components/game/game-shell.tsx`) and the engine
(`lib/game/controller.ts`) drive every module generically. Register the module in
`lib/game/registry.ts` — **do not edit the registry yourself unless asked**, and do
not edit shared engine files.

## GameModule contract

```ts
interface GameModule {
  slug: string                 // must match the catalogue slug
  title: string
  tagline: string              // one line of flavour
  theme: GameTheme             // colours (see below)
  controls: { keys: string; label: string }[]
  instructions: string[]       // 3–5 short lines shown before the first level
  levels: number               // 10
  view: { w: number; h: number }   // internal canvas resolution, use 960x540
  create(hooks: GameHooks): GameRuntime
}
```

## GameRuntime contract

```ts
interface GameRuntime {
  load(level: number): void                  // reset ALL state for level 1..N
  update(dt: number, input: InputState): void // logic; dt in seconds
  render(g: CanvasRenderingContext2D, w: number, h: number): void
  focus?(): Vec | null                       // player position for death FX
  destroy?(): void                           // clear timers only
}
```

`hooks` (given to `create`):

```ts
interface GameHooks {
  death(message?: string): void   // fail the level — shell handles animation + restart
  complete(): void                // level won — shell advances / opens level-complete
  sound(name: SoundName): void    // 'jump'|'land'|'death'|'win'|'click'|'blip'|'flip'|'hit'|'checkpoint'|'unlock'
  shake(amount: number): void     // 0..1.4
  reducedMotion: boolean          // live getter value; skip heavy FX when true
}
```

## InputState

```ts
input.left, input.right, input.up, input.down     // held
input.jump, input.action                          // held
input.jumpPressed, input.actionPressed            // edge (true for one frame)
input.pointer = { x, y, down, pressed }           // canvas-space pointer
```

Keyboard mapping already provided by the shell: ←/→/A/D move, ↑/W/Space jump,
E/Enter/J action, R restart, Esc pause. Games that need a different meaning for
jump (e.g. gravity flip) just use `input.jumpPressed` themselves.

## Shared helpers (use these, do not reinvent)

- `@/lib/game/platformer` — `PlatformerPlayer` (gravity, coyote time, jump buffer,
  variable jump, `flip()`, `gravityDir`), `moveAndCollide`, `Solid`.
- `@/lib/game/math` — `clamp`, `lerp`, `approach`, `rectsOverlap`, `circleRect`,
  `pointInRect`, `distance`, `makeRng`, `formatTime`.
- `@/lib/game/particles` — `ParticleSystem` (`emit`, `update`, `render`, `clear`).
- `@/lib/game/draw` — `roundRect`, `fillRoundRect`, `strokeRoundRect`, `label`,
  `drawGrid`.
- `@/lib/game/types` — all shared types.

## Persistence

Progress (unlocked levels, deaths, best time, no-death badges) is handled entirely
by the shell via `lib/game/storage.ts`. A module must **not** implement its own
save logic.

## Quality bar

- Exactly 10 hand-designed levels per game, each winnable and deterministic.
- Difficulty comes from reading traps, not from unfair randomness.
- Reset every trap/platform/timer in `load()` so restart is instant and correct.
- Call `hooks.death()` on the exact frame of failure and `hooks.complete()` on victory.
- No TODOs, no placeholder screens, no dead buttons.
- Typecheck with `node node_modules/typescript/bin/tsc --noEmit` and fix all errors.
- Never rely on colour alone to mark hazards — use shape and motion too.

See `games/_template.ts` for a compilable starting point and `games/x-devil/` for
a full data-driven platformer.
