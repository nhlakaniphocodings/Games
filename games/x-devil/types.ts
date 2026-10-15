import type { Rect, Vec } from '@/lib/game/types'

export type SolidKind = 'solid' | 'fall' | 'fake' | 'vanish' | 'bouncy'

export interface XDSolid {
  x: number
  y: number
  w: number
  h: number
  kind?: SolidKind
  id?: string
  /** start hidden (revealed by a trigger) */
  hidden?: boolean
  /** seconds before a 'fall' platform gives way once stood on */
  delay?: number
  /** looping movement */
  move?: { dx: number; dy: number; period: number; phase?: number }
}

export type HazardKind = 'spike' | 'saw'

export interface XDHazard {
  x: number
  y: number
  w: number
  h: number
  kind?: HazardKind
  id?: string
  hidden?: boolean
  move?: { dx: number; dy: number; period: number; phase?: number }
  /** homes toward the player's x, clamped to [min, max] (the chasing hazard) */
  chase?: { speed: number; min: number; max: number }
}

export interface XDTrigger {
  x: number
  y: number
  w: number
  h: number
  once?: boolean
  show?: string[]
  hide?: string[]
  collapse?: string[]
  /** move the exit by this delta the first time the trigger fires */
  moveExit?: { dx: number; dy: number }
  /** the trigger itself is an invisible hazard */
  kill?: boolean
  /** reveal a fake exit that kills on contact */
  armDecoy?: string
  shake?: number
}

export interface XDSpring {
  x: number
  y: number
  w: number
  h: number
  power: number
}

export interface XDDecoy {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** hidden decoys are revealed by triggers and only then become lethal */
  hidden?: boolean
  /** starts visible; touching it kills unless disarmed */
  armed?: boolean
}

export interface XDLevel {
  name: string
  hint: string
  start: Vec
  exit: Rect
  solids: XDSolid[]
  hazards: XDHazard[]
  triggers?: XDTrigger[]
  springs?: XDSpring[]
  decoys?: XDDecoy[]
}
