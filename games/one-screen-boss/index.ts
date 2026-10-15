/*
 * One Screen Boss — a single-screen 60 second survival gauntlet.
 *
 * You are trapped in one arena with a central boss core. Survive for 60 seconds
 * against telegraphed attack patterns. There is no camera, no gravity and no
 * scrolling: eight-direction free movement, one fixed screen.
 *
 * Every attack is announced with a readable telegraph (>= 0.5s) before it
 * becomes lethal, and all geometry is generated from a deterministic per-stage
 * hash so a pattern is identical on every attempt and therefore learnable.
 */

import { clamp, distance } from '@/lib/game/math'
import { makeRng } from '@/lib/game/math'
import { ParticleSystem } from '@/lib/game/particles'
import { drawGrid, fillRoundRect, label, roundRect, strokeRoundRect } from '@/lib/game/draw'
import type { GameHooks, GameModule, GameRuntime, GameTheme, InputState, Vec } from '@/lib/game/types'
import { stages } from './stages'
import type { AttackDef, StageDef } from './stages'

const VIEW = { w: 960, h: 540 }
const TAU = Math.PI * 2

const ARENA = { x: 24, y: 72, w: 912, h: 440 }
const CX = ARENA.x + ARENA.w / 2 // 480
const CY = ARENA.y + ARENA.h / 2 // 292
const CORE_R = 26
const PLAYER_R = 11
const PLAYER_HIT = 8 // generous (smaller) hitbox than the visual
const PLAYER_SPEED = 276
const BEAM_LEN = 640 // long enough to exit the arena from the core
const STAGE_TIME = 60
const LEAD_IN = 2.5
const FINALE_AT = 55 // the dramatic final five seconds

const theme: GameTheme = {
  background: '#06030b',
  bg: '#0d0716',
  panel: '#190e22',
  solid: '#2a1330',
  solidTop: '#4a2249',
  hazard: '#ff3b5c',
  accent: '#ff2e88',
  accent2: '#8a2bff',
  player: '#f2f7ff',
  exit: '#3ce6a0',
  text: '#ffffff',
}

const HAZARD = '#ff3b5c'
const HAZARD_HOT = '#ffffff'
const WARN = '#ffd23b'
const SAFE = '#3ce6a0'

// ---------------------------------------------------------------------------
// deterministic helpers (no dt-dependent randomness ever touches gameplay)
// ---------------------------------------------------------------------------

function hash01(a: number, b: number, c: number): number {
  let h = (Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263) + Math.imul(c + 1, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296
}

/** Pick `count` slots out of `total`, always leaving at least two safe. */
function pickSlots(total: number, count: number, key: number): number[] {
  const idx: number[] = []
  for (let i = 0; i < total; i++) idx.push(i)
  idx.sort((a, b) => hash01(key, a, 7) - hash01(key, b, 7))
  const want = Math.min(count, Math.max(0, total - 2))
  return idx.slice(0, want)
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = clamp(t, 0, 1)
  const cx = ax + dx * t
  const cy = ay + dy * t
  return Math.hypot(px - cx, py - cy)
}

/** Normalise an angle difference to [0, PI]. */
function angleDelta(a: number, b: number): number {
  let d = (a - b) % TAU
  if (d < 0) d += TAU
  if (d > Math.PI) d = TAU - d
  return d
}

// ---------------------------------------------------------------------------
// runtime hazard types
// ---------------------------------------------------------------------------

interface Orb {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

interface Beam {
  angle: number
  angularVel: number
  width: number
  length: number
  life: number
  maxLife: number
}

interface Ring {
  r: number
  thickness: number
  gapCenter: number
  gapWidth: number
  growth: number
  gapSpin: number
  delay: number
  age: number
  life: number
}

interface Zone {
  x: number
  y: number
  w: number
  h: number
  life: number
  maxLife: number
}

interface PlannedOrb {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}
interface PlannedBeam {
  angle: number
  angularVel: number
  width: number
  duration: number
}
interface PlannedRing {
  startR: number
  thickness: number
  gapCenter: number
  gapWidth: number
  growth: number
  delay: number
  gapSpin: number
}
interface PlannedZone {
  x: number
  y: number
  w: number
  h: number
  duration: number
}

interface FirePlan {
  orbs: PlannedOrb[]
  beams: PlannedBeam[]
  rings: PlannedRing[]
  zones: PlannedZone[]
  gaps: { center: number; width: number; radius: number }[]
  spokes: { angle: number; angularVel: number; sweep: number }[]
  aim?: { x: number; y: number }
}

function emptyPlan(): FirePlan {
  return { orbs: [], beams: [], rings: [], zones: [], gaps: [], spokes: [] }
}

interface AttackInstance {
  def: AttackDef
  phase: 'idle' | 'telegraph'
  timer: number
  volley: number
  plan: FirePlan
}

// ---------------------------------------------------------------------------
// runtime
// ---------------------------------------------------------------------------

class OneScreenBossRuntime implements GameRuntime {
  private hooks: GameHooks
  private particles = new ParticleSystem()
  private rng = makeRng(1)
  private stars: { x: number; y: number; r: number; a: number }[] = []

  private index = 0
  private stage!: StageDef

  private time = 0 // animation clock
  private elapsed = 0 // survival seconds (objective clock)
  private lead = LEAD_IN
  private done = false
  private finale = false
  private flash = 0

  private playerX = CX
  private playerY = ARENA.y + ARENA.h - 70
  private facing = -Math.PI / 2
  private trailAcc = 0

  private attacks: AttackInstance[] = []
  private orbs: Orb[] = []
  private beams: Beam[] = []
  private rings: Ring[] = []
  private zones: Zone[] = []

  private incomingName = ''
  private incomingP = 0
  private lastPattern = ''
  private firedAny = false

  constructor(hooks: GameHooks) {
    this.hooks = hooks
  }

  load(level: number) {
    this.index = clamp(level, 1, stages.length)
    this.stage = stages[this.index - 1]
    this.rng = makeRng(1000 + this.index * 977)
    this.particles.clear()

    this.time = 0
    this.elapsed = 0
    this.lead = LEAD_IN
    this.done = false
    this.finale = false
    this.flash = 0
    this.trailAcc = 0

    this.playerX = CX
    this.playerY = ARENA.y + ARENA.h - 70
    this.facing = -Math.PI / 2

    this.orbs = []
    this.beams = []
    this.rings = []
    this.zones = []

    this.attacks = this.stage.attacks.map((def) => ({
      def,
      phase: 'idle' as const,
      timer: def.first ?? def.interval,
      volley: 0,
      plan: emptyPlan(),
    }))

    this.incomingName = ''
    this.incomingP = 0
    this.lastPattern = this.stage.attacks[0]?.name ?? ''
    this.firedAny = false

    // fixed-seed decorative starfield (cosmetic only)
    this.stars = []
    for (let i = 0; i < 46; i++) {
      this.stars.push({
        x: ARENA.x + this.rng() * ARENA.w,
        y: ARENA.y + this.rng() * ARENA.h,
        r: 0.6 + this.rng() * 1.6,
        a: 0.15 + this.rng() * 0.5,
      })
    }
  }

  // -- attack planning ------------------------------------------------------

  private speedScale(): number {
    const t = clamp(this.elapsed / STAGE_TIME, 0, 1)
    return 1 + 0.28 * t + (this.finale ? 0.06 : 0)
  }

  private scaledInterval(def: AttackDef): number {
    const t = clamp(this.elapsed / STAGE_TIME, 0, 1)
    const finaleBoost = this.finale ? 0.78 : 1
    return Math.max(0.45, def.interval * (1 - 0.3 * t) * finaleBoost)
  }

  private buildPlan(def: AttackDef, volley: number): FirePlan {
    const plan = emptyPlan()
    const scale = this.speedScale()
    const key = this.index * 131 + volley * 17 + def.name.length * 7

    switch (def.type) {
      case 'radial': {
        const count = def.count ?? 8
        const gap = def.gap ?? TAU * 0.24
        const gapCenter = hash01(key, 1, 3) * TAU + (def.rotate ?? 0) * volley
        const usable = TAU - gap
        const speed = (def.speed ?? 160) * scale
        const r = def.radius ?? 8
        const spawnR = CORE_R + 6
        for (let i = 0; i < count; i++) {
          const a = gapCenter + gap / 2 + (i / count) * usable
          plan.orbs.push({
            x: CX + Math.cos(a) * spawnR,
            y: CY + Math.sin(a) * spawnR,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            r,
          })
        }
        plan.gaps.push({ center: gapCenter, width: gap, radius: spawnR + 4 })
        break
      }
      case 'aimed': {
        const count = def.count ?? 1
        const spread = def.spread ?? 0.32
        const base = Math.atan2(this.playerY - CY, this.playerX - CX)
        const speed = (def.speed ?? 210) * scale
        const r = def.radius ?? 8
        const spawnR = CORE_R + 6
        for (let i = 0; i < count; i++) {
          const a = base + (i - (count - 1) / 2) * spread
          plan.orbs.push({
            x: CX + Math.cos(a) * spawnR,
            y: CY + Math.sin(a) * spawnR,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            r,
          })
        }
        plan.aim = { x: this.playerX, y: this.playerY }
        break
      }
      case 'rain': {
        const lanes = def.lanes ?? 5
        const danger = def.count ?? 3
        const chosen = pickSlots(lanes, danger, key)
        const cw = ARENA.w / lanes
        const speed = (def.speed ?? 250) * scale
        const r = def.radius ?? 8
        const spawnY = ARENA.y - 26
        for (const lane of chosen) {
          plan.orbs.push({
            x: ARENA.x + (lane + 0.5) * cw,
            y: spawnY,
            vx: 0,
            vy: speed,
            r,
          })
        }
        break
      }
      case 'crossfire': {
        const lanes = def.lanes ?? 5
        const danger = def.count ?? 3
        const chosen = pickSlots(lanes, danger, key)
        const rh = ARENA.h / lanes
        const speed = (def.speed ?? 220) * scale
        const r = def.radius ?? 8
        for (const lane of chosen) {
          const y = ARENA.y + (lane + 0.5) * rh
          plan.orbs.push({ x: ARENA.x - 26, y, vx: speed, vy: 0, r })
          plan.orbs.push({ x: ARENA.x + ARENA.w + 26, y, vx: -speed, vy: 0, r })
        }
        break
      }
      case 'sweep': {
        const beamCount = def.beamCount ?? 3
        const base = hash01(key, 2, 5) * TAU
        const width = def.beamWidth ?? 11
        const duration = def.beamDuration ?? 0.7
        const spin = def.beamSpeed ?? 0
        for (let i = 0; i < beamCount; i++) {
          const angle = base + (i / beamCount) * TAU
          const angularVel = spin * (i % 2 === 0 ? 1 : -1)
          plan.beams.push({ angle, angularVel, width, duration })
          plan.spokes.push({ angle, angularVel, sweep: angularVel * duration })
        }
        break
      }
      case 'ring': {
        const count = def.rings ?? 1
        const gap = def.gap ?? 1.1
        const growth = (def.speed ?? 165) * scale
        const thickness = def.thickness ?? 22
        const baseR = CORE_R + 4
        const step = (def.ringGap ?? 0.5) * growth
        // all rings in a volley are spaced out immediately and share one safe
        // corridor, so stacking reads as a true multi-band pulse you survive
        // from a single place rather than demanding impossible repositioning
        const gapCenter = hash01(key, 20, 9) * TAU
        for (let i = 0; i < count; i++) {
          const startR = baseR + i * step
          plan.rings.push({
            startR,
            thickness,
            gapCenter,
            gapWidth: gap,
            growth,
            delay: 0,
            gapSpin: def.gapSpin ?? 0,
          })
          plan.gaps.push({ center: gapCenter, width: gap, radius: startR })
        }
        break
      }
      case 'grid': {
        const cols = 4
        const rows = 4
        const bands = def.bands ?? 2
        const duration = def.duration ?? 0.9
        const cw = ARENA.w / cols
        const ch = ARENA.h / rows
        const colOrder: number[] = []
        for (let i = 0; i < cols; i++) colOrder.push(i)
        colOrder.sort((a, b) => hash01(key, a, 11) - hash01(key, b, 11))
        const rowOrder: number[] = []
        for (let i = 0; i < rows; i++) rowOrder.push(i)
        rowOrder.sort((a, b) => hash01(key, b, 12) - hash01(key, a, 12))
        const want = Math.min(bands, cols - 2 > 0 ? cols - 2 : 1)
        for (let i = 0; i < want; i++) {
          const c = colOrder[i]
          plan.zones.push({ x: ARENA.x + c * cw, y: ARENA.y, w: cw, h: ARENA.h, duration })
        }
        const wantR = Math.min(bands, rows - 2 > 0 ? rows - 2 : 1)
        for (let i = 0; i < wantR; i++) {
          const r = rowOrder[i]
          plan.zones.push({ x: ARENA.x, y: ARENA.y + r * ch, w: ARENA.w, h: ch, duration })
        }
        break
      }
    }
    return plan
  }

  private spawnPlan(plan: FirePlan) {
    for (const o of plan.orbs) this.orbs.push({ ...o })
    for (const b of plan.beams) {
      this.beams.push({
        angle: b.angle,
        angularVel: b.angularVel,
        width: b.width,
        length: BEAM_LEN,
        life: b.duration,
        maxLife: b.duration,
      })
    }
    for (const r of plan.rings) {
      this.rings.push({
        r: r.startR,
        thickness: r.thickness,
        gapCenter: r.gapCenter,
        gapWidth: r.gapWidth,
        growth: r.growth,
        gapSpin: r.gapSpin,
        delay: r.delay,
        age: 0,
        life: 8,
      })
    }
    for (const z of plan.zones) {
      this.zones.push({ x: z.x, y: z.y, w: z.w, h: z.h, life: z.duration, maxLife: z.duration })
    }
  }

  // -- update ---------------------------------------------------------------

  update(dt: number, input: InputState) {
    if (this.done) return
    this.time += dt

    // free 8-direction movement, always clamped inside the arena
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0)
    if (dx === 0 && dy === 0 && input.pointer.down) {
      const pdx = input.pointer.x - this.playerX
      const pdy = input.pointer.y - this.playerY
      if (Math.hypot(pdx, pdy) > 6) {
        dx = pdx
        dy = pdy
      }
    }
    const mag = Math.hypot(dx, dy)
    if (mag > 0) {
      dx /= mag
      dy /= mag
      this.facing = Math.atan2(dy, dx)
      this.playerX = clamp(this.playerX + dx * PLAYER_SPEED * dt, ARENA.x + PLAYER_R, ARENA.x + ARENA.w - PLAYER_R)
      this.playerY = clamp(this.playerY + dy * PLAYER_SPEED * dt, ARENA.y + PLAYER_R, ARENA.y + ARENA.h - PLAYER_R)
      this.trailAcc += dt
      if (this.trailAcc > 0.045) {
        this.trailAcc = 0
        if (!this.hooks.reducedMotion) {
          this.particles.emit(this.playerX, this.playerY, 1, {
            colors: ['#8a2bff', '#ff2e88'],
            speed: 26,
            life: 0.4,
            size: 5,
            gravity: 0,
            shape: 'circle',
          })
        }
      }
    }

    // lead-in: "GET READY", nothing can hurt you yet
    if (this.lead > 0) {
      this.lead -= dt
      if (this.lead <= 0) {
        this.lead = 0
        this.hooks.sound('unlock')
      }
      this.particles.update(dt)
      return
    }

    this.elapsed += dt

    // dramatic final five seconds
    if (!this.finale && this.elapsed >= FINALE_AT) {
      this.finale = true
      for (const def of this.stage.finale) {
        this.attacks.push({
          def,
          phase: 'idle',
          timer: def.first ?? 0.3,
          volley: 0,
          plan: emptyPlan(),
        })
      }
      this.flash = 1
      this.hooks.sound('checkpoint')
      this.hooks.shake(0.5)
    }

    this.updateAttacks(dt)
    this.updateOrbs(dt)
    this.updateBeams(dt)
    this.updateRings(dt)
    this.updateZones(dt)

    const deathMsg = this.checkHit()
    if (deathMsg) {
      this.done = true
      this.particles.emit(this.playerX, this.playerY, 26, {
        colors: [theme.player, HAZARD, theme.accent],
        speed: 240,
        life: 0.7,
        size: 6,
        gravity: 0,
        shape: 'circle',
      })
      this.hooks.shake(0.9)
      this.hooks.sound('death')
      this.hooks.death(deathMsg)
      return
    }

    if (this.elapsed >= STAGE_TIME) {
      this.done = true
      this.hooks.sound('win')
      this.hooks.complete()
      return
    }

    this.particles.update(dt)
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2)
  }

  private updateAttacks(dt: number) {
    let best: AttackInstance | null = null

    for (const at of this.attacks) {
      const enabledAt = (at.def.after ?? 0) * STAGE_TIME
      if (this.elapsed < enabledAt) continue

      at.timer -= dt
      if (at.phase === 'telegraph' && (!best || at.timer < best.timer)) best = at
      if (at.timer > 0) continue

      if (at.phase === 'idle') {
        at.phase = 'telegraph'
        at.timer = at.def.telegraph
        at.plan = this.buildPlan(at.def, at.volley)
        if (!this.hooks.reducedMotion) this.hooks.sound('blip')
      } else {
        this.spawnPlan(at.plan)
        at.phase = 'idle'
        at.timer = this.scaledInterval(at.def)
        at.volley++
        this.lastPattern = at.def.name
        this.firedAny = true
      }
    }

    if (best) {
      const imminent: AttackInstance = best
      this.incomingName = imminent.def.name
      this.incomingP = clamp(1 - imminent.timer / imminent.def.telegraph, 0, 1)
    } else {
      this.incomingName = ''
      this.incomingP = 0
    }
  }

  private updateOrbs(dt: number) {
    const os = this.orbs
    for (let i = os.length - 1; i >= 0; i--) {
      const o = os[i]
      o.x += o.vx * dt
      o.y += o.vy * dt
      if (o.x < -50 || o.x > VIEW.w + 50 || o.y < -50 || o.y > VIEW.h + 50) os.splice(i, 1)
    }
  }

  private updateBeams(dt: number) {
    const bs = this.beams
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i]
      b.angle += b.angularVel * dt
      b.life -= dt
      if (b.life <= 0) bs.splice(i, 1)
    }
  }

  private updateRings(dt: number) {
    const rs = this.rings
    for (let i = rs.length - 1; i >= 0; i--) {
      const r = rs[i]
      if (r.delay > 0) {
        r.delay -= dt
        continue
      }
      r.age += dt
      r.r += r.growth * dt
      r.life -= dt
      if (r.r > 780 || r.life <= 0) rs.splice(i, 1)
    }
  }

  private updateZones(dt: number) {
    const zs = this.zones
    for (let i = zs.length - 1; i >= 0; i--) {
      zs[i].life -= dt
      if (zs[i].life <= 0) zs.splice(i, 1)
    }
  }

  private checkHit(): string | null {
    const px = this.playerX
    const py = this.playerY

    for (const o of this.orbs) {
      if (distance(px, py, o.x, o.y) < o.r + PLAYER_HIT) return 'Shredded by the ring.'
    }

    for (const b of this.beams) {
      const ex = CX + Math.cos(b.angle) * b.length
      const ey = CY + Math.sin(b.angle) * b.length
      if (distToSegment(px, py, CX, CY, ex, ey) < b.width / 2 + PLAYER_HIT) return 'The beam found you.'
    }

    for (const r of this.rings) {
      if (r.delay > 0) continue
      const d = distance(px, py, CX, CY)
      if (Math.abs(d - r.r) <= r.thickness / 2 + PLAYER_HIT) {
        const gapNow = r.gapCenter + r.gapSpin * r.age
        const a = Math.atan2(py - CY, px - CX)
        if (angleDelta(a, gapNow) > r.gapWidth / 2) return 'Caught by the shockwave.'
      }
    }

    for (const z of this.zones) {
      const nx = clamp(px, z.x, z.x + z.w)
      const ny = clamp(py, z.y, z.y + z.h)
      if (Math.hypot(px - nx, py - ny) <= PLAYER_HIT) return 'Locked inside a fire band.'
    }

    return null
  }

  focus(): Vec {
    return { x: this.playerX, y: this.playerY }
  }

  destroy() {
    this.orbs = []
    this.beams = []
    this.rings = []
    this.zones = []
    this.attacks = []
    this.particles.clear()
  }

  // -- render ---------------------------------------------------------------

  render(g: CanvasRenderingContext2D, w: number, h: number) {
    const remaining = Math.max(0, STAGE_TIME - this.elapsed)
    const intensity = clamp(this.elapsed / STAGE_TIME, 0, 1)
    const finaleGlow = this.finale ? 0.5 + 0.5 * Math.sin(this.time * 7) : 0

    g.fillStyle = theme.background
    g.fillRect(0, 0, w, h)

    // arena field
    g.save()
    roundRect(g, ARENA.x, ARENA.y, ARENA.w, ARENA.h, 14)
    g.clip()
    g.fillStyle = theme.bg
    g.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h)
    drawGrid(g, w, h, 44, 'rgba(255,255,255,0.032)')

    // starfield
    for (const s of this.stars) {
      g.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(this.time * 2 + s.x))
      g.fillStyle = '#cbb7ff'
      g.beginPath()
      g.arc(s.x, s.y, s.r, 0, TAU)
      g.fill()
    }
    g.globalAlpha = 1

    // core glow
    const glow = g.createRadialGradient(CX, CY, 8, CX, CY, 430)
    glow.addColorStop(0, this.hexA(this.stage.core, 0.32 + finaleGlow * 0.2))
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = glow
    g.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h)

    // finale danger wash
    if (this.finale) {
      const wash = g.createRadialGradient(CX, CY, 60, CX, CY, 520)
      wash.addColorStop(0, 'rgba(255,20,80,0)')
      wash.addColorStop(1, `rgba(255,20,80,${0.16 + finaleGlow * 0.16})`)
      g.fillStyle = wash
      g.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h)
    }
    g.restore()

    // arena border
    g.save()
    g.shadowColor = this.hexA(this.stage.core, 0.7 + finaleGlow * 0.3)
    g.shadowBlur = 16
    strokeRoundRect(g, ARENA.x, ARENA.y, ARENA.w, ARENA.h, 14, this.hexA(this.stage.core, 0.55), 2)
    g.restore()

    this.drawCore(g)

    // telegraphs under hazards so live danger reads on top
    for (const at of this.attacks) {
      if (at.phase === 'telegraph') this.drawTelegraph(g, at)
    }

    this.drawZones(g)
    this.drawRings(g)
    this.drawBeams(g)
    this.drawOrbs(g)
    this.drawPlayer(g)

    this.particles.render(g)

    this.drawHud(g, w, remaining, intensity)

    if (this.lead > 0) this.drawLeadIn(g, w, h)
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,40,80,${this.flash * 0.35})`
      g.fillRect(0, 0, w, h)
    }
  }

  private drawCore(g: CanvasRenderingContext2D) {
    const pulse = 1 + 0.06 * Math.sin(this.time * 4)
    g.save()
    g.translate(CX, CY)
    g.rotate(this.time * 0.5)
    const r = CORE_R * pulse
    g.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      if (i === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.closePath()
    g.shadowColor = this.stage.core
    g.shadowBlur = 22
    g.fillStyle = this.hexA(this.stage.core, 0.22)
    g.fill()
    g.lineWidth = 2
    g.strokeStyle = this.stage.core
    g.stroke()
    g.restore()

    g.save()
    g.beginPath()
    g.arc(CX, CY, CORE_R * 0.42, 0, TAU)
    g.fillStyle = this.stage.core
    g.shadowColor = this.stage.core
    g.shadowBlur = 18
    g.fill()
    g.restore()
  }

  private drawTelegraph(g: CanvasRenderingContext2D, at: AttackInstance) {
    const t = clamp(1 - at.timer / at.def.telegraph, 0, 1)
    const blink = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 12))
    const plan = at.plan

    // orphan gaps (radial / ring safe arcs)
    for (const gp of plan.gaps) {
      g.save()
      g.setLineDash([6, 8])
      g.strokeStyle = `rgba(255,210,59,${0.28 * blink})`
      g.lineWidth = 1.5
      g.beginPath()
      g.arc(CX, CY, gp.radius, 0, TAU)
      g.stroke()
      g.setLineDash([])
      g.strokeStyle = `rgba(60,230,160,${0.55 + 0.35 * blink})`
      g.lineWidth = 6
      g.beginPath()
      g.arc(CX, CY, gp.radius, gp.center - gp.width / 2, gp.center + gp.width / 2)
      g.stroke()
      g.restore()
    }

    // sweeping spoke previews
    for (const s of plan.spokes) {
      g.save()
      g.strokeStyle = `rgba(255,210,59,${0.3 + 0.3 * blink})`
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(CX, CY)
      g.lineTo(CX + Math.cos(s.angle) * BEAM_LEN, CY + Math.sin(s.angle) * BEAM_LEN)
      g.stroke()
      if (Math.abs(s.sweep) > 0.01) {
        g.setLineDash([5, 7])
        g.strokeStyle = `rgba(255,255,255,${0.22 * blink})`
        g.lineWidth = 2
        g.beginPath()
        g.arc(CX, CY, 150, s.angle, s.angle + s.sweep, s.sweep < 0)
        g.stroke()
        g.setLineDash([])
      }
      g.restore()
    }

    // danger zones (grid lock) — warning outline
    for (const z of plan.zones) {
      g.save()
      g.fillStyle = `rgba(255,59,92,${0.08 + 0.12 * blink})`
      g.fillRect(z.x, z.y, z.w, z.h)
      g.strokeStyle = `rgba(255,210,59,${0.5 * blink})`
      g.lineWidth = 2
      g.strokeRect(z.x + 1, z.y + 1, z.w - 2, z.h - 2)
      g.restore()
    }

    // projectile previews
    for (const o of plan.orbs) {
      const vertical = Math.abs(o.vx) < 1
      const horizontal = Math.abs(o.vy) < 1
      if (vertical) {
        g.save()
        g.fillStyle = `rgba(255,59,92,${0.06 + 0.1 * blink})`
        g.fillRect(o.x - 13, ARENA.y, 26, ARENA.h)
        g.strokeStyle = `rgba(255,210,59,${0.45 * blink})`
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(o.x, ARENA.y)
        g.lineTo(o.x, ARENA.y + ARENA.h)
        g.stroke()
        g.restore()
      } else if (horizontal) {
        g.save()
        g.fillStyle = `rgba(255,59,92,${0.06 + 0.1 * blink})`
        g.fillRect(ARENA.x, o.y - 13, ARENA.w, 26)
        g.strokeStyle = `rgba(255,210,59,${0.45 * blink})`
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(ARENA.x, o.y)
        g.lineTo(ARENA.x + ARENA.w, o.y)
        g.stroke()
        g.restore()
      } else {
        const len = Math.hypot(o.vx, o.vy) || 1
        g.save()
        g.fillStyle = `rgba(255,59,92,${0.12 * blink})`
        g.beginPath()
        g.arc(o.x, o.y, o.r + 4, 0, TAU)
        g.fill()
        g.strokeStyle = `rgba(255,210,59,${0.4 * blink})`
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(o.x, o.y)
        g.lineTo(o.x + (o.vx / len) * 48, o.y + (o.vy / len) * 48)
        g.stroke()
        g.restore()
      }
    }

    // aim reticle
    if (plan.aim) {
      const a = plan.aim
      const s = 8 + 6 * t
      g.save()
      g.strokeStyle = `rgba(255,210,59,${0.5 + 0.4 * blink})`
      g.lineWidth = 2
      g.beginPath()
      g.arc(a.x, a.y, s, 0, TAU)
      g.moveTo(a.x - s - 5, a.y)
      g.lineTo(a.x - s + 2, a.y)
      g.moveTo(a.x + s - 2, a.y)
      g.lineTo(a.x + s + 5, a.y)
      g.moveTo(a.x, a.y - s - 5)
      g.lineTo(a.x, a.y - s + 2)
      g.moveTo(a.x, a.y + s - 2)
      g.lineTo(a.x, a.y + s + 5)
      g.stroke()
      g.restore()
    }
  }

  private drawZones(g: CanvasRenderingContext2D) {
    for (const z of this.zones) {
      const k = clamp(z.life / z.maxLife, 0, 1)
      g.save()
      g.beginPath()
      g.rect(z.x, z.y, z.w, z.h)
      g.clip()
      g.fillStyle = `rgba(255,59,92,${0.26 + 0.16 * k})`
      g.fillRect(z.x, z.y, z.w, z.h)
      // animated hazard hatch
      g.strokeStyle = `rgba(255,255,255,${0.14 + 0.1 * k})`
      g.lineWidth = 6
      const step = 30
      const off = (this.time * 60) % step
      for (let x = z.x - z.h; x < z.x + z.w + z.h; x += step) {
        g.beginPath()
        g.moveTo(x + off, z.y)
        g.lineTo(x + off + z.h, z.y + z.h)
        g.stroke()
      }
      g.restore()
      g.strokeStyle = HAZARD_HOT
      g.lineWidth = 2
      g.strokeRect(z.x + 1, z.y + 1, z.w - 2, z.h - 2)
    }
  }

  private drawRings(g: CanvasRenderingContext2D) {
    for (const r of this.rings) {
      if (r.delay > 0) {
        g.save()
        g.setLineDash([4, 8])
        g.strokeStyle = `rgba(255,210,59,0.5)`
        g.lineWidth = 2
        g.beginPath()
        g.arc(CX, CY, r.r, 0, TAU)
        g.stroke()
        g.restore()
        continue
      }
      const k = clamp(r.life / 8, 0, 1)
      const gapNow = r.gapCenter + r.gapSpin * r.age
      g.save()
      g.shadowColor = HAZARD
      g.shadowBlur = 14
      g.strokeStyle = `rgba(255,59,92,${0.55 + 0.4 * (1 - k)})`
      g.lineWidth = r.thickness
      g.beginPath()
      g.arc(CX, CY, r.r, gapNow + r.gapWidth / 2, gapNow + TAU - r.gapWidth / 2)
      g.stroke()
      g.shadowBlur = 0
      g.strokeStyle = `rgba(255,255,255,0.5)`
      g.lineWidth = 2
      g.beginPath()
      g.arc(CX, CY, r.r - r.thickness / 2, gapNow + r.gapWidth / 2, gapNow + TAU - r.gapWidth / 2)
      g.stroke()
      g.beginPath()
      g.arc(CX, CY, r.r + r.thickness / 2, gapNow + r.gapWidth / 2, gapNow + TAU - r.gapWidth / 2)
      g.stroke()
      g.restore()
    }
  }

  private drawBeams(g: CanvasRenderingContext2D) {
    for (const b of this.beams) {
      const ex = CX + Math.cos(b.angle) * b.length
      const ey = CY + Math.sin(b.angle) * b.length
      const k = clamp(b.life / b.maxLife, 0, 1)
      g.save()
      g.lineCap = 'round'
      g.shadowColor = HAZARD
      g.shadowBlur = 18
      g.strokeStyle = `rgba(255,59,92,${0.7 * k + 0.2})`
      g.lineWidth = b.width
      g.beginPath()
      g.moveTo(CX, CY)
      g.lineTo(ex, ey)
      g.stroke()
      g.shadowBlur = 0
      g.strokeStyle = `rgba(255,255,255,${0.7 * k})`
      g.lineWidth = Math.max(2, b.width * 0.28)
      g.beginPath()
      g.moveTo(CX, CY)
      g.lineTo(ex, ey)
      g.stroke()
      g.restore()
    }
  }

  private drawOrbs(g: CanvasRenderingContext2D) {
    for (const o of this.orbs) {
      g.save()
      g.shadowColor = HAZARD
      g.shadowBlur = 12
      g.fillStyle = HAZARD
      g.beginPath()
      g.arc(o.x, o.y, o.r, 0, TAU)
      g.fill()
      g.shadowBlur = 0
      g.fillStyle = 'rgba(255,255,255,0.85)'
      g.beginPath()
      g.arc(o.x - o.r * 0.25, o.y - o.r * 0.25, o.r * 0.42, 0, TAU)
      g.fill()
      g.restore()
    }
  }

  private drawPlayer(g: CanvasRenderingContext2D) {
    const px = this.playerX
    const py = this.playerY
    g.save()
    g.shadowColor = theme.accent2
    g.shadowBlur = this.done ? 4 : 18
    g.fillStyle = theme.player
    g.beginPath()
    g.arc(px, py, PLAYER_R, 0, TAU)
    g.fill()
    g.shadowBlur = 0
    // facing pointer
    g.fillStyle = theme.accent2
    const fx = px + Math.cos(this.facing) * (PLAYER_R + 5)
    const fy = py + Math.sin(this.facing) * (PLAYER_R + 5)
    g.beginPath()
    g.arc(fx, fy, 3.5, 0, TAU)
    g.fill()
    // protective shell ring
    g.strokeStyle = this.incomingName ? `rgba(255,210,59,${0.4 + 0.3 * Math.sin(this.time * 10)})` : 'rgba(138,43,255,0.7)'
    g.lineWidth = 2
    g.beginPath()
    g.arc(px, py, PLAYER_R + 4, 0, TAU)
    g.stroke()
    g.restore()
  }

  private drawHud(g: CanvasRenderingContext2D, w: number, remaining: number, intensity: number) {
    // top band
    g.fillStyle = 'rgba(13,7,22,0.82)'
    g.fillRect(0, 0, w, 64)
    g.fillStyle = 'rgba(255,255,255,0.08)'
    g.fillRect(0, 62, w, 1)

    // left: stage info
    label(g, `STAGE ${this.index} / ${stages.length}`, 20, 22, { size: 12, color: 'rgba(255,255,255,0.55)', weight: '700' })
    label(g, this.stage.name.toUpperCase(), 20, 46, { size: 20, color: theme.text, weight: '700', glow: this.hexA(this.stage.core, 0.8) })

    // center: countdown
    const big = Math.ceil(remaining)
    const urgent = remaining <= 5
    const timerCol = urgent ? HAZARD : theme.text
    if (urgent) {
      g.save()
      g.globalAlpha = 0.25 + 0.25 * Math.sin(this.time * 8)
      g.font = '700 46px "Arial Black", Arial, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'alphabetic'
      g.fillStyle = HAZARD
      g.fillText(String(big), w / 2, 50)
      g.restore()
    }
    label(g, String(big), w / 2, 50, {
      size: 46,
      color: timerCol,
      align: 'center',
      weight: '700',
      glow: urgent ? HAZARD : this.hexA(this.stage.core, 0.9),
    })
    label(g, 'SURVIVE', w / 2, 62, { size: 9, color: 'rgba(255,255,255,0.45)', align: 'center', weight: '700' })

    // right: intensity
    const barX = 748
    const barY = 24
    const barW = 192
    const barH = 14
    label(g, 'INTENSITY', barX, 16, { size: 11, color: 'rgba(255,255,255,0.55)', weight: '700' })
    fillRoundRect(g, barX, barY, barW, barH, 7, 'rgba(255,255,255,0.1)')
    const grad = g.createLinearGradient(barX, 0, barX + barW, 0)
    grad.addColorStop(0, SAFE)
    grad.addColorStop(0.5, WARN)
    grad.addColorStop(1, HAZARD)
    g.fillStyle = grad
    roundRect(g, barX, barY, Math.max(6, barW * intensity), barH, 7)
    g.fill()
    strokeRoundRect(g, barX, barY, barW, barH, 7, 'rgba(255,255,255,0.2)', 1)
    label(g, `${Math.round(intensity * 100)}%`, barX + barW, 52, { size: 11, color: 'rgba(255,255,255,0.6)', align: 'right', weight: '700' })

    // bottom: telegraph warning bar
    const by = 512
    g.fillStyle = 'rgba(13,7,22,0.82)'
    g.fillRect(0, by, w, 28)
    g.fillStyle = 'rgba(255,255,255,0.08)'
    g.fillRect(0, by, w, 1)
    const warnX = 20
    const warnY = by + 7
    const warnW = w - 40
    const warnH = 14
    fillRoundRect(g, warnX, warnY, warnW, warnH, 7, 'rgba(255,255,255,0.07)')
    if (this.incomingName) {
      fillRoundRect(g, warnX, warnY, Math.max(10, warnW * this.incomingP), warnH, 7, WARN)
    } else {
      fillRoundRect(g, warnX, warnY, warnW, warnH, 7, 'rgba(60,230,160,0.18)')
    }
    strokeRoundRect(g, warnX, warnY, warnW, warnH, 7, 'rgba(255,255,255,0.18)', 1)
    const warnText = this.incomingName ? `INCOMING: ${this.incomingName.toUpperCase()}` : this.finale ? 'FINAL SURGE' : 'CLEAR'
    label(g, warnText, w / 2, by + 21, {
      size: 13,
      color: this.incomingName ? '#1a0b12' : 'rgba(255,255,255,0.7)',
      align: 'center',
      weight: '700',
    })

    // pattern readout just under the stage name
    if (this.firedAny) {
      label(g, `PATTERN · ${this.lastPattern}`, 20, 60, { size: 10, color: 'rgba(255,255,255,0.5)', weight: '700' })
    }
  }

  private drawLeadIn(g: CanvasRenderingContext2D, w: number, h: number) {
    g.fillStyle = 'rgba(6,3,11,0.72)'
    g.fillRect(0, 0, w, h)
    const cx = w / 2
    label(g, `STAGE ${this.index}`, cx, 214, { size: 20, color: this.stage.core, align: 'center', weight: '700', glow: this.stage.core })
    label(g, this.stage.name.toUpperCase(), cx, 274, { size: 44, color: theme.text, align: 'center', weight: '700' })
    label(g, this.stage.blurb, cx, 312, { size: 16, color: 'rgba(255,255,255,0.75)', align: 'center', weight: '400' })
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 6)
    label(g, 'GET READY', cx, 386, { size: 30, color: WARN, align: 'center', weight: '700', glow: `rgba(255,210,59,${pulse})` })
    label(g, 'Survive 60 seconds.', cx, 418, { size: 13, color: 'rgba(255,255,255,0.55)', align: 'center', weight: '400' })
  }

  private hexA(hex: string, alpha: number): string {
    // accept #rrggbb and return rgba(); falls back to the raw colour
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
    if (!m) return hex
    const r = parseInt(m[1], 16)
    const gr = parseInt(m[2], 16)
    const b = parseInt(m[3], 16)
    return `rgba(${r},${gr},${b},${alpha})`
  }
}

export const game: GameModule = {
  slug: 'one-screen-boss',
  title: 'One Screen Boss',
  tagline: 'One arena. One boss. Sixty seconds. Do not stop moving.',
  theme,
  controls: [
    { keys: 'W A S D / ←↑↓→', label: 'Move (8-way)' },
    { keys: 'Click + drag', label: 'Move toward pointer' },
    { keys: 'R', label: 'Restart stage' },
    { keys: 'Esc', label: 'Pause' },
  ],
  instructions: [
    'Survive 60 seconds against the boss core on a single fixed screen.',
    'Free 8-direction movement - there is no jump and nowhere to hide.',
    'Every attack telegraphs first: read the warning bar, then move.',
    'Safe gaps and safe cells shift each stage. Stay mobile.',
    'One hit ends the run. All patterns are deterministic and learnable.',
  ],
  levels: stages.length,
  view: VIEW,
  create: (hooks: GameHooks) => new OneScreenBossRuntime(hooks),
}

export default game
