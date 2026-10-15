import type { Rect, Vec } from '@/lib/game/types'

/** How a platform changes shape / availability over the level. */
export type PlatformMode = 'static' | 'retract' | 'shrink' | 'blink' | 'fade' | 'gate'

/** Deterministic morph sequence for retract / shrink / gate platforms. */
export interface SWMorph {
  /** seconds after load to arm automatically; omit to wait for a trigger */
  auto?: number
  /** arm the moment the player stands on this platform */
  armOnStep?: boolean
  /** telegraph seconds before motion begins (warning outline + bar) */
  warn: number
  /** seconds the motion takes */
  time: number
  /** axis the motion runs along */
  axis?: 'x' | 'y'
  /** signed travel distance for retract / gate */
  travel?: number
  /** final width for a shrink */
  toW?: number
  /** final height for a shrink */
  toH?: number
  /** anchor for a shrink */
  anchor?: 'left' | 'right' | 'center'
  /** loop the motion (out, hold, back, hold) */
  cycle?: boolean
  /** seconds held at the end of a cycle leg */
  hold?: number
}

export interface SWPlatform {
  x: number
  y: number
  w: number
  h: number
  id?: string
  mode?: PlatformMode
  tag?: 'metal' | 'grate' | 'panic'
  /** starts inactive until a trigger reveals it */
  hidden?: boolean
  /** continuous oscillation of the base position */
  move?: { dx: number; dy: number; period: number; phase?: number }
  /** temporary platform window */
  blink?: { on: number; off: number; phase?: number }
  /** retract / shrink / gate sequence */
  morph?: SWMorph
}

export type HazardKind = 'spike' | 'saw' | 'crusher'

export interface SWHazard {
  x: number
  y: number
  w: number
  h: number
  kind?: HazardKind
  id?: string
  hidden?: boolean
  move?: { dx: number; dy: number; period: number; phase?: number }
}

export interface SWTrigger {
  x: number
  y: number
  w: number
  h: number
  once?: boolean
  /** arm these platform morph sequences */
  arm?: string[]
  /** reveal these entities (platforms / hazards) */
  show?: string[]
  /** suppress these entities */
  hide?: string[]
  /** reveal the real exit */
  revealExit?: boolean
  shake?: number
  sound?: 'blip' | 'hit' | 'unlock' | 'checkpoint' | 'click'
  /** the zone itself is lethal */
  kill?: boolean
}

/** Global, level-wide shrinking pressure. */
export interface SWPressure {
  kind: 'walls' | 'rise'
  /** seconds before it begins */
  delay: number
  /** walls: seconds to close */
  time?: number
  /** walls: which edges advance */
  edges?: Array<'left' | 'right' | 'top' | 'bottom'>
  /** walls: how far each edge advances (final boundary in px) */
  reach?: { left?: number; right?: number; top?: number; bottom?: number }
  /** rise: px per second the surface climbs */
  speed?: number
  /** rise: starting surface y */
  from?: number
  /** rise: surface never climbs above this y */
  cap?: number
}

export interface SWLevel {
  name: string
  hint: string
  start: Vec
  exit: Rect
  /** exit starts hidden until a trigger reveals it */
  exitHidden?: boolean
  platforms: SWPlatform[]
  hazards?: SWHazard[]
  triggers?: SWTrigger[]
  /** fake doors — touching one kills */
  decoys?: Rect[]
  pressure?: SWPressure
}
