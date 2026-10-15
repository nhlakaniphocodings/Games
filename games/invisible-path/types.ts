import type { Rect, Vec } from '@/lib/game/types'

/** Safe platforms hold you up. Hazard platforms look similar but kill on touch. */
export type PlatKind = 'safe' | 'hazard'

/** Deterministic looping motion. `curX = x + sin(phase) * dx` (same for y). */
export interface PlatMove {
  dx: number
  dy: number
  period: number
  phase?: number
}

/** Deterministic on/off cycle. Solid for `duty` of each `period`. */
export interface PlatBlink {
  period: number
  phase?: number
  /** fraction of the period the platform is solid, 0..1 (default 0.6) */
  duty?: number
}

export interface PlatDef {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** defaults to 'safe' */
  kind?: PlatKind
  /** looping deterministic motion */
  move?: PlatMove
  /** deterministic on/off cycle */
  blink?: PlatBlink
  /** starts invisible/non-solid until a switch reveals it */
  hidden?: boolean
  /**
   * Stays faintly visible during play (moving / blinking platforms). Motion and
   * rhythm are unfair to memorise blind, so these keep a low-alpha hint.
   */
  ghost?: boolean
  /** acts as a respawn anchor once stood on */
  checkpoint?: boolean
  /** a chunky ground segment (drawn full-bleed into the world) */
  floor?: boolean
}

export interface SwitchDef {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** platform ids that become visible + solid */
  reveal?: string[]
  /** platform ids that are pulled away */
  retire?: string[]
  /** short caption drawn next to the switch during preview */
  hint?: string
}

export interface LevelDef {
  name: string
  hint: string
  start: Vec
  exit: Rect
  /** seconds the initial full-visibility preview lasts */
  preview: number
  /** number of recall flashes available on this level */
  flashes: number
  platforms: PlatDef[]
  switches?: SwitchDef[]
  /** ordered waypoints for the dotted route drawn during preview */
  route: Vec[]
}
