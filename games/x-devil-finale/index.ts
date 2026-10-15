import { approach, circleRect, clamp, rectsOverlap } from '@/lib/game/math'
import { ParticleSystem } from '@/lib/game/particles'
import { PlatformerPlayer, type Solid } from '@/lib/game/platformer'
import { drawGrid, fillRoundRect, label, roundRect, strokeRoundRect } from '@/lib/game/draw'
import type { GameHooks, GameModule, GameRuntime, GameTheme, InputState, Rect, Vec } from '@/lib/game/types'
import { finaleLevels } from './levels'
import type {
  DecorDef,
  HazardDef,
  HazardKind,
  Message,
  MoveDef,
  SolidKind,
  TriggerDef,
  WindowDef,
} from './types'

const VIEW = { w: 960, h: 540 }
const GROUND = 480
const FALL_DEATH = 660
const RISE_DEATH = -220
const WARN_FLASH = 0.9
const FAKE_PROMPT_AT = 2.0
const FAKE_AUTO_AT = 6.5

const theme: GameTheme = {
  background: '#000000',
  bg: '#0a0a0a',
  panel: '#181818',
  solid: '#2a2a2a',
  solidTop: '#bdbdbd',
  hazard: '#ff0000',
  accent: '#0066ff',
  accent2: '#bdbdbd',
  player: '#ffffff',
  exit: '#00a83b',
  text: '#ffffff',
}

/* Palette-locked helpers. Everything drawn is one of the theme colours or a
 * translucent white/black, so the finale stays strictly monochrome + signal. */
const W = (a: number) => `rgba(255,255,255,${a})`
const K = (a: number) => `rgba(0,0,0,${a})`

/* -------------------------------------------------------------------------- */
/* runtime entity shapes                                                      */
/* -------------------------------------------------------------------------- */

interface RTSolid {
  rid: string
  x: number
  y: number
  bx: number
  by: number
  prevX: number
  prevY: number
  w: number
  h: number
  kind: SolidKind
  window?: WindowDef
  move?: MoveDef
  retract?: { triggerX?: number; onStand?: boolean; dx?: number; dy?: number; speed?: number }
  vanishAt?: number
  delay?: number
  label?: string
  hidden: boolean
  gone: boolean
  fallT: number
  falling: boolean
  vy: number
  retracted: boolean
}

interface RTHazard {
  rid: string
  x: number
  y: number
  bx: number
  by: number
  w: number
  h: number
  kind: HazardKind
  face?: 'floor' | 'ceiling'
  window?: WindowDef
  move?: MoveDef
  sweep?: MoveDef & { axis: 'x' | 'y'; range: number }
  hidden: boolean
  active: boolean
  deathMsg?: string
}

interface RTDecoy {
  id: string
  x: number
  y: number
  w: number
  h: number
  hidden: boolean
}

interface RTTrigger {
  def: TriggerDef
  fired: boolean
}

const frac = (v: number) => v - Math.floor(v)

/** Deterministic on/off test for a beat window. */
function inWin(w: WindowDef | undefined, beats: number): boolean {
  if (!w) return true
  const p = Math.max(0.01, w.period)
  const x = (((beats + (w.phase ?? 0)) % p) + p) % p
  return x < w.on
}

function inset(r: Rect, n: number): Rect {
  return { x: r.x + n, y: r.y + n, w: Math.max(0, r.w - n * 2), h: Math.max(0, r.h - n * 2) }
}

function cloneInput(i: InputState): InputState {
  return {
    left: i.left,
    right: i.right,
    up: i.up,
    down: i.down,
    jump: i.jump,
    jumpPressed: i.jumpPressed,
    action: i.action,
    actionPressed: i.actionPressed,
    pointer: { x: i.pointer.x, y: i.pointer.y, down: i.pointer.down, pressed: i.pointer.pressed },
  }
}

function pentagon(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  g.fillStyle = color
  g.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.closePath()
  g.fill()
}

/* -------------------------------------------------------------------------- */
/* runtime                                                                    */
/* -------------------------------------------------------------------------- */

type Phase = 'play' | 'preview' | 'fakeWin' | 'phase2'

class FinaleRuntime implements GameRuntime {
  private hooks: GameHooks
  private player = new PlatformerPlayer()
  private twinPlayer: PlatformerPlayer | null = null
  private particles = new ParticleSystem()

  private level = finaleLevels[0]
  private index = 1
  private isFinale = false
  private inPhase2 = false
  private phase: Phase = 'play'

  private solids: RTSolid[] = []
  private hazards: RTHazard[] = []
  private decoys: RTDecoy[] = []
  private triggers: RTTrigger[] = []

  private time = 0
  private beatPos = 0
  private beatIndex = 0
  private lastBeat = -1
  private bpm = 110

  private reverse = false
  private banner: { text: string; progress: number; color: string } | null = null

  private survivalT = 0
  private previewT = 0
  private fakeWinT = 0
  private tellT = 0
  private msg: Message | null = null
  private gzInside: boolean[] = []

  private groundId: string | null = null
  private twinGroundId: string | null = null
  private twinActive = false

  private finished = false
  private dead = false

  constructor(hooks: GameHooks) {
    this.hooks = hooks
  }

  /* ---------------------------------------------------------------- load */

  load(level: number) {
    this.index = clamp(Math.floor(level), 1, finaleLevels.length)
    this.isFinale = this.index === finaleLevels.length
    this.inPhase2 = false
    const def = finaleLevels[this.index - 1]
    this.setupLevel(def)

    this.time = 0
    this.finished = false
    this.dead = false
    this.fakeWinT = 0
    this.tellT = 0
    this.msg = null
    this.particles.clear()

    this.player = new PlatformerPlayer()
    this.player.reset(def.start.x, def.start.y)
    if (def.gravityStart) this.player.gravityDir = def.gravityStart

    this.twinActive = !!def.twin
    this.twinPlayer = def.twin ? new PlatformerPlayer() : null
    if (def.twin && this.twinPlayer) this.twinPlayer.reset(def.twin.start2.x, def.twin.start2.y)

    this.phase = def.memorize ? 'preview' : 'play'
    this.previewT = 0
  }

  private setupLevel(def: typeof finaleLevels[number]) {
    this.level = def
    this.bpm = def.bpm ?? 110
    this.beatPos = 0
    this.beatIndex = 0
    this.lastBeat = -1
    this.reverse = def.baseReverse ?? false
    this.banner = null
    this.groundId = null
    this.twinGroundId = null
    this.survivalT = def.survival ?? 0
    this.gzInside = (def.gravityZones ?? []).map(() => false)

    this.solids = def.solids.map((s, i) => ({
      rid: s.id ?? `s${i}`,
      x: s.x,
      y: s.y,
      bx: s.x,
      by: s.y,
      prevX: s.x,
      prevY: s.y,
      w: s.w,
      h: s.h,
      kind: s.kind ?? 'solid',
      window: s.window,
      move: s.move,
      retract: s.retract,
      vanishAt: s.vanishAt,
      delay: s.delay,
      label: s.label,
      hidden: s.hidden ?? false,
      gone: false,
      fallT: -1,
      falling: false,
      vy: 0,
      retracted: false,
    }))

    this.hazards = def.hazards.map((h, i) => ({
      rid: h.id ?? `h${i}`,
      x: h.x,
      y: h.y,
      bx: h.x,
      by: h.y,
      w: h.w,
      h: h.h,
      kind: h.kind ?? 'spike',
      face: h.face,
      window: h.window,
      move: h.move,
      sweep: h.sweep,
      hidden: h.hidden ?? false,
      active: true,
      deathMsg: h.deathMsg,
    }))

    this.decoys = (def.decoys ?? []).map((d) => ({ ...d, hidden: d.hidden ?? false }))
    this.triggers = (def.triggers ?? []).map((t) => ({ def: t, fired: false }))
  }

  /* ------------------------------------------------------------- helpers */

  private playerRect(p: PlatformerPlayer = this.player): Rect {
    return { x: p.x, y: p.y, w: p.w, h: p.h }
  }

  private die(msg?: string) {
    if (this.dead || this.finished) return
    this.dead = true
    const p = this.player
    if (!this.hooks.reducedMotion) {
      this.particles.emit(p.centerX, p.centerY, 22, {
        colors: [theme.hazard, theme.accent, theme.accent2, '#ffffff'],
        speed: 250,
        life: 0.7,
        size: 5,
        gravity: 800,
      })
    }
    this.hooks.shake(0.6)
    this.hooks.sound('death')
    this.hooks.death(msg)
  }

  private win() {
    if (this.dead || this.finished) return
    this.finished = true
    this.hooks.sound('win')
    this.hooks.complete()
  }

  private findEntity(id: string): { hidden: boolean } | null {
    return (
      this.solids.find((s) => s.rid === id) ??
      this.hazards.find((h) => h.rid === id) ??
      this.decoys.find((d) => d.id === id) ??
      null
    )
  }

  /* -------------------------------------------------------------- update */

  update(dt: number, input: InputState) {
    this.time += dt
    if (this.msg) {
      this.msg.t -= dt
      if (this.msg.t <= 0) this.msg = null
    }
    this.particles.update(dt)

    if (this.phase === 'fakeWin') {
      this.updateFakeWin(dt, input)
      return
    }
    if (this.phase === 'preview') {
      this.previewT += dt
      if (this.previewT >= (this.level.memorize ?? 0)) {
        this.phase = 'play'
        this.hooks.sound('click')
      }
      return
    }
    if (this.dead || this.finished) return

    const def = this.level

    // --- beat clock --------------------------------------------------------
    this.beatPos += (dt * this.bpm) / 60
    this.beatIndex = Math.floor(this.beatPos)
    if (this.beatIndex !== this.lastBeat) this.lastBeat = this.beatIndex

    // --- gravity zones -----------------------------------------------------
    if (def.gravityZones) {
      for (let i = 0; i < def.gravityZones.length; i++) {
        const z = def.gravityZones[i]
        const inside = rectsOverlap(this.playerRect(), z)
        if (inside && !this.gzInside[i] && this.player.gravityDir !== z.dir) {
          this.player.flip()
          this.hooks.sound('flip')
          this.hooks.shake(0.14)
        }
        this.gzInside[i] = inside
      }
    }

    // --- control mapping ---------------------------------------------------
    this.updateControl()

    // --- survival ----------------------------------------------------------
    if (this.survivalT > 0) {
      this.survivalT = Math.max(0, this.survivalT - dt)
      if (this.survivalT === 0) this.hooks.sound('unlock')
    }

    // --- move solids / vanish / retract -----------------------------------
    for (const s of this.solids) {
      s.prevX = s.x
      s.prevY = s.y
      if (s.gone) continue

      if (s.move) {
        const ph = (this.time / Math.max(0.05, s.move.period) + (s.move.phase ?? 0)) * Math.PI * 2
        s.x = s.bx + Math.sin(ph) * (s.move.dx ?? 0)
        s.y = s.by + Math.sin(ph) * (s.move.dy ?? 0)
      } else {
        s.x = s.bx
        s.y = s.by
      }

      if (s.retract && !s.retracted) {
        const started = s.retract.onStand
          ? this.groundId === s.rid
          : this.player.centerX > (s.retract.triggerX ?? Infinity)
        if (started) {
          s.retracted = true
          this.hooks.sound('unlock')
          this.hooks.shake(0.12)
        }
      }
      if (s.retracted && s.retract) {
        const speed = s.retract.speed ?? 160
        s.x = approach(s.x, s.bx + (s.retract.dx ?? 0), speed * dt)
        s.y = approach(s.y, s.by + (s.retract.dy ?? 0), speed * dt)
      }

      if (s.vanishAt !== undefined && !s.gone && this.player.centerX > s.vanishAt) {
        s.gone = true
        this.hooks.sound('hit')
        this.hooks.shake(0.08)
        if (!this.hooks.reducedMotion) {
          this.particles.emit(s.x + s.w / 2, s.y + s.h / 2, 8, {
            colors: [theme.solid, theme.solidTop, theme.accent2],
            speed: 120,
            life: 0.5,
            gravity: 700,
          })
        }
      }
    }

    // --- collapse timers ---------------------------------------------------
    for (const s of this.solids) {
      if (s.falling) {
        s.vy += 2100 * dt
        s.y += s.vy * dt
        if (s.y > FALL_DEATH) s.gone = true
      } else if (s.fallT >= 0 && s.kind === 'fall') {
        s.fallT += dt
        if (s.fallT >= (s.delay ?? 0.4)) {
          s.falling = true
          s.vy = 0
          this.hooks.sound('hit')
          if (!this.hooks.reducedMotion) {
            this.particles.emit(s.x + s.w / 2, s.y + s.h, 10, {
              colors: [theme.solid, theme.solidTop, theme.hazard],
              speed: 140,
              life: 0.5,
              gravity: 900,
            })
          }
        }
      }
    }

    // --- hazards motion ----------------------------------------------------
    for (const h of this.hazards) this.updateHazard(h)

    // --- carry the player --------------------------------------------------
    if (this.groundId) {
      const g = this.solids.find((s) => s.rid === this.groundId)
      if (g && this.player.onGround) {
        this.player.x += g.x - g.prevX
        this.player.y += g.y - g.prevY
      }
    }
    if (this.twinActive && this.twinPlayer && this.twinGroundId) {
      const g = this.solids.find((s) => s.rid === this.twinGroundId)
      if (g && this.twinPlayer.onGround) {
        this.twinPlayer.x += g.x - g.prevX
        this.twinPlayer.y += g.y - g.prevY
      }
    }

    // --- colliders ---------------------------------------------------------
    const colliders: Solid[] = this.solids.map((s) => ({
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      active: this.solidActive(s),
      tag: s.rid,
    }))

    const doorOpen = inWin(def.exitWindow, this.beatPos) && this.exitReady()
    if (!doorOpen && !this.twinActive) {
      colliders.push({ x: def.exit.x, y: def.exit.y, w: def.exit.w, h: def.exit.h, active: true, tag: 'door' })
    }

    // --- input remap -------------------------------------------------------
    const tin = cloneInput(input)
    if (this.reverse) {
      const l = tin.left
      tin.left = tin.right
      tin.right = l
    }

    const jumpEnabled = (def.jumpMode ?? 'jump') === 'jump'
    if (!jumpEnabled && input.jumpPressed) {
      this.player.flip()
      this.hooks.sound('flip')
      this.hooks.shake(0.1)
    }

    // --- step main player --------------------------------------------------
    const wasGround = this.player.onGround
    const res = this.player.step(dt, tin, colliders, { jumpEnabled })
    this.groundId = res.ground ? res.ground.tag ?? null : null
    if (!wasGround && this.player.onGround && this.groundId) this.hooks.sound('land')
    if (jumpEnabled && tin.jumpPressed && wasGround && this.time > 0.05) this.hooks.sound('jump')
    if (this.groundId) {
      const g = this.solids.find((s) => s.rid === this.groundId)
      if (g && g.kind === 'bounce' && !wasGround) {
        this.player.vy = -900
        this.hooks.sound('flip')
      }
      if (g && g.kind === 'fall' && g.fallT < 0) g.fallT = 0
    }

    // --- step twin ---------------------------------------------------------
    if (this.twinActive && this.twinPlayer) {
      const tin2 = cloneInput(tin)
      const l = tin2.left
      tin2.left = tin2.right
      tin2.right = l
      const tw = this.twinPlayer
      const wasG2 = tw.onGround
      const res2 = tw.step(dt, tin2, colliders, { jumpEnabled: true })
      this.twinGroundId = res2.ground ? res2.ground.tag ?? null : null
      if (!wasG2 && tw.onGround) this.hooks.sound('land')
    }

    // --- hazards -----------------------------------------------------------
    const pr = this.playerRect()
    for (const h of this.hazards) {
      h.active = !h.hidden && inWin(h.window, this.beatPos)
      if (!h.active) continue
      if (this.hitsHazard(h, pr)) {
        this.die(h.deathMsg)
        return
      }
      if (this.twinActive && this.twinPlayer && this.hitsHazard(h, this.playerRect(this.twinPlayer))) {
        this.die(h.deathMsg)
        return
      }
    }

    // --- decoys ------------------------------------------------------------
    for (const d of this.decoys) {
      if (d.hidden) continue
      const r = { x: d.x, y: d.y, w: d.w, h: d.h }
      if (rectsOverlap(pr, r)) {
        this.die('That door was a painting.')
        return
      }
      if (this.twinActive && this.twinPlayer && rectsOverlap(this.playerRect(this.twinPlayer), r)) {
        this.die('That door was a painting.')
        return
      }
    }

    // --- triggers ----------------------------------------------------------
    for (const t of this.triggers) {
      if (t.fired && t.def.once) continue
      if (rectsOverlap(pr, t.def)) {
        t.fired = true
        this.fireTrigger(t.def)
        if (this.dead || this.finished) return
      }
    }

    // --- exits -------------------------------------------------------------
    if (this.twinActive && this.twinPlayer && def.twin) {
      const at1 = rectsOverlap(pr, def.exit)
      const at2 = rectsOverlap(this.playerRect(this.twinPlayer), def.twin.exit2)
      if (at1 && at2) {
        this.win()
        return
      }
    } else if (doorOpen && rectsOverlap(pr, def.exit)) {
      if (this.isFinale && !this.inPhase2) this.enterFakeWin()
      else this.win()
      return
    }

    // --- out of the world --------------------------------------------------
    if (this.player.y > FALL_DEATH || this.player.y < RISE_DEATH) {
      this.die('The void keeps what it catches.')
      return
    }
    if (this.twinPlayer && (this.twinPlayer.y > FALL_DEATH || this.twinPlayer.y < RISE_DEATH)) {
      this.die('One of you fell.')
      return
    }
  }

  private solidActive(s: RTSolid): boolean {
    if (s.gone || s.hidden) return false
    if (s.kind === 'fake') return false
    if (s.kind === 'blink') return inWin(s.window, this.beatPos)
    if (s.kind === 'fall' && s.falling) return s.y < FALL_DEATH
    return true
  }

  private exitReady(): boolean {
    if ((this.level.survival ?? 0) > 0 && this.survivalT > 0) return false
    return true
  }

  private hitsHazard(h: RTHazard, pr: Rect): boolean {
    const r = inset({ x: h.x, y: h.y, w: h.w, h: h.h }, 3)
    if (h.kind === 'saw') {
      return circleRect(h.x + h.w / 2, h.y + h.h / 2, Math.min(h.w, h.h) / 2 - 1, inset(pr, 2))
    }
    return rectsOverlap(inset(pr, 2), r)
  }

  private updateHazard(h: RTHazard) {
    let mx = 0
    let my = 0
    if (h.move) {
      const ph = (this.beatPos / Math.max(0.01, h.move.period) + (h.move.phase ?? 0)) * Math.PI * 2
      mx += Math.sin(ph) * (h.move.dx ?? 0)
      my += Math.sin(ph) * (h.move.dy ?? 0)
    }
    if (h.sweep) {
      const u = frac(this.beatPos / Math.max(0.01, h.sweep.period) + (h.sweep.phase ?? 0))
      const tri = u < 0.5 ? u * 2 : 2 - u * 2
      mx += (h.sweep.axis === 'x' ? 1 : 0) * tri * h.sweep.range
      my += (h.sweep.axis === 'y' ? 1 : 0) * tri * h.sweep.range
    }
    h.x = h.bx + mx
    h.y = h.by + my
  }

  private updateControl() {
    const def = this.level
    let reverse = def.baseReverse ?? false
    let banner: { text: string; progress: number; color: string } | null = null
    const pr = this.playerRect()
    if (def.controlZones) {
      for (const z of def.controlZones) {
        if (rectsOverlap(pr, z)) {
          reverse = z.reverse
          continue
        }
        const pad = z.warnPad ?? 0
        if (pad <= 0 || !this.hooks) continue
        const cx = this.player.centerX
        let prog = 0
        if (cx < z.x && cx > z.x - pad) prog = 1 - (z.x - cx) / pad
        else if (cx > z.x + z.w && cx < z.x + z.w + pad) prog = 1 - (cx - (z.x + z.w)) / pad
        if (prog > 0 && z.reverse !== this.reverse) {
          banner = {
            text: z.label ?? 'CONTROL CHANGE',
            progress: clamp(prog, 0, 1),
            color: z.reverse ? theme.accent2 : theme.accent,
          }
        }
      }
    }
    if (this.reverse !== reverse) {
      this.hooks.sound('flip')
      this.hooks.shake(0.12)
    }
    this.reverse = reverse
    this.banner = banner
  }

  private fireTrigger(t: TriggerDef) {
    if (t.show) for (const id of t.show) {
      const e = this.findEntity(id)
      if (e) e.hidden = false
    }
    if (t.hide) for (const id of t.hide) {
      const e = this.findEntity(id)
      if (e) e.hidden = true
    }
    if (t.setReverse !== undefined) this.reverse = t.setReverse
    if (t.armDecoy) {
      const d = this.decoys.find((x) => x.id === t.armDecoy)
      if (d) d.hidden = false
    }
    if (t.moveExit) {
      this.level = { ...this.level, exit: { ...this.level.exit, x: this.level.exit.x + t.moveExit.dx, y: this.level.exit.y + t.moveExit.dy } }
    }
    if (t.message) this.msg = { text: t.message, t: 3 }
    if (t.shake) this.hooks.shake(t.shake)
    if (t.sound) this.hooks.sound(t.sound)
    if (t.kill) this.die()
  }

  /* --------------------------------------------------------- fake ending */

  private enterFakeWin() {
    this.phase = 'fakeWin'
    this.fakeWinT = 0
    this.tellT = 0
    this.hooks.sound('win')
    this.hooks.shake(0.4)
    if (!this.hooks.reducedMotion) {
      for (let i = 0; i < 6; i++) {
        this.particles.emit(120 + i * 140, 60, 6, {
          colors: [theme.accent2, theme.accent, theme.exit, '#ffffff'],
          speed: 150,
          life: 1.7,
          size: 5,
          gravity: 260,
        })
      }
      this.particles.emit(this.player.centerX, this.player.centerY, 26, {
        colors: [theme.exit, '#ffffff', theme.accent2],
        speed: 260,
        life: 0.9,
        gravity: 300,
      })
    }
  }

  private updateFakeWin(dt: number, input: InputState) {
    this.fakeWinT += dt
    if (!this.hooks.reducedMotion) this.tellT += dt
    if (this.fakeWinT > FAKE_PROMPT_AT) {
      if (input.actionPressed || input.jumpPressed || input.up || input.pointer.pressed) {
        this.startPhase2()
        return
      }
    }
    if (this.fakeWinT > FAKE_AUTO_AT) this.startPhase2()
  }

  private startPhase2() {
    const next = this.level.phase2
    if (!next) {
      this.win()
      return
    }
    this.inPhase2 = true
    this.setupLevel(next)
    this.phase = 'play'
    this.dead = false
    this.particles.clear()
    this.player = new PlatformerPlayer()
    this.player.reset(next.start.x, next.start.y)
    this.twinActive = false
    this.twinPlayer = null
    this.hooks.shake(1.2)
    this.hooks.sound('hit')
    this.msg = { text: 'THE CROWN WAS A LIE', t: 3 }
    if (!this.hooks.reducedMotion) {
      this.particles.emit(VIEW.w / 2, GROUND, 40, {
        colors: [theme.hazard, theme.accent, theme.accent2, '#ffffff'],
        speed: 340,
        life: 0.9,
        size: 5,
        gravity: 900,
      })
    }
  }

  focus(): Vec {
    return { x: this.player.centerX, y: this.player.centerY }
  }

  destroy() {
    this.particles.clear()
    this.solids = []
    this.hazards = []
    this.decoys = []
    this.triggers = []
  }

  /* -------------------------------------------------------------- render */

  render(g: CanvasRenderingContext2D, w: number, h: number) {
    this.drawBackground(g, w, h)
    this.drawZones(g)
    this.drawDecor(g)

    for (const s of this.solids) this.drawSolid(g, s)
    for (const hz of this.hazards) this.drawHazard(g, hz)
    for (const d of this.decoys) if (!d.hidden) this.drawDoor(g, { x: d.x, y: d.y, w: d.w, h: d.h }, true, true)

    if (!this.twinActive) this.drawDoor(g, this.level.exit, this.exitReady(), false)

    if (this.twinActive && this.level.twin) {
      this.drawDoor(g, this.level.exit, true, false)
      this.drawDoor(g, this.level.twin.exit2, true, false)
      this.drawTwinAxis(g, this.level.twin.axis)
    }

    for (const trig of this.triggers) void trig

    if (this.twinPlayer) this.drawPlayer(g, this.twinPlayer, true)
    this.drawPlayer(g, this.player, false)

    this.particles.render(g)
    this.drawHud(g, w, h)

    if (this.phase === 'preview') this.drawPreview(g, w, h)
    if (this.phase === 'fakeWin') this.drawFakeVictory(g, w, h)
    if (this.msg) this.drawMessage(g, w, h)
  }

  private drawBackground(g: CanvasRenderingContext2D, w: number, h: number) {
    g.fillStyle = theme.bg
    g.fillRect(0, 0, w, h)

    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, theme.panel)
    grad.addColorStop(0.55, theme.bg)
    grad.addColorStop(1, theme.background)
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)

    drawGrid(g, w, h, 48, W(0.03))

    // watchful devil eye — the finale motif
    const cx = w / 2
    const cy = h * 0.44
    const pulse = this.hooks.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 0.8)
    g.save()
    g.globalAlpha = 0.05 + pulse * 0.05
    g.strokeStyle = theme.hazard
    g.lineWidth = 2
    g.beginPath()
    g.ellipse(cx, cy, 280, 120, 0, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = theme.hazard
    g.beginPath()
    g.arc(cx, cy, 52, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 0.5 + pulse * 0.2
    g.fillStyle = theme.background
    g.beginPath()
    g.ellipse(cx, cy, 14, 34, 0, 0, Math.PI * 2)
    g.fill()
    g.restore()

    const vg = g.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, h * 0.95)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(0,0,0,0.55)')
    g.fillStyle = vg
    g.fillRect(0, 0, w, h)
  }

  private drawZones(g: CanvasRenderingContext2D) {
    const def = this.level
    if (def.gravityZones) {
      for (const z of def.gravityZones) {
        g.save()
        g.globalAlpha = 0.12
        g.fillStyle = theme.accent
        g.fillRect(z.x, z.y, z.w, z.h)
        g.restore()
        strokeRoundRect(g, z.x + 1, z.y + 1, z.w - 2, z.h - 2, 4, W(0.5), 1)
        const off = this.hooks.reducedMotion ? 0 : (this.time * 60) % 40
        g.save()
        g.globalAlpha = 0.5
        g.fillStyle = theme.accent
        for (let y = z.y + 24 + off; y < z.y + z.h - 10; y += 40) {
          const cx = z.x + z.w / 2
          g.beginPath()
          if (z.dir === -1) {
            g.moveTo(cx, y - 10)
            g.lineTo(cx - 8, y + 4)
            g.lineTo(cx + 8, y + 4)
          } else {
            g.moveTo(cx, y + 10)
            g.lineTo(cx - 8, y - 4)
            g.lineTo(cx + 8, y - 4)
          }
          g.closePath()
          g.fill()
        }
        g.restore()
      }
    }
    if (def.controlZones) {
      for (const z of def.controlZones) {
        const col = z.reverse ? theme.accent2 : theme.accent
        const pad = z.warnPad ?? 0
        if (pad > 0) {
          g.save()
          g.globalAlpha = 0.06 + 0.05 * Math.abs(Math.sin(this.time * 6))
          g.fillStyle = col
          const a = { x: Math.max(0, z.x - pad), y: z.y, w: z.w + pad * 2, h: z.h }
          g.fillRect(a.x, a.y, a.w, a.h)
          g.restore()
        }
        g.save()
        g.globalAlpha = 0.1
        g.fillStyle = col
        g.fillRect(z.x, z.y, z.w, z.h)
        g.restore()
        g.save()
        g.setLineDash([9, 6])
        g.strokeStyle = col
        g.lineWidth = 2
        g.strokeRect(z.x + 1, z.y + 1, z.w - 2, z.h - 2)
        g.setLineDash([])
        g.restore()
        label(g, z.reverse ? '⇄ MIRROR' : '⇄ NORMAL', z.x + 8, z.y + 24, {
          size: 13,
          color: col,
          weight: '800',
          glow: col,
        })
      }
    }
  }

  private drawSolid(g: CanvasRenderingContext2D, s: RTSolid) {
    if (s.gone) return
    const off = s.kind === 'blink' && !inWin(s.window, this.beatPos)
    if (off) {
      g.save()
      g.globalAlpha = 0.16
      fillRoundRect(g, s.x, s.y, s.w, s.h, 4, theme.accent)
      g.restore()
      g.save()
      g.setLineDash([5, 5])
      strokeRoundRect(g, s.x + 1, s.y + 1, s.w - 2, s.h - 2, 4, W(0.6), 1.5)
      g.setLineDash([])
      g.restore()
      if (s.window) {
        const p = Math.max(0.01, s.window.period)
        const x = (((this.beatPos + (s.window.phase ?? 0)) % p) + p) % p
        const remain = p - x
        const cx = s.x + s.w / 2
        const cy = s.y + s.h / 2
        g.strokeStyle = W(0.7)
        g.lineWidth = 2
        g.beginPath()
        g.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + (x / p) * Math.PI * 2)
        g.stroke()
        label(g, remain.toFixed(1), cx, cy - 14, { size: 10, color: W(0.9), align: 'center' })
      }
      return
    }

    if (s.kind === 'fake') {
      fillRoundRect(g, s.x, s.y, s.w, s.h, 3, K(0.32))
      strokeRoundRect(g, s.x, s.y, s.w, s.h, 3, W(0.25), 1)
      g.save()
      g.setLineDash([6, 5])
      g.strokeStyle = W(0.28)
      g.beginPath()
      g.moveTo(s.x + 4, s.y + s.h / 2)
      g.lineTo(s.x + s.w - 4, s.y + s.h / 2)
      g.stroke()
      g.restore()
      return
    }

    if (s.kind === 'bounce') {
      fillRoundRect(g, s.x, s.y, s.w, s.h, 4, theme.accent)
      g.fillStyle = W(0.55)
      g.fillRect(s.x + 3, s.y + 2, s.w - 6, 2)
      return
    }

    const base = s.kind === 'fall' && s.fallT >= 0 ? theme.panel : theme.solid
    fillRoundRect(g, s.x, s.y, s.w, s.h, 3, base)
    g.fillStyle = s.kind === 'fall' && s.fallT >= 0 ? theme.hazard : theme.solidTop
    g.fillRect(s.x, s.y, s.w, 3)

    if (s.kind === 'fall') {
      g.strokeStyle = W(0.25)
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(s.x + s.w / 2 - 8, s.y + 4)
      g.lineTo(s.x + s.w / 2, s.y + s.h - 2)
      g.lineTo(s.x + s.w / 2 + 8, s.y + 4)
      g.stroke()
    }
    if (s.kind === 'blink') {
      strokeRoundRect(g, s.x, s.y, s.w, s.h, 3, W(0.85), 2)
    }
    if (s.kind === 'retract') {
      g.fillStyle = W(0.5)
      for (let i = 0; i < 3; i++) {
        const x = s.x + s.w - 16 - i * 12
        g.beginPath()
        g.moveTo(x, s.y + 4)
        g.lineTo(x + 6, s.y + s.h / 2)
        g.lineTo(x, s.y + s.h - 4)
        g.closePath()
        g.fill()
      }
    }
    if (s.label) label(g, s.label, s.x + s.w / 2, s.y - 6, { size: 10, align: 'center', color: 'rgba(255,255,255,0.5)' })
  }

  private drawHazard(g: CanvasRenderingContext2D, hz: RTHazard) {
    if (hz.hidden) return
    const on = hz.active
    if (hz.kind === 'saw') {
      const cx = hz.x + hz.w / 2
      const cy = hz.y + hz.h / 2
      const r = Math.min(hz.w, hz.h) / 2
      g.save()
      g.translate(cx, cy)
      g.rotate(this.time * 6)
      g.fillStyle = on ? theme.hazard : K(0.45)
      g.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        const rr = i % 2 === 0 ? r : r * 0.72
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
      }
      g.closePath()
      g.fill()
      g.restore()
      return
    }

    if (hz.kind === 'beam') {
      if (on) {
        fillRoundRect(g, hz.x, hz.y, hz.w, hz.h, 4, K(0.55))
        g.fillStyle = theme.hazard
        for (let y = hz.y + 6; y < hz.y + hz.h - 6; y += 16) {
          g.beginPath()
          g.moveTo(hz.x - 5, y + 8)
          g.lineTo(hz.x + hz.w / 2, y - 2)
          g.lineTo(hz.x + hz.w + 5, y + 8)
          g.closePath()
          g.fill()
        }
      }
      g.save()
      g.globalAlpha = on ? 1 : 0.35
      g.setLineDash(on ? [] : [5, 5])
      strokeRoundRect(g, hz.x, hz.y, hz.w, hz.h, 4, on ? theme.hazard : W(0.6), on ? 3 : 2)
      g.setLineDash([])
      g.restore()
      return
    }

    // spike field
    const count = Math.max(1, Math.floor(hz.w / 20))
    g.fillStyle = on ? theme.hazard : W(0.28)
    for (let i = 0; i < count; i++) {
      const sx = hz.x + (hz.w / count) * i
      const sw = hz.w / count
      g.beginPath()
      if (hz.face === 'ceiling') {
        g.moveTo(sx, hz.y)
        g.lineTo(sx + sw / 2, hz.y + hz.h)
        g.lineTo(sx + sw, hz.y)
      } else {
        g.moveTo(sx, hz.y + hz.h)
        g.lineTo(sx + sw / 2, hz.y)
        g.lineTo(sx + sw, hz.y + hz.h)
      }
      g.closePath()
      g.fill()
    }
    if (hz.window) {
      g.save()
      g.globalAlpha = on ? 0.9 : 0.3
      strokeRoundRect(g, hz.x - 1, hz.y - 2, hz.w + 2, hz.h + 4, 3, on ? theme.accent2 : W(0.5), 1.5)
      g.restore()
    }
  }

  private drawDoor(g: CanvasRenderingContext2D, r: Rect, open: boolean, fake: boolean) {
    if (fake) {
      const flick = 0.5 + 0.5 * Math.sin(this.time * 20)
      g.save()
      g.shadowColor = theme.hazard
      g.globalAlpha = 0.3 + 0.25 * flick
      g.shadowBlur = 14 + 8 * flick
      fillRoundRect(g, r.x, r.y, r.w, r.h, 4, K(0.6))
      g.restore()
      strokeRoundRect(g, r.x, r.y, r.w, r.h, 4, theme.accent2, 2)
      g.strokeStyle = W(0.75)
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(r.x + r.w * 0.5, r.y + 4)
      g.lineTo(r.x + r.w * 0.42, r.y + r.h * 0.5)
      g.lineTo(r.x + r.w * 0.56, r.y + r.h - 4)
      g.stroke()
      return
    }
    const glow = open ? theme.exit : W(0.3)
    g.save()
    g.shadowColor = glow
    g.shadowBlur = open ? 22 : 8
    fillRoundRect(g, r.x, r.y, r.w, r.h, 4, open ? theme.background : theme.panel)
    g.restore()
    strokeRoundRect(g, r.x, r.y, r.w, r.h, 4, open ? theme.exit : W(0.5), 2)
    if (open) {
      g.fillStyle = theme.exit
      g.beginPath()
      g.moveTo(r.x + r.w * 0.36, r.y + r.h * 0.34)
      g.lineTo(r.x + r.w * 0.64, r.y + r.h * 0.5)
      g.lineTo(r.x + r.w * 0.36, r.y + r.h * 0.66)
      g.closePath()
      g.fill()
    } else {
      g.strokeStyle = W(0.7)
      g.lineWidth = 2
      g.strokeRect(r.x + r.w / 2 - 7, r.y + r.h / 2 - 6, 14, 12)
      g.beginPath()
      g.arc(r.x + r.w / 2, r.y + r.h / 2 - 6, 5, Math.PI, 0)
      g.stroke()
    }
  }

  private drawTwinAxis(g: CanvasRenderingContext2D, axis: number) {
    g.save()
    g.setLineDash([8, 8])
    g.strokeStyle = W(0.35)
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(axis, 0)
    g.lineTo(axis, VIEW.h)
    g.stroke()
    g.restore()
    label(g, 'MIRROR', axis, 22, { size: 11, align: 'center', color: W(0.7), weight: '800' })
  }

  private drawDecor(g: CanvasRenderingContext2D) {
    for (const d of this.level.decor ?? []) this.drawOneDecor(g, d)
  }

  private drawOneDecor(g: CanvasRenderingContext2D, d: DecorDef) {
    const col = d.color ?? W(0.8)
    if (d.kind === 'label') {
      const size = d.size ?? 15
      g.font = `800 ${size}px "Arial Black", Arial, sans-serif`
      const tw = g.measureText(d.text ?? '').width
      if (d.box) {
        const bw = tw + 26
        const bh = size + 16
        const bx = d.x - bw / 2
        const by = d.y - size - 4
        fillRoundRect(g, bx, by, bw, bh, 7, K(0.85))
        strokeRoundRect(g, bx, by, bw, bh, 7, col, 1.5)
        label(g, d.text ?? '', d.x, by + bh / 2 + size * 0.34, { size, color: col, align: 'center', weight: '800' })
      } else {
        label(g, d.text ?? '', d.x, d.y, { size, color: col, align: d.align ?? 'left', weight: '800' })
      }
    } else if (d.kind === 'arrow') {
      const len = d.len ?? 54
      const m = Math.hypot(d.dx ?? 1, d.dy ?? 0) || 1
      const ux = (d.dx ?? 1) / m
      const uy = (d.dy ?? 0) / m
      const ex = d.x + ux * len
      const ey = d.y + uy * len
      g.strokeStyle = col
      g.fillStyle = col
      g.lineWidth = 5
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(d.x, d.y)
      g.lineTo(ex, ey)
      g.stroke()
      const px = -uy
      const py = ux
      g.beginPath()
      g.moveTo(ex + ux * 12, ey + uy * 12)
      g.lineTo(ex + px * 8, ey + py * 8)
      g.lineTo(ex - px * 8, ey - py * 8)
      g.closePath()
      g.fill()
      if (d.text) label(g, d.text, d.x, d.y - 14, { size: 12, color: col, align: 'center', weight: '800' })
    } else {
      const w = d.w ?? 140
      const h = d.h ?? 44
      fillRoundRect(g, d.x, d.y, w, h, 7, K(0.9))
      strokeRoundRect(g, d.x, d.y, w, h, 7, col, 2)
      label(g, d.text ?? 'BUTTON', d.x + w / 2, d.y + h / 2 + 5, {
        size: Math.min(14, w / ((d.text?.length ?? 6) * 0.62)),
        color: col,
        align: 'center',
        weight: '800',
      })
    }
  }

  private drawPlayer(g: CanvasRenderingContext2D, p: PlatformerPlayer, twin: boolean) {
    const stretch = clamp((p.vy * p.gravityDir) / 1400, -0.3, 0.3)
    const cx = p.centerX
    const cy = p.centerY
    g.save()
    g.translate(cx, cy)
    g.scale(1, p.gravityDir === 1 ? 1 : -1)
    g.scale(1 - stretch * 0.4, 1 + stretch * 0.4)
    if (twin) {
      g.globalAlpha = 0.85
      fillRoundRect(g, -p.w / 2, -p.h / 2, p.w, p.h, 6, theme.solidTop)
      strokeRoundRect(g, -p.w / 2, -p.h / 2, p.w, p.h, 6, theme.accent2, 1.5)
    } else {
      g.shadowColor = theme.player
      g.shadowBlur = 14
      fillRoundRect(g, -p.w / 2, -p.h / 2, p.w, p.h, 6, theme.player)
      g.shadowBlur = 0
      strokeRoundRect(g, -p.w / 2, -p.h / 2, p.w, p.h, 6, theme.accent2, 1.5)
    }
    g.fillStyle = theme.background
    const eye = p.facing
    g.fillRect(-4 + eye * 2, -p.h / 2 + 9, 3, 5)
    g.fillRect(2 + eye * 2, -p.h / 2 + 9, 3, 5)
    g.restore()
    g.globalAlpha = 1
  }

  private drawHud(g: CanvasRenderingContext2D, w: number, h: number) {
    label(g, `LEVEL ${this.index} / ${finaleLevels.length}`, 16, 26, { size: 12, color: W(0.5), weight: '800' })
    label(g, this.level.name, 16, 48, { size: 17, color: W(0.92), glow: theme.hazard })
    label(g, this.level.hint, 16, h - 16, { size: 13, color: W(0.6) })

    if (this.level.showBeat) this.drawBeatRail(g, w)

    if (this.level.controlZones) {
      const px = w - 190
      fillRoundRect(g, px, 14, 174, 44, 9, K(0.8))
      strokeRoundRect(g, px, 14, 174, 44, 9, this.reverse ? theme.accent2 : W(0.2), 2)
      label(g, 'CONTROLS', px + 12, 32, { size: 10, color: W(0.5), weight: '800' })
      label(g, this.reverse ? 'MIRRORED' : 'NORMAL', px + 12, 50, {
        size: 16,
        color: this.reverse ? theme.accent2 : theme.accent,
        weight: '800',
      })
    }

    if (this.twinActive) {
      label(g, 'TWINS · one input, mirrored', w / 2, 26, { size: 12, color: W(0.85), align: 'center', weight: '800' })
    }

    if ((this.level.survival ?? 0) > 0) {
      const bw = 300
      const bx = w / 2 - bw / 2
      const done = this.survivalT <= 0
      fillRoundRect(g, bx, 72, bw, 12, 6, W(0.12))
      const total = this.level.survival ?? 1
      const prog = done ? 1 : 1 - this.survivalT / total
      fillRoundRect(g, bx, 72, bw * clamp(prog, 0, 1), 12, 6, done ? theme.exit : theme.hazard)
      label(g, done ? 'THE WAY IS OPEN' : `SURVIVE  ${this.survivalT.toFixed(1)}s`, w / 2, 66, {
        size: 12,
        align: 'center',
        color: done ? theme.exit : '#ffffff',
        weight: '800',
      })
    }

    if (this.banner) {
      const b = this.banner
      const beat = 0.6 + 0.4 * Math.sin(this.time * 10)
      g.save()
      g.globalAlpha = beat
      fillRoundRect(g, w / 2 - 210, 96, 420, 46, 9, K(0.88))
      strokeRoundRect(g, w / 2 - 210, 96, 420, 46, 9, b.color, 2)
      label(g, `⚠  ${b.text}  INCOMING`, w / 2, 125, { size: 16, color: b.color, align: 'center', weight: '800', glow: b.color })
      g.restore()
      fillRoundRect(g, w / 2 - 170, 148, 340, 6, 3, W(0.15))
      fillRoundRect(g, w / 2 - 170, 148, 340 * clamp(b.progress, 0, 1), 6, 3, b.color)
    }
  }

  private drawBeatRail(g: CanvasRenderingContext2D, w: number) {
    const x0 = w / 2 - 150
    const x1 = w / 2 + 150
    const cy = 30
    fillRoundRect(g, x0 - 30, 12, x1 - x0 + 60, 34, 8, K(0.72))
    label(g, 'BEAT', x0 - 22, cy + 5, { size: 11, color: W(0.45), weight: '800' })
    const pips = 8
    const step = (x1 - x0) / (pips - 1)
    const current = ((this.beatIndex % pips) + pips) % pips
    const pulse = Math.max(0, 1 - (this.beatPos - this.beatIndex) * 3)
    for (let i = 0; i < pips; i++) {
      const x = x0 + i * step
      const down = i % 4 === 0
      const on = i === current
      const size = down ? 11 : 8
      const col = on ? (down ? theme.accent2 : theme.accent) : W(0.22)
      if (on) {
        g.save()
        g.shadowColor = col
        g.shadowBlur = 12 + pulse * 12
        fillRoundRect(g, x - size / 2, cy - size / 2, size, size, down ? 2 : size / 2, col)
        g.restore()
      } else if (down) {
        g.fillStyle = col
        g.fillRect(x - size / 2, cy - size / 2, size, size)
      } else {
        g.fillStyle = col
        g.beginPath()
        g.arc(x, cy, size / 2, 0, Math.PI * 2)
        g.fill()
      }
    }
    label(g, `${Math.round(this.bpm)} BPM`, w - 16, cy + 5, { size: 12, align: 'right', color: W(0.7), weight: '800' })
  }

  private drawPreview(g: CanvasRenderingContext2D, w: number, h: number) {
    const remain = Math.max(0, (this.level.memorize ?? 0) - this.previewT)
    g.fillStyle = K(0.45)
    g.fillRect(0, 0, w, h)
    label(g, 'MEMORISE THE PATH', w / 2, h / 2 - 24, { size: 26, align: 'center', color: theme.accent, weight: '800', glow: theme.accent })
    label(g, `cross while the platforms exist`, w / 2, h / 2 + 6, { size: 14, align: 'center', color: W(0.8) })
    const bw = 300
    const bx = w / 2 - bw / 2
    fillRoundRect(g, bx, h / 2 + 24, bw, 8, 4, W(0.14))
    fillRoundRect(g, bx, h / 2 + 24, bw * (1 - remain / Math.max(0.01, this.level.memorize ?? 1)), 8, 4, theme.accent)
  }

  private drawMessage(g: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.msg) return
    const a = clamp(this.msg.t / 0.6, 0, 1)
    g.save()
    g.globalAlpha = a
    g.font = '800 16px "Arial Black", Arial, sans-serif'
    const mw = g.measureText(this.msg.text).width + 40
    fillRoundRect(g, w / 2 - mw / 2, h - 92, mw, 34, 8, K(0.92))
    strokeRoundRect(g, w / 2 - mw / 2, h - 92, mw, 34, 8, theme.hazard, 1.5)
    label(g, this.msg.text, w / 2, h - 69, { size: 16, align: 'center', color: '#ffffff', weight: '800' })
    g.restore()
  }

  private drawFakeVictory(g: CanvasRenderingContext2D, w: number, h: number) {
    const t = this.fakeWinT
    const stats = this.level.fakeStats ?? { time: '00:00.00', deaths: '0', score: '0', quip: 'THE DEVIL IS SLAIN' }
    g.fillStyle = `rgba(0,0,0,${clamp(0.72 + t * 0.06, 0.72, 0.95)})`
    g.fillRect(0, 0, w, h)

    // celebratory sweep
    const sweep = g.createLinearGradient(0, 0, w, h)
    sweep.addColorStop(0, W(0.14))
    sweep.addColorStop(0.5, W(0.08))
    sweep.addColorStop(1, W(0.14))
    g.fillStyle = sweep
    g.fillRect(0, 0, w, h)

    const pop = clamp(t / 0.4, 0, 1)
    g.save()
    g.translate(w / 2, h / 2 - 40)
    g.scale(0.85 + pop * 0.15, 0.85 + pop * 0.15)
    label(g, 'VICTORY', 0, 0, {
      size: 96,
      align: 'center',
      color: '#ffffff',
      weight: '900',
      glow: theme.accent2,
    })
    g.restore()

    label(g, stats.quip, w / 2, h / 2 + 20, { size: 22, align: 'center', color: theme.exit, weight: '800', glow: theme.exit })
    label(g, 'You beat X Devil: The Finale', w / 2, h / 2 + 48, { size: 14, align: 'center', color: W(0.7) })

    // fake stat cards
    const cards = [
      { k: 'TIME', v: stats.time },
      { k: 'DEATHS', v: stats.deaths },
      { k: 'SCORE', v: stats.score },
    ]
    const cw = 168
    const gap = 16
    const total = cards.length * cw + (cards.length - 1) * gap
    let cx = w / 2 - total / 2
    for (const c of cards) {
      fillRoundRect(g, cx, h / 2 + 72, cw, 62, 10, K(0.85))
      strokeRoundRect(g, cx, h / 2 + 72, cw, 62, 10, 'rgba(255,255,255,0.22)', 1.5)
      label(g, c.k, cx + cw / 2, h / 2 + 92, { size: 11, align: 'center', color: 'rgba(255,255,255,0.5)', weight: '800' })
      label(g, c.v, cx + cw / 2, h / 2 + 120, { size: 22, align: 'center', color: '#ffffff', weight: '800' })
      cx += cw + gap
    }

    // hidden-but-learnable seam: a hairline crack that keeps widening
    const crack = clamp((t - 1.4) / 3, 0, 1)
    if (crack > 0) {
      const cxx = w / 2
      const cyy = h / 2 + 150
      g.save()
      g.globalAlpha = clamp(crack * 0.8, 0, 1)
      g.strokeStyle = theme.hazard
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(cxx - 60 * crack, cyy)
      g.lineTo(cxx - 10, cyy - 10 * crack)
      g.lineTo(cxx + 14, cyy + 8 * crack)
      g.lineTo(cxx + 70 * crack, cyy - 4)
      g.stroke()
      g.restore()
    }

    if (t > FAKE_PROMPT_AT) {
      const blink = 0.55 + 0.45 * Math.sin(this.time * 8)
      g.save()
      g.globalAlpha = clamp(blink, 0, 1)
      label(g, 'PRESS  E / SPACE  TO CLAIM YOUR CROWN', w / 2, h - 44, {
        size: 18,
        align: 'center',
        color: theme.accent,
        weight: '800',
        glow: theme.accent,
      })
      g.restore()
    }
  }
}

export const game: GameModule = {
  slug: 'x-devil-finale',
  title: 'X Devil: The Finale',
  tagline: 'Nine betrayals in one room. The crown is heavier than it looks.',
  theme,
  controls: [
    { keys: 'A / D or ←/→', label: 'Move (sometimes mirrored)' },
    { keys: 'W / ↑ / Space', label: 'Jump — or flip gravity' },
    { keys: 'E / Enter / J', label: 'Confirm / claim' },
    { keys: 'R', label: 'Restart level' },
    { keys: 'Esc', label: 'Pause' },
  ],
  instructions: [
    'Ten levels, one for each betrayal you survived — then all of them at once.',
    'Every trap is deterministic: read it, learn it, beat it.',
    'The level paints its own signs. The signs can lie. The world cannot.',
    'Some floors fall, some mirrors flip, some platforms are only promises.',
    'Reach the exit. What happens after is between you and the door.',
  ],
  levels: finaleLevels.length,
  view: VIEW,
  create: (hooks) => new FinaleRuntime(hooks),
}

export default game
