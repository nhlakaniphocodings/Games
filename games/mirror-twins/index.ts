import { clamp, rectsOverlap } from '@/lib/game/math'
import { ParticleSystem } from '@/lib/game/particles'
import { PlatformerPlayer, type Solid } from '@/lib/game/platformer'
import { drawGrid, fillRoundRect, label, strokeRoundRect } from '@/lib/game/draw'
import type { GameHooks, GameModule, GameRuntime, GameTheme, InputState, Rect, Vec } from '@/lib/game/types'

/*
 * MIRROR TWINS — two characters, one set of controls.
 *
 * The 960x540 view is split into two independent 480x540 worlds.
 *  - LEFT half  = Twin A "DIRECT"   (input as pressed)
 *  - RIGHT half = Twin B "MIRRORED" (left/right swapped for it)
 * Jump always affects BOTH twins at once.
 *
 * Level geometry for Twin B is generated as the horizontal mirror of Twin A,
 * so a single, human-timed input stream can solve both halves. On top of that
 * mirror, individual hazards, ledges and side-specific secrets are added by
 * hand — one twin can be safe where the other is not, but the safe route
 * always exists and is telegraphed by shape, colour and motion.
 *
 * A twin that reaches its door is slotted in safely; both doors filled wins.
 * If either twin dies, the whole level fails.
 */

const VIEW = { w: 960, h: 540 }
const HALF = 480
const GROUND = 480
const PLAYER_W = 24
const GRAVITY = 2100
/** Below this y a twin has fallen out of its world. */
const FALL_DEATH = 560

const theme: GameTheme = {
  background: '#060510',
  bg: '#0b0918',
  panel: '#171233',
  solid: '#262052',
  solidTop: '#453a86',
  hazard: '#ff4d6d',
  accent: '#b06bff',
  accent2: '#42e6d0',
  player: '#eef0ff',
  exit: '#5cffb0',
  text: '#ffffff',
}

/** Distinct but related twin bodies (also drawn as different shapes). */
const A_BODY = '#cdaaff'
const B_BODY = '#8ff0e2'

type SolidKind = 'solid' | 'fall' | 'fake' | 'move'

interface SolidDef {
  x: number
  y: number
  w: number
  h: number
  kind?: SolidKind
  /** seconds a 'fall' ledge waits once stood on */
  delay?: number
  move?: { dx: number; dy: number; period: number; phase?: number }
}

interface PlateDef {
  id: string
  x: number
  y: number
  w: number
  h: number
}

interface GateDef {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** opens (and latches) once every listed plate is pressed at the same time */
  by: string[]
}

interface SideDef {
  start: Vec
  exit: Rect
  solids: SolidDef[]
  spikes: Rect[]
  plates?: PlateDef[]
  gates?: GateDef[]
}

interface LevelDef {
  name: string
  hint: string
  a: SideDef
  b: SideDef
}

const S = (x: number, y: number, w: number, h: number, extra: Partial<SolidDef> = {}): SolidDef => ({ x, y, w, h, ...extra })
const P = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })
const PL = (id: string, x: number, y: number, w: number, h: number): PlateDef => ({ id, x, y, w, h })
const GT = (id: string, x: number, y: number, w: number, h: number, by: string[]): GateDef => ({ id, x, y, w, h, by })
const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })

/** Standing height on the y = 480 ground line. */
const START_Y = GROUND - 32

function mirrorSolid(s: SolidDef): SolidDef {
  const out: SolidDef = { ...s, x: HALF - s.x - s.w }
  // a reflected oscillator runs in anti-phase, so the mirror twins stay mirrored
  if (s.move) out.move = { ...s.move, phase: (s.move.phase ?? 0) + 0.5 }
  return out
}

function mirrorRect(r: Rect): Rect {
  return { x: HALF - r.x - r.w, y: r.y, w: r.w, h: r.h }
}

/** Authored level recipe. Twin B defaults to the exact mirror of Twin A. */
interface Spec {
  name: string
  hint: string
  /** Twin A ground segments as [x, width] along y = 480. */
  ground: Array<[number, number]>
  /** Twin A raised ledges — mirrored for Twin B unless platformsB is given. */
  platforms?: SolidDef[]
  groundB?: Array<[number, number]>
  platformsB?: SolidDef[]
  spikesA?: Rect[]
  spikesB?: Rect[]
  platesA?: PlateDef[]
  platesB?: PlateDef[]
  gatesA?: GateDef[]
  gatesB?: GateDef[]
  startA?: Vec
  startB?: Vec
  exitA: Rect
  exitB?: Rect
}

function build(spec: Spec): LevelDef {
  const startA = spec.startA ?? { x: 30, y: START_Y }
  const groundA = spec.ground.map(([x, w]) => S(x, GROUND, w, 60))
  const groundBSrc = spec.groundB ?? spec.ground.map(([x, w]) => [HALF - x - w, w] as [number, number])
  const groundB = groundBSrc.map(([x, w]) => S(x, GROUND, w, 60))
  const platA = spec.platforms ?? []
  const platB = spec.platformsB ?? platA.map(mirrorSolid)
  return {
    name: spec.name,
    hint: spec.hint,
    a: {
      start: startA,
      exit: spec.exitA,
      solids: [...groundA, ...platA],
      spikes: spec.spikesA ?? [],
      plates: spec.platesA,
      gates: spec.gatesA,
    },
    b: {
      start: spec.startB ?? { x: HALF - startA.x - PLAYER_W, y: startA.y },
      exit: spec.exitB ?? mirrorRect(spec.exitA),
      solids: [...groundB, ...platB],
      spikes: spec.spikesB ?? [],
      plates: spec.platesB,
      gates: spec.gatesB,
    },
  }
}

/**
 * Ten hand-built mirror levels. Twin A travels left -> right and Twin B right
 * -> left, so "hold right" advances both. Difficulty grows from one shared hop
 * to moving ferries, crumbling ledges, ghost platforms, cross-side drains and
 * layered deception.
 */
const LEVELS: LevelDef[] = [
  // 1 — one gap per twin, mirrored, cleared by a single shared jump.
  build({
    name: 'First Reflection',
    hint: 'One set of keys. Two bodies. Press right — they split apart.',
    ground: [[0, 300], [360, 480]],
    spikesA: [P(300, 500, 60, 40)],
    spikesB: [P(120, 500, 60, 40)],
    exitA: R(432, 404, 36, 76),
  }),
  // 2 — the twins climb the same staircase, but each has its own spike strip.
  build({
    name: 'Offset Steps',
    hint: 'Mirrored stairs. Shared jump. One spike patch each.',
    ground: [[0, HALF]],
    platforms: [S(210, 414, 120, 20), S(380, 346, 100, 20)],
    spikesA: [P(120, 448, 50, 32)],
    spikesB: [P(60, 448, 40, 32)],
    exitA: R(424, 270, 36, 76),
  }),
  // 3 — hazards live in a single world only; jumping is still shared.
  build({
    name: 'Cold Shoulder',
    hint: 'Spikes live in one world only. Jumping is still shared.',
    ground: [[0, HALF]],
    spikesA: [P(210, 448, 100, 32)],
    spikesB: [P(40, 448, 80, 32)],
    exitA: R(432, 404, 36, 76),
  }),
  // 4 — asymmetric floors: A climbs a high route, B walks the low road.
  build({
    name: 'High Road, Low Road',
    hint: 'A climbs the ledges. B walks low. Time every jump for both.',
    ground: [[0, HALF]],
    platforms: [S(200, 410, 120, 20), S(360, 330, 120, 20)],
    platformsB: [],
    groundB: [[0, HALF]],
    spikesB: [P(300, 448, 60, 32)],
    exitA: R(424, 254, 36, 76),
    exitB: R(30, 404, 36, 76),
  }),
  // 5 — A rides an oscillating ferry over spikes; B has solid ground and a trap.
  build({
    name: 'The Ferry',
    hint: 'A rides the ferry across the spikes. B keeps to the solid floor.',
    ground: [[0, 130], [360, 480]],
    platforms: [S(170, 440, 80, 18, { kind: 'move', move: { dx: 40, dy: 0, period: 2.4 } })],
    groundB: [[0, HALF]],
    platformsB: [],
    spikesA: [P(130, 500, 230, 40)],
    spikesB: [P(400, 448, 40, 32)],
    exitA: R(432, 404, 36, 76),
  }),
  // 6 — crumbling ledges for A; B is grounded but must still read the timing.
  build({
    name: 'Give Way',
    hint: 'The ledges crumble under a step. Keep moving, both of you.',
    ground: [[0, 140], [400, 480]],
    platforms: [
      S(200, 440, 90, 18, { kind: 'fall', delay: 0.5 }),
      S(320, 400, 80, 18, { kind: 'fall', delay: 0.5 }),
    ],
    groundB: [[0, HALF]],
    platformsB: [],
    spikesA: [P(140, 500, 260, 40)],
    spikesB: [P(360, 448, 60, 32)],
    exitA: R(436, 404, 36, 76),
  }),
  // 7 — dashed ghost ledges look like help and are not.
  build({
    name: 'Vanishing Act',
    hint: 'Dashed ledges are ghosts — you fall straight through them.',
    ground: [[0, 170], [390, 480]],
    platforms: [S(250, 420, 90, 20), S(390, 340, 90, 20), S(170, 350, 80, 18, { kind: 'fake' })],
    spikesA: [P(170, 448, 220, 32)],
    spikesB: [P(90, 448, 220, 32)],
    exitA: R(424, 264, 36, 76),
  }),
  // 8 — cross-side drains: both must be held at the same moment.
  build({
    name: 'Two Hands',
    hint: 'Stand both twins on their drains at once to raise the gates.',
    ground: [[0, 180], [260, 480]],
    spikesA: [P(180, 500, 80, 40)],
    spikesB: [P(220, 500, 80, 40)],
    platesA: [PL('pa', 346, 464, 50, 16)],
    platesB: [PL('pb', 84, 464, 50, 16)],
    gatesA: [GT('ga', 400, 320, 22, 160, ['pa', 'pb'])],
    gatesB: [GT('gb', 58, 320, 22, 160, ['pa', 'pb'])],
    exitA: R(432, 404, 36, 76),
  }),
  // 9 — mirrored movement plus a liar's ledge and one split hazard each.
  build({
    name: 'Broken Mirror',
    hint: "Mirrored input and a liar's ledge. Read the shape before you leap.",
    ground: [[0, 160], [280, 480]],
    platforms: [S(200, 420, 80, 20), S(360, 350, 110, 20), S(160, 330, 80, 18, { kind: 'fake' })],
    spikesA: [P(160, 500, 120, 40)],
    spikesB: [P(200, 500, 120, 40), P(330, 448, 40, 32)],
    exitA: R(424, 274, 36, 76),
  }),
  // 10 — everything, with two drains, two gates and one fate.
  build({
    name: "Mirror's Edge",
    hint: 'Ferry, crumbling, ghosts, drains and gates. Two doors, one fate.',
    ground: [[0, 130], [300, 480]],
    platforms: [S(180, 440, 80, 18, { kind: 'move', move: { dx: 40, dy: 0, period: 2.2 } }), S(180, 360, 80, 18, { kind: 'fake' })],
    spikesA: [P(130, 500, 170, 40)],
    spikesB: [P(180, 500, 170, 40)],
    platesA: [PL('pa', 344, 464, 56, 16)],
    platesB: [PL('pb', 80, 464, 56, 16)],
    gatesA: [GT('ga', 420, 320, 22, 160, ['pa', 'pb'])],
    gatesB: [GT('gb', 38, 320, 22, 160, ['pa', 'pb'])],
    exitA: R(448, 404, 32, 76),
  }),
]

interface RSolid {
  def: SolidDef
  curX: number
  curY: number
  prevX: number
  prevY: number
  fallTimer: number
  falling: boolean
  vy: number
}

interface RPlate {
  def: PlateDef
  pressed: boolean
}

interface RGate {
  def: GateDef
  open: boolean
}

interface SideRuntime {
  def: SideDef
  player: PlatformerPlayer
  solids: RSolid[]
  plates: RPlate[]
  gates: RGate[]
  groundIdx: number
  locked: boolean
}

function invertX(input: InputState): InputState {
  return { ...input, left: input.right, right: input.left }
}

function playerRect(p: PlatformerPlayer): Rect {
  return { x: p.x, y: p.y, w: p.w, h: p.h }
}

class MirrorTwinsRuntime implements GameRuntime {
  private hooks: GameHooks
  private particles = new ParticleSystem()
  private index = 1
  private level!: LevelDef
  private sides!: [SideRuntime, SideRuntime]
  private plateState: Record<string, boolean> = {}
  private time = 0
  private over = false
  private rawDir = 0
  private jumpHeld = false
  private lastFocus: Vec = { x: 240, y: 264 }

  constructor(hooks: GameHooks) {
    this.hooks = hooks
  }

  load(level: number) {
    const def = LEVELS[clamp(level - 1, 0, LEVELS.length - 1)]
    this.index = clamp(level, 1, LEVELS.length)
    this.level = def
    this.time = 0
    this.over = false
    this.rawDir = 0
    this.jumpHeld = false
    this.plateState = {}
    this.particles.clear()
    this.sides = [this.makeSide(def.a), this.makeSide(def.b)]
    this.lastFocus = { x: this.sides[0].player.centerX, y: this.sides[0].player.centerY }
  }

  private makeSide(def: SideDef): SideRuntime {
    const player = new PlatformerPlayer()
    player.reset(def.start.x, def.start.y)
    return {
      def,
      player,
      solids: def.solids.map((s) => ({
        def: s,
        curX: s.x,
        curY: s.y,
        prevX: s.x,
        prevY: s.y,
        fallTimer: -1,
        falling: false,
        vy: 0,
      })),
      plates: (def.plates ?? []).map((p) => ({ def: p, pressed: false })),
      gates: (def.gates ?? []).map((g) => ({ def: g, open: false })),
      groundIdx: -1,
      locked: false,
    }
  }

  update(dt: number, input: InputState) {
    if (this.over) return
    this.time += dt
    this.rawDir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    this.jumpHeld = input.jump

    this.stepSide(this.sides[0], dt, input, 0)
    if (this.over) return
    this.stepSide(this.sides[1], dt, invertX(input), HALF)
    if (this.over) return

    this.updatePlatesAndGates()
    this.updateExits()
    this.particles.update(dt)
  }

  private stepSide(side: SideRuntime, dt: number, input: InputState, offsetX: number) {
    const p = side.player
    if (side.locked) return

    // --- advance moving / falling ledges -------------------------------
    for (const rs of side.solids) {
      rs.prevX = rs.curX
      rs.prevY = rs.curY
      const mv = rs.def.move
      if (mv) {
        const phase = (this.time / mv.period + (mv.phase ?? 0)) * Math.PI * 2
        rs.curX = rs.def.x + Math.sin(phase) * mv.dx
        rs.curY = rs.def.y + Math.sin(phase) * mv.dy
      }
      if (rs.falling) {
        rs.vy = Math.min(rs.vy + GRAVITY * dt, 1500)
        rs.curY += rs.vy * dt
      }
    }

    // --- carry a standing twin with its ledge --------------------------
    const under = side.groundIdx >= 0 ? side.solids[side.groundIdx] : null
    if (under && p.onGround) {
      p.x += under.curX - under.prevX
      p.y += under.curY - under.prevY
    }

    // --- colliders ------------------------------------------------------
    const colliders: Solid[] = []
    for (let i = 0; i < side.solids.length; i++) {
      const rs = side.solids[i]
      const fake = rs.def.kind === 'fake'
      colliders.push({
        x: rs.curX,
        y: rs.curY,
        w: rs.def.w,
        h: rs.def.h,
        active: !fake && rs.curY < 620,
        tag: `s${i}`,
      })
    }
    for (const gate of side.gates) {
      if (gate.open) continue
      colliders.push({ x: gate.def.x, y: gate.def.y, w: gate.def.w, h: gate.def.h, active: true, tag: 'gate' })
    }
    // world walls keep each twin inside its own 480-wide half
    colliders.push({ x: -20, y: 0, w: 20, h: VIEW.h, active: true, tag: 'wall' })
    colliders.push({ x: HALF, y: 0, w: 20, h: VIEW.h, active: true, tag: 'wall' })

    const wasGround = p.onGround
    const res = p.step(dt, input, colliders)

    side.groundIdx = -1
    const tag = res.ground?.tag
    if (tag && tag[0] === 's') {
      const idx = Number(tag.slice(1))
      if (!Number.isNaN(idx)) side.groundIdx = idx
    }

    if (!wasGround && p.onGround) this.hooks.sound('land')
    if (input.jumpPressed && wasGround) this.hooks.sound('jump')

    // --- crumbling ledges ----------------------------------------------
    const g = side.groundIdx >= 0 ? side.solids[side.groundIdx] : null
    if (g && g.def.kind === 'fall') {
      if (g.fallTimer < 0) g.fallTimer = 0
      if (!g.falling) {
        g.fallTimer += dt
        if (g.fallTimer >= (g.def.delay ?? 0.45)) {
          g.falling = true
          this.hooks.sound('hit')
          this.pop(offsetX + g.curX + g.def.w / 2, g.curY + g.def.h, 10, 130)
        }
      }
    }

    // --- hazards --------------------------------------------------------
    const pr = playerRect(p)
    for (const sp of side.def.spikes) {
      if (rectsOverlap(pr, sp)) {
        this.die(offsetX + p.centerX, p.centerY, 'A spike found a twin.')
        return
      }
    }
    if (p.y > FALL_DEATH) {
      this.die(offsetX + p.centerX, p.centerY, 'One twin fell out of the world.')
      return
    }
  }

  private updatePlatesAndGates() {
    this.plateState = {}
    for (const side of this.sides) {
      for (const pl of side.plates) {
        const down = side.player.onGround && !side.locked && rectsOverlap(playerRect(side.player), pl.def)
        pl.pressed = down
        this.plateState[pl.def.id] = down
      }
    }
    for (const side of this.sides) {
      for (const gate of side.gates) {
        if (gate.open) continue
        if (gate.def.by.every((id) => this.plateState[id])) {
          gate.open = true
          this.hooks.sound('unlock')
          this.hooks.shake(0.25)
          const ox = side === this.sides[0] ? 0 : HALF
          this.pop(ox + gate.def.x + gate.def.w / 2, gate.def.y + gate.def.h * 0.5, 12, 150, [theme.exit, theme.player])
        }
      }
    }
  }

  private updateExits() {
    let locked = 0
    for (let i = 0; i < 2; i++) {
      const side = this.sides[i]
      if (side.locked) {
        locked++
        continue
      }
      const e = side.def.exit
      if (rectsOverlap(playerRect(side.player), e)) {
        const p = side.player
        p.x = e.x + (e.w - p.w) / 2
        p.y = e.y + e.h - p.h
        p.vx = 0
        p.vy = 0
        side.locked = true
        side.groundIdx = -1
        locked++
        this.hooks.sound('checkpoint')
        const ox = i === 0 ? 0 : HALF
        this.pop(ox + e.x + e.w / 2, e.y + e.h / 2, 14, 170, [theme.exit, theme.player])
      }
    }
    if (locked === 2) {
      this.over = true
      this.hooks.sound('win')
      this.hooks.complete()
    }
  }

  private pop(x: number, y: number, count: number, speed: number, colors?: string[]) {
    if (this.hooks.reducedMotion) return
    this.particles.emit(x, y, count, {
      colors: colors ?? [theme.accent, theme.accent2, theme.player],
      speed,
      life: 0.5,
      gravity: 900,
    })
  }

  private die(x: number, y: number, msg: string) {
    if (this.over) return
    this.over = true
    this.lastFocus = { x, y }
    this.pop(x, y, 18, 220, [theme.hazard, '#ffb0c4', theme.player])
    this.hooks.sound('death')
    this.hooks.shake(0.7)
    this.hooks.death(msg)
  }

  focus(): Vec {
    return this.lastFocus
  }

  // ---------------------------------------------------------------- render

  render(g: CanvasRenderingContext2D, w: number, h: number) {
    g.fillStyle = theme.bg
    g.fillRect(0, 0, w, h)

    // per-half tint so the two worlds read as different places
    g.fillStyle = 'rgba(176,107,255,0.06)'
    g.fillRect(0, 0, HALF, h)
    g.fillStyle = 'rgba(66,230,208,0.06)'
    g.fillRect(HALF, 0, HALF, h)

    drawGrid(g, w, h, 45, 'rgba(255,255,255,0.03)')

    // seam glow between the twins
    const grad = g.createLinearGradient(HALF - 26, 0, HALF + 26, 0)
    grad.addColorStop(0, 'rgba(176,107,255,0)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.22)')
    grad.addColorStop(1, 'rgba(66,230,208,0)')
    g.fillStyle = grad
    g.fillRect(HALF - 26, 0, 52, h)
    g.fillStyle = 'rgba(255,255,255,0.5)'
    g.fillRect(HALF - 1, 0, 2, h)

    this.drawSide(g, this.sides[0], 0)
    this.drawSide(g, this.sides[1], HALF)

    this.particles.render(g)
    this.drawHud(g, w)
  }

  private drawSide(g: CanvasRenderingContext2D, side: SideRuntime, ox: number) {
    const isA = side === this.sides[0]
    const accent = isA ? theme.accent : theme.accent2
    g.save()
    g.translate(ox, 0)

    // pit void beneath the ground line
    g.fillStyle = '#070511'
    g.fillRect(0, GROUND, HALF, VIEW.h - GROUND)

    for (const rs of side.solids) this.drawSolid(g, rs, accent)
    for (const sp of side.def.spikes) this.drawSpikes(g, sp)
    for (const pl of side.plates) this.drawPlate(g, pl)
    for (const gate of side.gates) this.drawGate(g, gate)
    this.drawExit(g, side)
    this.drawTwin(g, side, isA)

    // frame posts
    g.fillStyle = 'rgba(255,255,255,0.07)'
    g.fillRect(-18, 0, 18, VIEW.h)
    g.fillRect(HALF, 0, 18, VIEW.h)

    g.restore()
  }

  private drawSolid(g: CanvasRenderingContext2D, rs: RSolid, accent: string) {
    const x = rs.curX
    const y = rs.curY
    const { w, h } = rs.def
    const kind = rs.def.kind ?? 'solid'

    if (kind === 'fake') {
      g.save()
      g.setLineDash([7, 7])
      fillRoundRect(g, x, y, w, h, 4, 'rgba(255,255,255,0.03)')
      strokeRoundRect(g, x, y, w, h, 4, 'rgba(200,200,255,0.4)', 1.5)
      g.setLineDash([])
      g.restore()
      return
    }

    if (kind === 'move') {
      fillRoundRect(g, x, y, w, h, 5, accent)
      g.fillStyle = 'rgba(255,255,255,0.65)'
      g.fillRect(x + 4, y + 2, w - 8, 2)
      g.fillStyle = 'rgba(0,0,0,0.35)'
      const cx = x + w / 2
      const cy = y + h / 2
      g.beginPath()
      g.moveTo(cx - 10, cy)
      g.lineTo(cx - 2, cy - 5)
      g.lineTo(cx - 2, cy + 5)
      g.closePath()
      g.fill()
      g.beginPath()
      g.moveTo(cx + 10, cy)
      g.lineTo(cx + 2, cy - 5)
      g.lineTo(cx + 2, cy + 5)
      g.closePath()
      g.fill()
      return
    }

    const armed = kind === 'fall' && rs.fallTimer >= 0
    fillRoundRect(g, x, y, w, h, 4, armed ? '#3a1f33' : theme.solid)
    g.fillStyle = armed ? theme.hazard : theme.solidTop
    g.fillRect(x, y, w, 3)
    if (kind === 'fall') {
      g.strokeStyle = 'rgba(255,255,255,0.3)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(x + w / 2 - 8, y + 5)
      g.lineTo(x + w / 2, y + h - 3)
      g.lineTo(x + w / 2 + 8, y + 5)
      g.stroke()
    }
  }

  private drawSpikes(g: CanvasRenderingContext2D, s: Rect) {
    const n = Math.max(1, Math.round(s.w / 18))
    const sw = s.w / n
    g.fillStyle = theme.hazard
    for (let i = 0; i < n; i++) {
      const sx = s.x + i * sw
      g.beginPath()
      g.moveTo(sx, s.y + s.h)
      g.lineTo(sx + sw / 2, s.y)
      g.lineTo(sx + sw, s.y + s.h)
      g.closePath()
      g.fill()
    }
    g.fillStyle = 'rgba(255,77,109,0.35)'
    g.fillRect(s.x, s.y + s.h - 3, s.w, 3)
  }

  private drawPlate(g: CanvasRenderingContext2D, pl: RPlate) {
    const d = pl.def
    const drop = pl.pressed ? 4 : 0
    fillRoundRect(g, d.x, d.y + drop, d.w, d.h - drop, 4, pl.pressed ? theme.exit : theme.panel)
    strokeRoundRect(g, d.x, d.y, d.w, d.h, 4, pl.pressed ? theme.exit : 'rgba(255,255,255,0.4)', 1.5)
    g.fillStyle = pl.pressed ? 'rgba(6,32,21,0.9)' : 'rgba(255,255,255,0.5)'
    g.fillRect(d.x + 6, d.y + drop + 4, d.w - 12, 2)
    g.fillRect(d.x + 6, d.y + drop + 8, d.w - 12, 2)
  }

  private drawGate(g: CanvasRenderingContext2D, gate: RGate) {
    const d = gate.def
    if (gate.open) {
      g.save()
      g.setLineDash([4, 6])
      g.strokeStyle = 'rgba(92,255,176,0.45)'
      g.lineWidth = 2
      g.strokeRect(d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1)
      g.setLineDash([])
      g.restore()
      return
    }
    fillRoundRect(g, d.x, d.y, d.w, d.h, 6, theme.panel)
    strokeRoundRect(g, d.x, d.y, d.w, d.h, 6, theme.hazard, 1.5)
    g.fillStyle = theme.hazard
    for (let yy = d.y + 8; yy < d.y + d.h - 6; yy += 18) g.fillRect(d.x + 4, yy, d.w - 8, 7)
    const cx = d.x + d.w / 2
    const cy = d.y + d.h / 2
    g.strokeStyle = theme.hazard
    g.lineWidth = 3
    g.beginPath()
    g.arc(cx, cy - 6, 5, Math.PI, 0)
    g.stroke()
    g.fillStyle = theme.hazard
    g.fillRect(cx - 7, cy - 5, 14, 12)
    g.fillStyle = theme.panel
    g.fillRect(cx - 1, cy - 1, 2, 5)
  }

  private drawExit(g: CanvasRenderingContext2D, side: SideRuntime) {
    const e = side.def.exit
    if (side.locked) {
      fillRoundRect(g, e.x, e.y, e.w, e.h, 6, 'rgba(92,255,176,0.9)')
      strokeRoundRect(g, e.x, e.y, e.w, e.h, 6, '#d9fff0', 2)
      g.strokeStyle = '#062015'
      g.lineWidth = 4
      g.beginPath()
      g.moveTo(e.x + e.w * 0.28, e.y + e.h * 0.52)
      g.lineTo(e.x + e.w * 0.44, e.y + e.h * 0.68)
      g.lineTo(e.x + e.w * 0.74, e.y + e.h * 0.34)
      g.stroke()
      return
    }
    g.save()
    g.shadowColor = 'rgba(92,255,176,0.45)'
    g.shadowBlur = 18
    fillRoundRect(g, e.x, e.y, e.w, e.h, 6, 'rgba(92,255,176,0.14)')
    g.restore()
    strokeRoundRect(g, e.x, e.y, e.w, e.h, 6, theme.exit, 2)
    g.fillStyle = side === this.sides[0] ? theme.accent : theme.accent2
    g.beginPath()
    g.moveTo(e.x + e.w * 0.34, e.y + e.h * 0.42)
    g.lineTo(e.x + e.w * 0.62, e.y + e.h * 0.5)
    g.lineTo(e.x + e.w * 0.34, e.y + e.h * 0.58)
    g.closePath()
    g.fill()
  }

  private drawTwin(g: CanvasRenderingContext2D, side: SideRuntime, isA: boolean) {
    const p = side.player
    const body = isA ? A_BODY : B_BODY
    const accent = isA ? theme.accent : theme.accent2

    if (side.locked) {
      const e = side.def.exit
      g.save()
      g.translate(e.x + e.w / 2, e.y + e.h)
      g.globalAlpha = 0.92
      if (isA) fillRoundRect(g, -p.w / 2, -p.h, p.w, p.h, 6, body)
      else this.hexBody(g, p.w, p.h, body)
      g.restore()
      return
    }

    const stretch = clamp(p.vy / 1600, -0.25, 0.25)
    g.save()
    g.translate(p.centerX, p.y + p.h)
    g.scale(1 - stretch, 1 + stretch)
    if (isA) {
      fillRoundRect(g, -p.w / 2, -p.h, p.w, p.h, 6, body)
    } else {
      this.hexBody(g, p.w, p.h, body)
    }
    g.fillStyle = '#1b1430'
    const face = p.facing
    g.fillRect(-5 + face * 2, -p.h + 9, 3, 6)
    g.fillRect(3 + face * 2, -p.h + 9, 3, 6)
    g.restore()

    // motion indicators: the direction this twin will take + shared jump
    const dir = isA ? this.rawDir : -this.rawDir
    if (dir !== 0) {
      g.fillStyle = accent
      const ax = p.centerX + dir * (p.w / 2 + 12)
      const ay = p.y - 6
      g.beginPath()
      g.moveTo(ax + dir * 6, ay)
      g.lineTo(ax - dir * 3, ay - 6)
      g.lineTo(ax - dir * 3, ay + 6)
      g.closePath()
      g.fill()
    }
    if (this.jumpHeld) {
      g.fillStyle = 'rgba(255,255,255,0.7)'
      g.beginPath()
      g.moveTo(p.centerX, p.y - 20)
      g.lineTo(p.centerX - 5, p.y - 11)
      g.lineTo(p.centerX + 5, p.y - 11)
      g.closePath()
      g.fill()
    }
  }

  private hexBody(g: CanvasRenderingContext2D, w: number, h: number, color: string) {
    g.fillStyle = color
    g.beginPath()
    g.moveTo(-w / 2, 0)
    g.lineTo(-w / 2, -h + 7)
    g.lineTo(-w / 2 + 7, -h)
    g.lineTo(w / 2 - 7, -h)
    g.lineTo(w / 2, -h + 7)
    g.lineTo(w / 2, 0)
    g.closePath()
    g.fill()
  }

  private drawHud(g: CanvasRenderingContext2D, w: number) {
    label(g, 'TWIN A', 18, 26, { size: 14, color: A_BODY, weight: '800' })
    label(g, 'DIRECT', 18, 44, { size: 11, color: 'rgba(205,170,255,0.75)' })
    label(g, 'TWIN B', w - 18, 26, { size: 14, color: B_BODY, weight: '800', align: 'right' })
    label(g, 'MIRRORED', w - 18, 44, { size: 11, color: 'rgba(143,240,226,0.75)', align: 'right' })

    label(g, `LEVEL ${this.index} · ${this.level.name}`, w / 2, 24, {
      size: 15,
      color: theme.text,
      align: 'center',
      weight: '800',
    })
    label(g, this.level.hint, w / 2, 44, { size: 12, color: 'rgba(255,255,255,0.62)', align: 'center' })

    const mid = w / 2
    const leftOn = this.rawDir < 0
    const rightOn = this.rawDir > 0
    const rowY = VIEW.h - 30
    fillRoundRect(g, mid - 176, rowY - 14, 352, 44, 8, 'rgba(10,8,22,0.72)')
    strokeRoundRect(g, mid - 176, rowY - 14, 352, 44, 8, 'rgba(255,255,255,0.1)', 1)

    label(g, '←', mid - 150, rowY + 2, { size: 16, color: leftOn ? '#ffffff' : 'rgba(255,255,255,0.5)', align: 'center', weight: '800' })
    label(g, 'A ◀    B ▶', mid - 66, rowY + 2, { size: 12, color: leftOn ? '#ffffff' : 'rgba(255,255,255,0.45)', align: 'center' })
    label(g, '→', mid + 150, rowY + 2, { size: 16, color: rightOn ? '#ffffff' : 'rgba(255,255,255,0.5)', align: 'center', weight: '800' })
    label(g, 'A ▶    B ◀', mid + 66, rowY + 2, { size: 12, color: rightOn ? '#ffffff' : 'rgba(255,255,255,0.45)', align: 'center' })
    label(g, 'SPACE / W  ·  BOTH JUMP  ·  EITHER FALLS, BOTH RESET', mid, rowY + 22, {
      size: 10,
      color: 'rgba(255,255,255,0.5)',
      align: 'center',
      weight: '600',
    })
  }
}

export const game: GameModule = {
  slug: 'mirror-twins',
  title: 'Mirror Twins',
  tagline: 'Two bodies, one input. Save one, doom the other.',
  theme,
  controls: [
    { keys: 'A / D or ←/→', label: 'Move both (B is mirrored)' },
    { keys: 'W / ↑ / Space', label: 'Jump (both twins)' },
    { keys: 'R', label: 'Restart' },
    { keys: 'Esc', label: 'Pause' },
  ],
  instructions: [
    'One set of keys drives both twins at once.',
    'Twin A (left) is DIRECT. Twin B (right) is MIRRORED — ← and → are swapped.',
    'Jumping lifts both. A jump that saves one twin can drop the other.',
    'Slot both twins into their doors. If either twin dies, the level resets.',
    'Drains: stand both twins on their plates to raise the gates.',
  ],
  levels: LEVELS.length,
  view: VIEW,
  create: (hooks) => new MirrorTwinsRuntime(hooks),
}

export default game
