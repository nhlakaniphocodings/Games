import type { Rect, Vec } from '@/lib/game/types'

/** What the jump / primary button does while a mapping is active. */
export type JumpMode = 'jump' | 'crouch' | 'none'

/** A control mapping. Missing fields fall back to the level base mapping. */
export interface ControlMode {
  /** Horizontal input is reversed (◀ ▶ swap). */
  rev?: boolean
  /** 'jump' = normal, 'crouch' = duck/slide, 'none' = disabled. */
  jump?: JumpMode
}

/** zone = applies while inside | switch = latches when touched | lock = freezes controls. */
export type ZoneKind = 'zone' | 'switch' | 'lock'

export interface CCZone {
  id?: string
  x: number
  y: number
  w: number
  h: number
  kind: ZoneKind
  /** Mapping applied by the zone (zone/switch). */
  mode?: ControlMode
  /** Seconds of locked controls (lock zones). */
  lockTime?: number
  /** Width of the warning band drawn on the approach side. */
  warnPad?: number
  approach?: 'left' | 'right' | 'both'
  /** Warning band spans the full play height (default) or only the zone height. */
  bandFull?: boolean
  /** Short label shown on the in-world sign + HUD banner. */
  label?: string
}

export interface CCSolid {
  x: number
  y: number
  w: number
  h: number
  id?: string
}

/** Deterministic looping offset, same sinusoidal convention as the engine. */
export interface CCMotion {
  dx?: number
  dy?: number
  period: number
  phase?: number
}

/** Lethal only for the first `on` seconds of each `period` (deterministic). */
export interface CCBlink {
  period: number
  /** seconds the hazard is deadly within each period */
  on: number
  phase?: number
}

/**
 * A hazard rectangle with optional deterministic behaviour. Static hazards are
 * plain rects. Moving hazards sweep on a fixed clock; `blink` hazards are only
 * deadly part of the time; `armAtX` hazards stay retracted until the player's
 * leading edge crosses a trigger line, then warn for `warn` seconds before
 * going live — so traps react to where the player actually is.
 */
export interface CCHazard extends Rect {
  move?: CCMotion
  blink?: CCBlink
  /** Dormant (non-lethal) until the player's right edge passes this x. */
  armAtX?: number
  /** Warning seconds between arming and going lethal (fair reaction window). */
  warn?: number
  /** Short label drawn on the dormant warning marker. */
  label?: string
}

export interface CCLevel {
  name: string
  hint: string
  start: Vec
  exit: Rect
  /** Decoy doors: drawn like an exit but lethal. Fair — they read red on close look. */
  decoys?: Rect[]
  /** Mapping the level starts in. */
  base: ControlMode
  solids: CCSolid[]
  zones: CCZone[]
  hazards: CCHazard[]
}
