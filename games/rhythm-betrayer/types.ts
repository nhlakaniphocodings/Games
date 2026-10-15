import type { Rect, Vec } from '@/lib/game/types'

/** A repeating beat window. `on` beats active out of every `period` beats. */
export interface RBWindow {
  /** cycle length in beats */
  period: number
  /** number of beats the window stays on, measured from the cycle start */
  on: number
  /** phase offset in beats */
  phase?: number
}

/** Beat-synced movement for solids and hazards. */
export interface RBMove {
  dx?: number
  dy?: number
  /** period in beats */
  period: number
  /** phase in beats */
  phase?: number
  /** sine = smooth sweep; pulse = snaps on the beat */
  mode?: 'sine' | 'pulse'
}

/** Ping-pong sweep across a distance, driven by the beat clock. */
export interface RBSweep {
  axis: 'x' | 'y'
  range: number
  period: number
  phase?: number
}

/**
 * A boundary-triggered trap. It arms the instant the player's centre crosses
 * `at`, waits `delay` beats, then turns lethal for `on` beats. This is what
 * makes the rhythm "betray" the player: the trap's schedule is driven by where
 * the player went, not only by the shared beat.
 */
export interface RBTrip {
  /** player centre-x that arms the trap */
  at: number
  /** beats to wait after arming before it fires */
  delay: number
  /** beats the trap stays lethal once it fires */
  on: number
  /** repeat period in beats after the first firing (omitted = one-shot) */
  cycle?: number
}

export interface RBSolid {
  x: number
  y: number
  w: number
  h: number
  id?: string
  /** a rhythmic platform: collides only inside this window */
  window?: RBWindow
  move?: RBMove
  /** a lying platform: rendered inverted, carries a jagged tell */
  fake?: boolean
  /**
   * A landing-reactive platform: once stood on it arms and, after `warn` more
   * beats, drops away permanently. Leave before the count runs out.
   */
  unstable?: { warn: number }
}

export type RBHazardKind = 'spike' | 'saw'

export interface RBHazard {
  x: number
  y: number
  w: number
  h: number
  id?: string
  kind?: RBHazardKind
  /** lethal only inside this window */
  window?: RBWindow
  move?: RBMove
  sweep?: RBSweep
  /** boundary-triggered: arms on the player's position, then fires on the beat */
  trip?: RBTrip
  /** off-beat / inverted pattern marked as a liar */
  fake?: boolean
  deathMsg?: string
}

export interface RBTempo {
  /** beat position at which the new tempo takes over */
  at: number
  bpm: number
}

export interface RBLevel {
  name: string
  hint: string
  start: Vec
  exit: Rect
  /** starting tempo */
  bpm: number
  /** scheduled tempo changes (announced before they land) */
  tempo?: RBTempo[]
  solids: RBSolid[]
  hazards: RBHazard[]
  /** exit is only enterable inside this window */
  exitWindow?: RBWindow
  /** a fake door: looks like a shortcut, kills on contact */
  decoy?: Rect
}
