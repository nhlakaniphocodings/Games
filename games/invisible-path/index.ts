import { clamp, makeRng, rectsOverlap } from '@/lib/game/math'
import { ParticleSystem } from '@/lib/game/particles'
import { PlatformerPlayer, type Solid } from '@/lib/game/platformer'
import { drawGrid, fillRoundRect, label, roundRect, strokeRoundRect } from '@/lib/game/draw'
import type { GameHooks, GameModule, GameRuntime, GameTheme, InputState, Rect, Vec } from '@/lib/game/types'
import { invisiblePathLevels } from './levels'
import type { LevelDef, PlatBlink, PlatDef, SwitchDef } from './types'

const VIEW = { w: 960, h: 540 }
const FALL_Y = 620
const FLASH_TIME = 0.4
const FADE_TIME = 0.45
const RECALL_TIME = 0.55

const theme: GameTheme = {
  background: '#06050b',
  bg: '#0b0916',
  panel: '#151127',
  solid: '#2b2440',
  solidTop: '#7c68c4',
  hazard: '#ff4d5e',
  accent: '#8b7cff',
  accent2: '#2fe0c8',
  player: '#f2eaff',
  exit: '#3ce6a0',
  text: '#ffffff',
}

type Phase = 'preview' | 'flash' | 'fade' | 'play'

interface RTPlat {
  def: PlatDef
  id: string
  kind: 'safe' | 'hazard'
  revealed: boolean
  removed: boolean
  curX: number
  curY: number
  prevX: number
  prevY: number
}

interface RTSwitch {
  def: SwitchDef
  fired: boolean
  pulse: number
}

interface Star {
  x: number
  y: number
  r: number
  a: number
}

interface Crumb {
  x: number
  y: number
  t: number
}

/** Deterministic on/off test for a blinking platform. */
function blinkOn(blink: PlatBlink, t: number): boolean {
  const period = Math.max(0.05, blink.period)
  const frac = (((t / period + (blink.phase ?? 0)) % 1) + 1) % 1
  return frac < (blink.duty ?? 0.6)
}

/** 0..1 readiness meter used both for the timing ring and the ghost alpha. */
function blinkLevel(blink: PlatBlink, t: number): number {
  const period = Math.max(0.05, blink.period)
  const frac = (((t / period + (blink.phase ?? 0)) % 1) + 1) % 1
  const duty = blink.duty ?? 0.6
  if (frac < duty) return 1
  const off = (frac - duty) / Math.max(0.0001, 1 - duty)
  // ramps up over the last quarter of the off window as a "get ready" pulse
  return off < 0.75 ? 0 : (off - 0.75) / 0.25
}

class InvisiblePathRuntime implements GameRuntime {
  private hooks: GameHooks
  private player = new PlatformerPlayer()
  private particles = new ParticleSystem()
  private stars: Star[] = []

  private level!: LevelDef
  private index = 0
  private time = 0

  private phase: Phase = 'preview'
  private phaseT = 0

  private platforms: RTPlat[] = []
  private switches: RTSwitch[] = []
  private exit: Rect = { x: 0, y: 0, w: 40, h: 76 }

  private flashes = 0
  private revealT = 0
  private noFlashT = 0
  private spawnFlashT = 0

  private crumbs: Crumb[] = []
  private crumbTimer = 0
  private markers: Vec[] = []
  private carry: RTPlat | null = null
  private groundId: string | null = null
  private deathLock = false
  private hazardCued = false

  // --- survives same-level reloads (death / manual restart) -----------------
  private persistLevel = -1
  private persistCheckpoint: string | null = null
  private persistSwitches: boolean[] = []

  constructor(hooks: GameHooks) {
    this.hooks = hooks
    const rng = makeRng(20261015)
    for (let i = 0; i < 90; i++) {
      this.stars.push({ x: rng() * VIEW.w, y: rng() * VIEW.h, r: 0.6 + rng() * 1.6, a: 0.1 + rng() * 0.4 })
    }
  }

  // -------------------------------------------------------------------------
  // lifecycle
  // -------------------------------------------------------------------------

  load(level: number) {
    const same = level === this.persistLevel
    if (!same) {
      this.persistLevel = level
      this.persistCheckpoint = null
      this.persistSwitches = []
      this.markers = []
    }

    const def = invisiblePathLevels[clamp(level - 1, 0, invisiblePathLevels.length - 1)]
    this.index = level
    this.level = def
    this.time = 0
    this.phase = 'preview'
    this.phaseT = 0
    this.deathLock = false
    this.hazardCued = false
    this.flashes = def.flashes
    this.revealT = 0
    this.noFlashT = 0
    this.spawnFlashT = 0
    this.crumbs = []
    this.crumbTimer = 0
    this.carry = null
    this.groundId = null
    this.particles.clear()
    this.player = new PlatformerPlayer()

    const defs = def.platforms
    this.platforms = defs.map((p) => {
      const revealed = !(p.hidden ?? false)
      return {
        def: p,
        id: p.id,
        kind: p.kind === 'hazard' ? 'hazard' : 'safe',
        revealed,
        removed: false,
        curX: p.x,
        curY: p.y,
        prevX: p.x,
        prevY: p.y,
      }
    })

    this.switches = (def.switches ?? []).map((s, i) => ({
      def: s,
      fired: same ? this.persistSwitches[i] ?? false : false,
      pulse: 0,
    }))
    if (!same) this.persistSwitches = this.switches.map(() => false)
    this.applyFired()

    this.exit = { ...def.exit }
    this.persistCheckpoint = same ? this.persistCheckpoint : null
    this.spawnAt(this.persistCheckpoint)
    this.hooks.sound('blip')
  }

  /** Re-apply every switch that has already been thrown this attempt chain. */
  private applyFired() {
    for (const sw of this.switches) {
      if (!sw.fired) continue
      this.applyOne(sw.def)
    }
  }

  private applyOne(def: SwitchDef) {
    for (const id of def.reveal ?? []) {
      const p = this.platforms.find((q) => q.id === id)
      if (p) {
        p.revealed = true
        p.removed = false
      }
    }
    for (const id of def.retire ?? []) {
      const p = this.platforms.find((q) => q.id === id)
      if (p) p.removed = true
    }
  }

  private spawnAt(id: string | null) {
    if (id) {
      const p = this.platforms.find((q) => q.id === id && q.kind === 'safe')
      if (p) {
        this.player.reset(p.def.x + p.def.w / 2 - this.player.w / 2, p.def.y - this.player.h - 1)
        this.spawnFlashT = 1.2
        return
      }
    }
    this.player.reset(this.level.start.x, this.level.start.y)
  }

  private isActive(p: RTPlat): boolean {
    if (!p.revealed || p.removed) return false
    if (p.def.blink && !blinkOn(p.def.blink, this.time)) return false
    return true
  }

  private playerRect(): Rect {
    const p = this.player
    return { x: p.x, y: p.y, w: p.w, h: p.h }
  }

  private die(msg?: string) {
    if (this.deathLock) return
    this.deathLock = true
    this.markers.push({ x: this.player.centerX, y: this.player.centerY })
    if (this.markers.length > 24) this.markers.splice(0, this.markers.length - 24)
    this.hooks.shake(0.35)
    this.hooks.death(msg)
  }

  // -------------------------------------------------------------------------
  // simulation
  // -------------------------------------------------------------------------

  update(dt: number, input: InputState) {
    if (this.deathLock) return
    this.time += dt

    // --- phase clock -------------------------------------------------------
    if (this.phase === 'preview') {
      this.phaseT += dt
      if (!this.hazardCued && this.phaseT >= 0.45) {
        this.hazardCued = true
        if (this.platforms.some((p) => p.kind === 'hazard')) this.hooks.sound('hit')
      }
      if (this.phaseT >= this.level.preview) {
        this.phase = 'flash'
        this.phaseT = 0
        this.hooks.sound('flip')
      }
    } else if (this.phase === 'flash') {
      this.phaseT += dt
      if (this.phaseT >= FLASH_TIME) {
        this.phase = 'fade'
        this.phaseT = 0
      }
    } else if (this.phase === 'fade') {
      this.phaseT += dt
      if (this.phaseT >= FADE_TIME) {
        this.phase = 'play'
        this.phaseT = 0
        this.hooks.sound('click')
        if (!this.hooks.reducedMotion) this.emitVanish()
      }
    }

    this.revealT = Math.max(0, this.revealT - dt)
    this.noFlashT = Math.max(0, this.noFlashT - dt)
    for (const sw of this.switches) sw.pulse = Math.max(0, sw.pulse - dt * 1.6)

    // --- platform motion (runs during preview too, so drift is observable) --
    for (const p of this.platforms) {
      p.prevX = p.curX
      p.prevY = p.curY
      const m = p.def.move
      if (m) {
        const ph = (this.time / Math.max(0.05, m.period) + (m.phase ?? 0)) * Math.PI * 2
        p.curX = p.def.x + Math.sin(ph) * m.dx
        p.curY = p.def.y + Math.sin(ph) * m.dy
      } else {
        p.curX = p.def.x
        p.curY = p.def.y
      }
    }

    if (this.phase !== 'play') return
    this.spawnFlashT = Math.max(0, this.spawnFlashT - dt)

    // --- recall ------------------------------------------------------------
    if (input.actionPressed) {
      if (this.flashes > 0 && this.revealT <= 0.05) {
        this.flashes -= 1
        this.revealT = RECALL_TIME
        this.hooks.sound('blip')
        this.hooks.shake(0.12)
      } else if (this.flashes <= 0) {
        this.noFlashT = 0.7
        this.hooks.sound('click')
      }
    }

    // --- carry the player on a moving platform -----------------------------
    if (this.carry && this.player.onGround) {
      this.player.x += this.carry.curX - this.carry.prevX
      this.player.y += this.carry.curY - this.carry.prevY
    }

    const solids: Solid[] = this.platforms.map((p) => ({
      x: p.curX,
      y: p.curY,
      w: p.def.w,
      h: p.def.h,
      active: this.isActive(p),
      tag: p.id,
    }))

    const prevPr = this.playerRect()
    const wasGround = this.player.onGround
    // Substep fast motion so a quick fall cannot tunnel through a thin slab.
    const steps = clamp(Math.ceil((Math.abs(this.player.vy) * dt) / 8), 1, 5)
    let res = this.player.step(dt / steps, input, solids)
    for (let i = 1; i < steps; i++) res = this.player.step(dt / steps, input, solids)
    this.groundId = res.ground?.tag ?? null
    this.carry = this.groundId ? this.platforms.find((p) => p.id === this.groundId) ?? null : null

    if (input.jumpPressed && wasGround) this.hooks.sound('jump')
    if (!wasGround && res.onGround && !this.hooks.reducedMotion) this.emitLand()

    // --- switches ----------------------------------------------------------
    const pr = this.playerRect()
    for (let i = 0; i < this.switches.length; i++) {
      const sw = this.switches[i]
      if (sw.fired) continue
      if (rectsOverlap(pr, { x: sw.def.x, y: sw.def.y, w: sw.def.w, h: sw.def.h })) {
        if (input.actionPressed) {
          sw.fired = true
          sw.pulse = 1
          this.persistSwitches[i] = true
          this.applyOne(sw.def)
          this.revealT = Math.max(this.revealT, 1.0)
          this.hooks.sound('unlock')
          this.hooks.shake(0.4)
          if (!this.hooks.reducedMotion) this.emitSwitch(sw.def.x + sw.def.w / 2, sw.def.y)
        }
      }
    }

    // --- lethal platforms --------------------------------------------------
    // Sample a few points along the movement so a fast frame cannot skip a slab.
    const curPr = this.playerRect()
    for (const p of this.platforms) {
      if (p.kind !== 'hazard' || !this.isActive(p)) continue
      const hr: Rect = { x: p.curX - 2, y: p.curY - 2, w: p.def.w + 4, h: p.def.h + 4 }
      for (let s = 0; s <= 4; s++) {
        const t = s / 4
        const probe: Rect = {
          x: prevPr.x + (curPr.x - prevPr.x) * t,
          y: prevPr.y + (curPr.y - prevPr.y) * t,
          w: curPr.w,
          h: curPr.h,
        }
        if (rectsOverlap(probe, hr)) {
          this.die('That slab was never safe.')
          return
        }
      }
    }

    // --- checkpoints -------------------------------------------------------
    for (const p of this.platforms) {
      if (!p.def.checkpoint || !this.isActive(p)) continue
      const near = rectsOverlap(pr, { x: p.curX - 2, y: p.curY - 6, w: p.def.w + 4, h: p.def.h + 8 })
      if ((near || this.groundId === p.id) && this.persistCheckpoint !== p.id) {
        this.persistCheckpoint = p.id
        this.hooks.sound('checkpoint')
        this.hooks.shake(0.18)
        if (!this.hooks.reducedMotion) this.emitCheckpoint(p.curX + p.def.w / 2, p.curY)
      }
    }

    // --- exit --------------------------------------------------------------
    if (rectsOverlap(pr, this.exit)) {
      this.hooks.sound('win')
      this.hooks.complete()
      return
    }

    // --- out of the world --------------------------------------------------
    if (this.player.y > FALL_Y) {
      this.die('The dark swallowed you.')
      return
    }

    // --- breadcrumbs -------------------------------------------------------
    this.crumbTimer += dt
    if (this.crumbTimer >= 0.1) {
      this.crumbTimer = 0
      this.crumbs.push({ x: this.player.centerX, y: this.player.centerY, t: this.time })
      if (this.crumbs.length > 120) this.crumbs.shift()
    }
    if (this.crumbs.length && this.crumbs[0].t < this.time - 2.4) {
      this.crumbs = this.crumbs.filter((c) => c.t >= this.time - 2.4)
    }

    this.particles.update(dt)
  }

  focus(): Vec {
    return { x: this.player.centerX, y: this.player.centerY }
  }

  destroy() {
    this.particles.clear()
  }

  // -------------------------------------------------------------------------
  // particle helpers
  // -------------------------------------------------------------------------

  private emitLand() {
    this.particles.emit(this.player.centerX, this.player.y + this.player.h, 6, {
      colors: [theme.solidTop, theme.accent2],
      speed: 90,
      life: 0.3,
      size: 3,
      gravity: 500,
      shape: 'circle',
    })
  }

  private emitVanish() {
    for (const p of this.platforms) {
      if (!p.revealed || p.removed) continue
      this.particles.emit(p.curX + p.def.w / 2, p.curY + p.def.h / 2, 4, {
        colors: p.kind === 'hazard' ? [theme.hazard] : [theme.accent, theme.solidTop],
        speed: 70,
        life: 0.4,
        size: 3,
        gravity: -40,
        shape: 'circle',
      })
    }
  }

  private emitSwitch(x: number, y: number) {
    this.particles.emit(x, y, 18, {
      colors: [theme.accent, theme.accent2, '#ffffff'],
      speed: 180,
      life: 0.6,
      size: 4,
      gravity: 260,
      shape: 'circle',
    })
  }

  private emitCheckpoint(x: number, y: number) {
    this.particles.emit(x, y, 14, {
      colors: [theme.accent2, '#ffffff'],
      speed: 140,
      life: 0.6,
      size: 4,
      gravity: 200,
      shape: 'circle',
    })
  }

  // -------------------------------------------------------------------------
  // render
  // -------------------------------------------------------------------------

  private platformAlpha(): number {
    if (this.phase === 'preview') return 1
    if (this.phase === 'flash') return 0.72 + 0.28 * Math.abs(Math.sin(this.phaseT * 26))
    if (this.phase === 'fade') return 1 - clamp(this.phaseT / FADE_TIME, 0, 1)
    return this.revealT > 0 ? clamp(this.revealT / 0.18, 0, 1) : 0
  }

  private routeAlpha(): number {
    if (this.phase === 'preview' || this.phase === 'flash') return 1
    if (this.phase === 'fade') return 1 - clamp(this.phaseT / FADE_TIME, 0, 1)
    return this.revealT > 0 ? clamp(this.revealT / 0.18, 0, 1) * 0.85 : 0
  }

  render(g: CanvasRenderingContext2D, w: number, h: number) {
    g.fillStyle = theme.bg
    g.fillRect(0, 0, w, h)
    this.drawBackdrop(g, w, h)
    drawGrid(g, w, h, 48, 'rgba(140,120,255,0.045)')

    const playing = this.phase === 'play'
    const base = this.platformAlpha()

    // switches sit above the world, always visible (they are landmarks)
    for (const sw of this.switches) this.drawSwitch(g, sw)

    this.drawExit(g)

    // platforms
    for (const p of this.platforms) {
      if (!p.revealed || p.removed) {
        if (!playing) this.drawFuture(g, p, this.routeAlpha() * 0.75)
        continue
      }
      let a = base
      if (a < 0.02 && playing) {
        if (p.def.blink) a = 0.07 + blinkLevel(p.def.blink, this.time) * 0.26
        else if (p.def.ghost || p.def.move) a = 0.18
        else if (p.def.floor) a = 0.07
      }
      if (a < 0.02 && !playing && this.phase !== 'fade') a = base
      if (a > 0.02) {
        if (p.kind === 'hazard') this.drawHazard(g, p.curX, p.curY, p.def.w, p.def.h, a)
        else this.drawSafe(g, p.curX, p.curY, p.def.w, p.def.h, a, !!p.def.floor)
      }
      if (p.def.blink) this.drawBlinkRing(g, p, Math.max(a, 0.35))
    }

    this.drawRoute(g)
    this.drawCheckpoints(g)
    this.drawMarkers(g)
    this.drawCrumbs(g)
    this.drawPlayer(g)
    this.particles.render(g)
    this.drawHud(g, w)
  }

  // -------------------------------------------------------------------------
  // world drawing
  // -------------------------------------------------------------------------

  private drawBackdrop(g: CanvasRenderingContext2D, w: number, h: number) {
    const grad = g.createRadialGradient(w * 0.5, h * 0.42, 30, w * 0.5, h * 0.42, w * 0.72)
    grad.addColorStop(0, 'rgba(94,72,180,0.20)')
    grad.addColorStop(0.5, 'rgba(60,40,120,0.08)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)

    // a slow, watchful eye — the game's memory motif
    const cx = w * 0.5
    const cy = h * 0.44
    const pulse = this.hooks.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 0.9)
    g.save()
    g.strokeStyle = `rgba(139,124,255,${0.05 + pulse * 0.05})`
    g.lineWidth = 2
    g.beginPath()
    g.ellipse(cx, cy, 250, 108, 0, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.ellipse(cx, cy, 232, 92, 0, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = `rgba(47,224,200,${0.025 + pulse * 0.03})`
    g.beginPath()
    g.arc(cx, cy, 46, 0, Math.PI * 2)
    g.fill()
    g.restore()

    // deterministic starfield
    for (const s of this.stars) {
      g.globalAlpha = this.hooks.reducedMotion ? s.a : s.a * (0.5 + 0.5 * Math.sin(this.time * 1.8 + s.x))
      g.fillStyle = '#cfc6ff'
      g.fillRect(s.x, s.y, s.r, s.r)
    }
    g.globalAlpha = 1

    // vignette
    const vg = g.createRadialGradient(w * 0.5, h * 0.5, h * 0.42, w * 0.5, h * 0.5, h * 0.95)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, 'rgba(0,0,0,0.55)')
    g.fillStyle = vg
    g.fillRect(0, 0, w, h)
  }

  private drawSafe(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    pw: number,
    ph: number,
    a: number,
    floor: boolean,
  ) {
    g.globalAlpha = a
    if (floor) {
      fillRoundRect(g, x, y, pw, ph, 3, theme.solid)
      g.fillStyle = theme.solidTop
      g.fillRect(x + 2, y, Math.max(0, pw - 4), 4)
    } else {
      fillRoundRect(g, x, y, pw, ph, 5, theme.solid)
      g.fillStyle = theme.solidTop
      g.fillRect(x + 3, y, Math.max(0, pw - 6), 3)
      // smooth dotted spine — the "safe" tell
      g.fillStyle = 'rgba(196,180,255,0.55)'
      for (let dx = 9; dx < pw - 7; dx += 14) g.fillRect(x + dx, y + 7, 2, 2)
      g.strokeStyle = 'rgba(160,140,255,0.18)'
      g.lineWidth = 1
      g.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1)
    }
    g.globalAlpha = 1
  }

  private drawHazard(g: CanvasRenderingContext2D, x: number, y: number, pw: number, ph: number, a: number) {
    g.globalAlpha = a
    fillRoundRect(g, x, y, pw, ph, 3, '#3a0f1a')
    // diagonal hatch — the "deadly" tell
    g.save()
    g.beginPath()
    g.rect(x, y, pw, ph)
    g.clip()
    g.strokeStyle = 'rgba(255,77,94,0.55)'
    g.lineWidth = 2
    for (let i = -ph; i < pw + ph; i += 9) {
      g.beginPath()
      g.moveTo(x + i, y)
      g.lineTo(x + i + ph, y + ph)
      g.stroke()
    }
    g.restore()
    // jagged spikes along the top
    g.fillStyle = theme.hazard
    const count = Math.max(2, Math.floor(pw / 12))
    const cw = pw / count
    for (let i = 0; i < count; i++) {
      const sx = x + cw * i
      g.beginPath()
      g.moveTo(sx, y + ph * 0.62)
      g.lineTo(sx + cw * 0.5, y - 1)
      g.lineTo(sx + cw, y + ph * 0.62)
      g.closePath()
      g.fill()
    }
    g.globalAlpha = 1
  }

  private drawFuture(g: CanvasRenderingContext2D, p: RTPlat, a: number) {
    if (a <= 0.02) return
    g.save()
    g.globalAlpha = a * 0.55
    g.setLineDash([5, 5])
    g.strokeStyle = theme.accent2
    g.lineWidth = 1.5
    roundRect(g, p.curX, p.curY, p.def.w, p.def.h, 4)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = theme.accent2
    g.font = '700 11px "Arial Black", Arial, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('?', p.curX + p.def.w / 2, p.curY + p.def.h / 2)
    g.restore()
    g.globalAlpha = 1
  }

  private drawBlinkRing(g: CanvasRenderingContext2D, p: RTPlat, a: number) {
    const blink = p.def.blink
    if (!blink) return
    const cx = p.curX + p.def.w / 2
    const cy = p.curY + p.def.h / 2
    const frac = (((this.time / Math.max(0.05, blink.period) + (blink.phase ?? 0)) % 1) + 1) % 1
    const on = frac < (blink.duty ?? 0.6)
    g.save()
    g.globalAlpha = clamp(a, 0, 1) * 0.8
    g.strokeStyle = on ? theme.accent2 : 'rgba(47,224,200,0.35)'
    g.lineWidth = 2
    g.beginPath()
    g.arc(cx, cy, 9, 0, Math.PI * 2)
    g.stroke()
    g.strokeStyle = on ? '#ffffff' : 'rgba(255,255,255,0.5)'
    g.beginPath()
    g.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
    g.stroke()
    g.restore()
    g.globalAlpha = 1
  }

  private drawSwitch(g: CanvasRenderingContext2D, sw: RTSwitch) {
    const { x, y, w: sw_, h: sh } = sw.def
    const on = sw.fired
    if (sw.pulse > 0) {
      g.save()
      g.globalAlpha = sw.pulse * 0.5
      g.strokeStyle = theme.accent2
      g.lineWidth = 3
      g.beginPath()
      g.arc(x + sw_ / 2, y + sh / 2, 14 + (1 - sw.pulse) * 26, 0, Math.PI * 2)
      g.stroke()
      g.restore()
    }
    g.save()
    g.shadowColor = on ? 'rgba(47,224,200,0.7)' : 'rgba(139,124,255,0.7)'
    g.shadowBlur = 16
    fillRoundRect(g, x, y, sw_, sh, 6, on ? '#123a34' : '#241d3f')
    g.restore()
    strokeRoundRect(g, x, y, sw_, sh, 6, on ? theme.accent2 : theme.accent, 2)
    // lever
    g.fillStyle = on ? theme.accent2 : theme.accent
    const leverX = x + sw_ / 2
    const leverTop = on ? y + 6 : y + sh - 8
    g.fillRect(leverX - 2, leverTop, 4, Math.abs(y + sh - 6 - leverTop) + 1)
    g.beginPath()
    g.arc(leverX, on ? y + 6 : y + sh - 6, 4, 0, Math.PI * 2)
    g.fill()
    if (!on) {
      label(g, sw.def.hint ?? 'E', leverX, y - 10, { size: 12, color: theme.text, align: 'center', weight: '800' })
    }
  }

  private drawExit(g: CanvasRenderingContext2D) {
    const r = this.exit
    const pulse = this.hooks.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 2.4)
    g.save()
    g.shadowColor = 'rgba(60,230,160,0.6)'
    g.shadowBlur = 22 + pulse * 12
    fillRoundRect(g, r.x, r.y, r.w, r.h, 5, '#0f2f26')
    g.restore()
    strokeRoundRect(g, r.x, r.y, r.w, r.h, 5, theme.exit, 2)
    g.fillStyle = `rgba(60,230,160,${0.14 + pulse * 0.12})`
    g.fillRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10)
    g.fillStyle = theme.exit
    g.beginPath()
    g.moveTo(r.x + r.w * 0.36, r.y + r.h * 0.36)
    g.lineTo(r.x + r.w * 0.66, r.y + r.h * 0.5)
    g.lineTo(r.x + r.w * 0.36, r.y + r.h * 0.64)
    g.closePath()
    g.fill()
  }

  private drawRoute(g: CanvasRenderingContext2D) {
    const a = this.routeAlpha()
    if (a <= 0.02) return
    const pts = this.level.route
    g.save()
    g.globalAlpha = a * 0.7
    g.strokeStyle = theme.accent
    g.lineWidth = 2
    g.setLineDash([4, 8])
    g.lineCap = 'round'
    g.beginPath()
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) g.moveTo(pts[i].x, pts[i].y)
      else g.lineTo(pts[i].x, pts[i].y)
    }
    g.stroke()
    g.setLineDash([])
    // node dots
    for (const pt of pts) {
      g.fillStyle = theme.accent2
      g.beginPath()
      g.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2)
      g.fill()
    }
    // arrowheads mid-segment
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].x
      const ay = pts[i].y
      const bx = pts[i + 1].x
      const by = pts[i + 1].y
      const mx = (ax + bx) / 2
      const my = (ay + by) / 2
      this.drawArrow(g, mx, my, Math.atan2(by - ay, bx - ax))
    }
    g.restore()
    g.globalAlpha = 1
  }

  private drawArrow(g: CanvasRenderingContext2D, x: number, y: number, ang: number) {
    g.save()
    g.translate(x, y)
    g.rotate(ang)
    g.fillStyle = theme.accent
    g.beginPath()
    g.moveTo(7, 0)
    g.lineTo(-4, -4)
    g.lineTo(-4, 4)
    g.closePath()
    g.fill()
    g.restore()
  }

  private drawCheckpoints(g: CanvasRenderingContext2D) {
    for (const p of this.platforms) {
      if (!p.def.checkpoint) continue
      const cx = p.curX + p.def.w / 2
      const cy = p.curY + p.def.h / 2
      const reached = this.persistCheckpoint === p.id
      const show = reached || this.phase !== 'play'
      if (!show) continue
      const pulse = this.hooks.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 3)
      g.save()
      g.globalAlpha = reached ? 0.95 : 0.6
      g.translate(cx, cy)
      g.rotate(Math.PI / 4)
      g.fillStyle = reached ? theme.accent2 : 'rgba(47,224,200,0.35)'
      g.shadowColor = 'rgba(47,224,200,0.8)'
      g.shadowBlur = reached ? 12 + pulse * 8 : 0
      g.fillRect(-5, -5, 10, 10)
      g.restore()
      g.globalAlpha = 1
    }
  }

  private drawMarkers(g: CanvasRenderingContext2D) {
    g.save()
    g.strokeStyle = 'rgba(255,90,110,0.35)'
    g.lineWidth = 2
    for (const m of this.markers) {
      g.beginPath()
      g.moveTo(m.x - 5, m.y - 5)
      g.lineTo(m.x + 5, m.y + 5)
      g.moveTo(m.x + 5, m.y - 5)
      g.lineTo(m.x - 5, m.y + 5)
      g.stroke()
    }
    g.restore()
  }

  private drawCrumbs(g: CanvasRenderingContext2D) {
    if (this.phase !== 'play' || this.hooks.reducedMotion) return
    for (const c of this.crumbs) {
      const age = clamp(1 - (this.time - c.t) / 2.4, 0, 1)
      g.globalAlpha = age * 0.22
      g.fillStyle = theme.player
      g.beginPath()
      g.arc(c.x, c.y, 2.5, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  }

  private drawPlayer(g: CanvasRenderingContext2D) {
    const p = this.player
    const stretch = clamp(p.vy / 1400, -0.3, 0.3)
    const sx = 1 - stretch
    const sy = 1 + stretch
    g.save()
    g.translate(p.centerX, p.y + p.h)
    g.scale(sx, sy)
    g.shadowColor = 'rgba(139,124,255,0.7)'
    g.shadowBlur = 14
    fillRoundRect(g, -p.w / 2, -p.h, p.w, p.h, 6, theme.player)
    g.shadowBlur = 0
    g.fillStyle = '#241a33'
    const dir = p.facing
    g.fillRect(-4 + dir * 2, -p.h + 11, 3, 5)
    g.fillRect(2 + dir * 2, -p.h + 11, 3, 5)
    g.restore()
  }

  // -------------------------------------------------------------------------
  // hud
  // -------------------------------------------------------------------------

  private drawHud(g: CanvasRenderingContext2D, w: number) {
    label(g, `LEVEL ${this.index}`, 18, 26, { size: 12, color: 'rgba(200,190,255,0.6)', weight: '800' })
    label(g, this.level.name, 18, 47, { size: 18, color: theme.text })
    label(g, this.level.hint, 18, 67, { size: 12, color: 'rgba(220,215,255,0.6)', weight: '500' })

    // recall pips
    const total = Math.max(this.level.flashes, this.flashes)
    const px = w - 20
    label(g, 'RECALL', px, 26, { size: 11, color: 'rgba(200,190,255,0.6)', align: 'right', weight: '800' })
    for (let i = 0; i < total; i++) {
      const filled = i < this.flashes
      const x = px - 8 - i * 18
      g.save()
      g.translate(x, 42)
      g.rotate(Math.PI / 4)
      g.fillStyle = filled ? theme.accent2 : 'rgba(255,255,255,0.12)'
      if (filled) {
        g.shadowColor = 'rgba(47,224,200,0.8)'
        g.shadowBlur = 8
      }
      g.fillRect(-5, -5, 10, 10)
      g.restore()
    }

    if (this.phase === 'preview') {
      const remain = Math.max(0, this.level.preview - this.phaseT)
      this.banner(g, 'MEMORISE THE PATH', theme.accent)
      const bw = 260
      const bx = (w - bw) / 2
      const by = 301
      g.fillStyle = 'rgba(255,255,255,0.12)'
      fillRoundRect(g, bx, by, bw, 6, 3, 'rgba(255,255,255,0.12)')
      fillRoundRect(g, bx, by, bw * (1 - remain / Math.max(0.01, this.level.preview)), 6, 3, theme.accent)
      this.legend(g, w)
    } else if (this.phase === 'flash') {
      this.banner(g, 'GET READY', theme.hazard)
    } else if (this.phase === 'fade') {
      this.banner(g, 'GO', theme.exit)
    } else if (this.spawnFlashT > 0) {
      this.banner(g, 'CHECKPOINT', theme.accent2)
    }

    if (this.phase === 'play') {
      const msg = this.noFlashT > 0 ? 'OUT OF RECALLS' : this.flashes > 0 ? 'E / J  -  RECALL' : 'NO RECALLS LEFT'
      const col = this.noFlashT > 0 || this.flashes <= 0 ? 'rgba(255,120,140,0.85)' : 'rgba(200,190,255,0.55)'
      label(g, msg, w / 2, 524, { size: 13, color: col, align: 'center', weight: '700' })
    }
  }

  private legend(g: CanvasRenderingContext2D, w: number) {
    const bx = w / 2 - 190
    const by = 322
    fillRoundRect(g, bx, by, 380, 34, 8, 'rgba(15,12,28,0.72)')
    // safe swatch
    fillRoundRect(g, bx + 14, by + 12, 40, 10, 3, theme.solid)
    g.fillStyle = theme.solidTop
    g.fillRect(bx + 16, by + 12, 36, 2)
    label(g, 'smooth  =  safe', bx + 62, by + 22, { size: 11, color: 'rgba(220,215,255,0.85)', weight: '600' })
    // hazard swatch
    fillRoundRect(g, bx + 200, by + 12, 40, 10, 2, '#3a0f1a')
    g.fillStyle = theme.hazard
    g.beginPath()
    g.moveTo(bx + 200, by + 22)
    g.lineTo(bx + 206, by + 12)
    g.lineTo(bx + 212, by + 22)
    g.lineTo(bx + 218, by + 12)
    g.lineTo(bx + 224, by + 22)
    g.lineTo(bx + 230, by + 12)
    g.lineTo(bx + 236, by + 22)
    g.closePath()
    g.fill()
    label(g, 'jagged  =  deadly', bx + 248, by + 22, { size: 11, color: 'rgba(255,180,190,0.9)', weight: '600' })
  }

  private banner(g: CanvasRenderingContext2D, text: string, color: string) {
    const w = VIEW.w
    g.fillStyle = 'rgba(8,6,16,0.62)'
    g.fillRect(0, 250, w, 46)
    label(g, text, w / 2, 282, { size: 22, color, align: 'center', weight: '800', glow: color })
  }
}

export const game: GameModule = {
  slug: 'invisible-path',
  title: 'Invisible Path',
  tagline: 'See the path once. Then walk it blind.',
  theme,
  controls: [
    { keys: 'A / D  or  ← / →', label: 'Move' },
    { keys: 'W / ↑ / Space', label: 'Jump' },
    { keys: 'E / J / Enter', label: 'Recall the path' },
    { keys: 'R', label: 'Restart' },
    { keys: 'Esc', label: 'Pause' },
  ],
  instructions: [
    'Every level opens with a preview - memorise the safe route.',
    'Then the platforms turn invisible. Smooth slabs are safe; jagged ones are deadly.',
    'Press E to flash the path back for a heartbeat. You only get a few.',
    'Step on glowing runes to bank a checkpoint. Deaths keep it.',
  ],
  levels: invisiblePathLevels.length,
  view: VIEW,
  create: (hooks) => new InvisiblePathRuntime(hooks),
}

export default game
