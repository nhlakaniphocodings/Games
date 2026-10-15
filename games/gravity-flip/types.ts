import type { Rect, Vec } from '@/lib/game/types'

/** Gravity direction: 1 = down (walk on floors), -1 = up (walk on ceilings). */
export type Dir = 1 | -1

export type SolidKind = 'solid' | 'fake'

export interface GFSolid {
  x: number
  y: number
  w: number
  h: number
  id?: string
  /** 'fake' looks like a solid ceiling but is passable and lethal (a grinder). */
  kind?: SolidKind
  /** Becomes lethal spikes once the player has flipped this many times. */
  spikeAfterFlips?: number
  /** Slides toward a y position depending on the player's gravity direction. */
  gravitySlide?: { yDown: number; yUp: number; speed?: number }
  /** Looping autonomous movement. */
  move?: { dx: number; dy: number; period: number; phase?: number }
}

export type HazardKind = 'spike' | 'barrier'

export interface GFHazard {
  x: number
  y: number
  w: number
  h: number
  id?: string
  kind?: HazardKind
  /** Which surface a spike field grows from (affects drawing + hitbox inset). */
  face?: 'floor' | 'ceiling'
  /** A barrier that slides toward a y position based on the player's gravity. */
  track?: { yDown: number; yUp: number; speed?: number }
  /** Looping autonomous movement (used for timed/oscillating hazards). */
  move?: { dx: number; dy: number; period: number; phase?: number }
  hidden?: boolean
  /** Only becomes lethal after the player has flipped this many times. */
  activeAfterFlips?: number
}

export interface GFZone {
  x: number
  y: number
  w: number
  h: number
  /** Gravity direction this region forces on entry. */
  dir: Dir
  once?: boolean
}

export interface GFSwitch {
  x: number
  y: number
  w: number
  h: number
  /** Surface the pad is mounted on; affects drawing + trigger inset. */
  face?: 'floor' | 'ceiling'
}

export interface GFExit {
  x: number
  y: number
  w: number
  h: number
  /** Required gravity direction when entering (the door is mounted accordingly). */
  needs: Dir
}

export interface GFLevel {
  name: string
  hint: string
  start: Vec
  startDir?: Dir
  exit: GFExit
  solids: GFSolid[]
  hazards: GFHazard[]
  zones?: GFZone[]
  switches?: GFSwitch[]
  /** Fake doors that look like the goal but kill on contact. */
  decoys?: Rect[]
}

export const FLOOR_TOP = 480
export const PLAYER_H = 32
export const START_Y = FLOOR_TOP - PLAYER_H

export type { Rect }
