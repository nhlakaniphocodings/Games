import type { Rect, SoundName, Vec } from '@/lib/game/types'

/** Platform surface kinds. `fake` is drawn but has no collision. */
export type SolidKind = 'solid' | 'fake' | 'vanish' | 'bouncy'

export interface LSolid {
  x: number
  y: number
  w: number
  h: number
  kind?: SolidKind
  id?: string
  hidden?: boolean
  /** looping motion */
  move?: { dx: number; dy: number; period: number; phase?: number }
  /** click/tap toggles between the home rect and this second rect */
  click?: { x2: number; y2: number }
  label?: string
}

export type HazardKind = 'spike' | 'saw'

export interface LHazard {
  x: number
  y: number
  w: number
  h: number
  kind?: HazardKind
  id?: string
  hidden?: boolean
  move?: { dx: number; dy: number; period: number; phase?: number }
}

export interface LDoor {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** real doors complete the level; fake doors kill on touch */
  real: boolean
  hidden?: boolean
}

export interface LLabel {
  x: number
  y: number
  text: string
  color?: string
  size?: number
  align?: CanvasTextAlign
  /** draw an in-world caption panel behind the text */
  box?: boolean
  w?: number
}

export interface LArrow {
  x: number
  y: number
  dx: number
  dy: number
  len?: number
  color?: string
  label?: string
}

/** A world change produced by a trigger or an in-world button. */
export interface Effect {
  show?: string[]
  hide?: string[]
  toggle?: string[]
  moveDoor?: { id: string; dx: number; dy: number }
  swapDoors?: [string, string]
  moveSolid?: { id: string; x?: number; y?: number; dx?: number; dy?: number }
  /** value for the minimap accuracy flag */
  setMap?: boolean
  shake?: number
  sound?: SoundName
  message?: string
  /** pressing this kills the player (trap button / trigger) */
  death?: boolean
  /** this is the actual exit */
  win?: boolean
  /** reveal an invisible door and make it lethal */
  armDoor?: string
}

export interface LTrigger {
  x: number
  y: number
  w: number
  h: number
  once?: boolean
  effect: Effect
}

export interface LButton {
  id: string
  x: number
  y: number
  w: number
  h: number
  label: string
  effect: Effect
  once?: boolean
  /** slide horizontally away from an approaching player, clamped to [minX, maxX] */
  flee?: { radius: number; minX: number; maxX: number; speed?: number }
  color?: string
}

export interface Minimap {
  x: number
  y: number
  w: number
  h: number
  title?: string
}

export interface LLevel {
  name: string
  /** in-world caption — frequently a lie */
  hint: string
  start: Vec
  solids: LSolid[]
  hazards: LHazard[]
  doors: LDoor[]
  triggers?: LTrigger[]
  buttons?: LButton[]
  labels?: LLabel[]
  arrows?: LArrow[]
  minimap?: Minimap
  /** false => the minimap is already lying */
  mapAccurate?: boolean
}

export type { Rect }
