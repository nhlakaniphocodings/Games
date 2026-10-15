// Shared types for the X Games engine.
// All games implement the GameModule / GameRuntime contract so the
// GameController and the React shell can drive them generically.

export type GameStatus =
  | 'intro'
  | 'playing'
  | 'paused'
  | 'dying'
  | 'level-complete'
  | 'game-complete'

export interface Vec {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Per-frame input snapshot handed to every game runtime. */
export interface InputState {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
  /** jump / primary ability, held */
  jump: boolean
  /** jump pressed this frame (edge) */
  jumpPressed: boolean
  /** secondary ability / interact, held */
  action: boolean
  /** secondary ability pressed this frame (edge) */
  actionPressed: boolean
  pointer: {
    x: number
    y: number
    down: boolean
    pressed: boolean
  }
}

export function emptyInput(): InputState {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    jumpPressed: false,
    action: false,
    actionPressed: false,
    pointer: { x: 0, y: 0, down: false, pressed: false },
  }
}

export type SoundName =
  | 'jump'
  | 'land'
  | 'death'
  | 'win'
  | 'click'
  | 'blip'
  | 'flip'
  | 'hit'
  | 'checkpoint'
  | 'unlock'

export interface GameHooks {
  /** Player failed the level. Optional short in-world reason. */
  death(message?: string): void
  /** Player reached the exit / satisfied the objective. */
  complete(): void
  /** Play a sound effect through the shared audio engine. */
  sound(name: SoundName): void
  /** Trigger screen shake (0..1 typical). */
  shake(amount: number): void
  /** True when the user prefers reduced motion (skip heavy effects). */
  reducedMotion: boolean
}

export type ThemeName =
  | 'default'
  | 'space'
  | 'neon'
  | 'terminal'
  | 'ghost'
  | 'mirror'
  | 'void'

export interface GameTheme {
  /** page background behind the canvas */
  background: string
  /** in-world background */
  bg: string
  /** panels / mid tones */
  panel: string
  /** solid platforms */
  solid: string
  solidTop: string
  /** dangerous surfaces */
  hazard: string
  /** accent / highlight */
  accent: string
  accent2: string
  /** player body */
  player: string
  /** exit / goal */
  exit: string
  /** text */
  text: string
}

export interface ControlHint {
  keys: string
  label: string
}

export interface GameModule {
  slug: string
  title: string
  tagline: string
  theme: GameTheme
  controls: ControlHint[]
  instructions: string[]
  /** number of levels */
  levels: number
  /** internal render resolution */
  view: { w: number; h: number }
  create(hooks: GameHooks): GameRuntime
}

export interface GameRuntime {
  /** Prepare a level for play. Called on start, restart and level change. */
  load(level: number): void
  /** Advance simulation. `dt` is seconds, already clamped. */
  update(dt: number, input: InputState): void
  /** Draw the current frame at the module's internal resolution. */
  render(g: CanvasRenderingContext2D, w: number, h: number): void
  /** Optional world-space focus point (player) for death feedback. */
  focus?(): Vec | null
  /** Release timers / resources. Called once when the game unmounts. */
  destroy?(): void
}

export interface LevelStat {
  level: number
  unlocked: boolean
  completed: boolean
  noDeath: boolean
  deaths: number
  bestMs: number | null
}
