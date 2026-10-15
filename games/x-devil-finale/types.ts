import type { Rect, SoundName, Vec } from '@/lib/game/types'

/** Smooth movement for solids and hazards. */
export interface MoveDef {
  dx?: number
  dy?: number
  /** period in seconds */
  period: number
  phase?: number
}

/** A repeating on/off window measured in beats. */
export interface WindowDef {
  /** cycle length in beats */
  period: number
  /** beats the window stays on, from the cycle start */
  on: number
  phase?: number
}

export interface RetractDef {
  /** player centre-x that starts the slide (ignored when onStand) */
  triggerX?: number
  /** start once the player stands on this solid */
  onStand?: boolean
  dx?: number
  dy?: number
  speed?: number
}

export type SolidKind = 'solid' | 'fake' | 'fall' | 'bounce' | 'blink' | 'retract'

export interface SolidDef {
  x: number
  y: number
  w: number
  h: number
  id?: string
  kind?: SolidKind
  /** for kind 'fall': seconds before it drops */
  delay?: number
  window?: WindowDef
  move?: MoveDef
  retract?: RetractDef
  /** vanish permanently once player centre-x passes this */
  vanishAt?: number
  hidden?: boolean
  label?: string
}

export type HazardKind = 'spike' | 'saw' | 'beam'

export interface HazardDef {
  x: number
  y: number
  w: number
  h: number
  id?: string
  kind?: HazardKind
  face?: 'floor' | 'ceiling'
  window?: WindowDef
  move?: MoveDef
  sweep?: MoveDef & { axis: 'x' | 'y'; range: number }
  hidden?: boolean
  deathMsg?: string
}

export type HazardKindAlias = HazardKind

export type DecorKind = 'label' | 'arrow' | 'button'

/** In-world canvas UI. It can lie. It never touches the browser. */
export interface DecorDef {
  kind: DecorKind
  x: number
  y: number
  w?: number
  h?: number
  text?: string
  color?: string
  size?: number
  align?: CanvasTextAlign
  /** arrow heading (screen space) */
  dx?: number
  dy?: number
  len?: number
  box?: boolean
}

export interface ControlZoneDef {
  x: number
  y: number
  w: number
  h: number
  reverse: boolean
  warnPad?: number
  label?: string
}

export interface GravityZoneDef {
  x: number
  y: number
  w: number
  h: number
  /** target gravity direction: 1 down, -1 up */
  dir: 1 | -1
}

export interface TwinDef {
  start2: Vec
  exit2: Rect
  axis: number
}

export interface DecoyDef {
  id: string
  x: number
  y: number
  w: number
  h: number
  hidden?: boolean
}

export interface TriggerDef {
  x: number
  y: number
  w: number
  h: number
  once?: boolean
  show?: string[]
  hide?: string[]
  kill?: boolean
  shake?: number
  sound?: SoundName
  setReverse?: boolean
  /** reveal a hidden decoy door */
  armDecoy?: string
  /** move the exit the first time this fires */
  moveExit?: { dx: number; dy: number }
  /** set a persistent mirror state */
  message?: string
}

export interface LevelDef {
  name: string
  hint: string
  start: Vec
  exit: Rect
  /** level 10 only: what the arena becomes after the betrayal */
  phase2?: LevelDef

  bpm?: number
  showBeat?: boolean
  memorize?: number
  jumpMode?: 'jump' | 'flip'
  gravityStart?: 1 | -1
  survival?: number
  twin?: TwinDef
  baseReverse?: boolean
  controlZones?: ControlZoneDef[]
  gravityZones?: GravityZoneDef[]
  exitWindow?: WindowDef

  solids: SolidDef[]
  hazards: HazardDef[]
  decoys?: DecoyDef[]
  triggers?: TriggerDef[]
  decor?: DecorDef[]

  /** fake victory stats for level 10's betrayal */
  fakeStats?: { time: string; deaths: string; score: string; quip: string }
}

export interface Message {
  text: string
  t: number
}
