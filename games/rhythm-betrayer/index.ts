import { drawGrid, fillRoundRect, label, roundRect, strokeRoundRect } from '@/lib/game/draw'
import { circleRect, clamp, rectsOverlap } from '@/lib/game/math'
import { ParticleSystem } from '@/lib/game/particles'
import { PlatformerPlayer, type Solid } from '@/lib/game/platformer'
import type { GameHooks, GameModule, GameRuntime, GameTheme, InputState, Rect, Vec } from '@/lib/game/types'
import { rbLevels } from './levels'
import type { RBHazard, RBLevel, RBMove, RBSolid, RBSweep, RBWindow } from './types'

const VIEW = { w: 960, h: 540 }
const GROUND = 480
const LEAD_BEATS = 4
const WARN_BEATS = 3
const PIPS = 8
const frac = (v: number) => v - Math.floor(v)

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

interface RTSolid extends RBSolid {
  curX: number
  curY: number
  prevX: number
  prevY: number
  active: boolean
  expiring: boolean
  /** beat at which an unstable platform was armed (-1 = never) */
  armedBeat: number
  /** true once an unstable platform has fallen away */
  dropped: boolean
}

interface RTHazard extends RBHazard {
  curX: number
  curY: number
  active: boolean
  telegraph: boolean
  /** true once a trip hazard has been armed by the player's position */
  tripped: boolean
  /** beat at which the trip hazard was armed */
  tripBeat: number
}

class RhythmRuntime implements GameRuntime {
  private hooks: GameHooks
  private player = new PlatformerPlayer()
  private particles = new ParticleSystem()
  private index = 1
  private level!: RBLevel
  private solids: RTSolid[] = []
  private hazards: RTHazard[] = []
  private exit: Rect = { x: 0, y: 0, w: 0, h: 0 }
  private decoy: Rect | null = null
  private ground: RTSolid | null = null

  private time = 0
  private beatPos = 0
  private beatIndex = 0
  private beatFrac = 0
  private lastBeat = -1
  private currentBpm = 120
  private tempoDone: boolean[] = []
  private tempoWarnPlayed: boolean[] = []
  private tempoWarn = false
  private tempoDir: 1 | -1 = 1
  private tempoFlash = 0

  private exitOpen = true
  private doorPulse = 0

  constructor(hooks: GameHooks) {
    this.hooks = hooks
  }

  load(level: number) {
    const def = rbLevels[clamp(level - 1, 0, rbLevels.length - 1)]
    this.index = clamp(level, 1, rbLevels.length)
    this.level = def
    this.time = 0
    this.beatPos = 0
    this.beatIndex = 0
    this.beatFrac = 0
    this.lastBeat = -1
    this.currentBpm = def.bpm
    this.tempoDone = (def.tempo ?? []).map(() => false)
    this.tempoWarnPlayed = (def.tempo ?? []).map(() => false)
    this.tempoWarn = false
    this.tempoFlash = 0
    this.ground = null
    this.doorPulse = 0
    this.exitOpen = !def.exitWindow || this.inWindow(def.exitWindow, 0)
    this.particles.clear()
    this.player = new PlatformerPlayer()
    this.player.reset(def.start.x, def.start.y)
    this.solids = def.solids.map((s) => ({
      ...s,
      curX: s.x,
      curY: s.y,
      prevX: s.x,
      prevY: s.y,
      active: true,
      expiring: false,
      armedBeat: -1,
      dropped: false,
    }))
    this.hazards = def.hazards.map((h) => ({
      ...h,
      curX: h.x,
      curY: h.y,
      active: true,
      telegraph: false,
      tripped: false,
      tripBeat: -1,
    }))
    this.exit = { ...def.exit }
    this.decoy = def.decoy ? { ...def.decoy } : null
  }

  // ---- beat helpers -------------------------------------------------------

  private inWindow(w: RBWindow, bp: number): boolean {
    const p = w.period
    const x = (((bp + (w.phase ?? 0)) % p) + p) % p
    return x < w.on
  }

  /** true while `w` is on and will switch off within `look` beats. */
  private turnsOffSoon(w: RBWindow, bp: number, look: number): boolean {
    const p = w.period
    const x = (((bp + (w.phase ?? 0)) % p) + p) % p
    return x < w.on && w.on - x <= look
  }

  /** true while `w` is off and will switch on within `look` beats. */
  private turnsOnSoon(w: RBWindow, bp: number, look: number): boolean {
    const p = w.period
    const x = (((bp + (w.phase ?? 0)) % p) + p) % p
    return x >= w.on && p - x <= look
  }

  /** beats elapsed since a trip hazard was armed (wrapped when it cycles). */
  private tripRel(h: RTHazard): number {
    const t = h.trip!
    const raw = this.beatPos - h.tripBeat
    if (t.cycle) return ((raw % t.cycle) + t.cycle) % t.cycle
    return raw
  }

  private moveOffset(m?: RBMove, sweep?: RBSweep): Vec {
    let ox = 0
    let oy = 0
    if (m) {
      let t: number
      if (m.mode === 'pulse') {
        t = this.inWindow({ period: m.period, on: m.period / 2, phase: m.phase ?? 0 }, this.beatPos) ? 1 : 0
      } else {
        t = Math.sin((this.beatPos / m.period + (m.phase ?? 0)) * Math.PI * 2)
      }
      ox += (m.dx ?? 0) * t
      oy += (m.dy ?? 0) * t
    }
    if (sweep) {
      const u = frac(this.beatPos / sweep.period + (sweep.phase ?? 0))
      const tri = u < 0.5 ? u * 2 : 2 - u * 2
      const pos = tri * sweep.range
      if (sweep.axis === 'x') ox += pos
      else oy += pos
    }
    return { x: ox, y: oy }
  }

  private updateTempo(dt: number) {
    const list = this.level.tempo
    this.tempoWarn = false
    if (list) {
      for (let i = 0; i < list.length; i++) {
        if (this.tempoDone[i]) continue
        const t = list[i]
        if (this.beatPos >= t.at) {
          this.tempoDone[i] = true
          this.tempoDir = t.bpm > this.currentBpm ? 1 : -1
          this.currentBpm = t.bpm
          this.tempoFlash = 1
          this.hooks.sound('unlock')
          if (!this.hooks.reducedMotion) this.hooks.shake(0.3)
        } else if (this.beatPos >= t.at - WARN_BEATS) {
          this.tempoWarn = true
          this.tempoDir = t.bpm > this.currentBpm ? 1 : -1
          if (!this.tempoWarnPlayed[i]) {
            this.tempoWarnPlayed[i] = true
            this.hooks.sound('checkpoint')
          }
        }
      }
    }
    if (this.tempoFlash > 0) this.tempoFlash = Math.max(0, this.tempoFlash - dt * 1.6)
  }

  private playerRect(): Rect {
    const p = this.player
    return { x: p.x, y: p.y, w: p.w, h: p.h }
  }

  private die(msg?: string) {
    const p = this.player
    if (!this.hooks.reducedMotion) {
      this.particles.emit(p.centerX, p.centerY, 20, {
        colors: [theme.hazard, theme.accent2, theme.accent],
        speed: 240,
        life: 0.6,
        gravity: 800,
        shape: 'square',
      })
      this.hooks.shake(0.7)
    }
    this.hooks.sound('death')
    this.hooks.death(msg)
  }

  // ---- simulation ---------------------------------------------------------

  update(dt: number, input: InputState) {
    const p = this.player
    this.time += dt
    this.beatPos += (dt * this.currentBpm) / 60
    this.beatIndex = Math.floor(this.beatPos)
    this.beatFrac = this.beatPos - this.beatIndex
    if (this.beatIndex !== this.lastBeat) {
      this.lastBeat = this.beatIndex
      this.hooks.sound('blip')
    }
    this.updateTempo(dt)

    const lead = this.beatPos < LEAD_BEATS
    const eff: InputState = lead
      ? { ...input, left: false, right: false, up: false, down: false, jump: false, jumpPressed: false, action: false, actionPressed: false }
      : input

    // move solids + hazards on the beat grid
    for (const s of this.solids) {
      s.prevX = s.curX
      s.prevY = s.curY
      const o = this.moveOffset(s.move)
      s.curX = s.x + o.x
      s.curY = s.y + o.y
      s.active = (s.window ? this.inWindow(s.window, this.beatPos) : true) && !s.dropped
      const armed = !!s.unstable && s.armedBeat >= 0 && !s.dropped
      s.expiring =
        (!!s.window && s.active && this.turnsOffSoon(s.window, this.beatPos, 0.5)) ||
        (armed && this.beatPos - s.armedBeat >= (s.unstable!.warn) - 0.5)
    }
    for (const h of this.hazards) {
      const o = this.moveOffset(h.move, h.sweep)
      h.curX = h.x + o.x
      h.curY = h.y + o.y
      const was = h.active
      let active = h.window ? this.inWindow(h.window, this.beatPos) : true
      let telegraph = !!h.window && !active && this.turnsOnSoon(h.window, this.beatPos, 1)
      if (h.trip) {
        if (!h.tripped && p.centerX > h.trip.at) {
          h.tripped = true
          h.tripBeat = this.beatPos
          this.hooks.sound('checkpoint')
        }
        if (h.tripped) {
          const rel = this.tripRel(h)
          active = active && rel >= h.trip.delay && rel < h.trip.delay + h.trip.on
          telegraph = telegraph || (rel < h.trip.delay && h.trip.delay - rel <= 1)
        } else {
          active = false
        }
      }
      h.active = active
      h.telegraph = telegraph
      if (h.active && !was) this.hooks.sound('hit')
    }

    // carry the player with a moving platform
    if (this.ground && this.ground.move && p.onGround) {
      p.x += this.ground.curX - this.ground.prevX
      p.y += this.ground.curY - this.ground.prevY
    }

    const colliders: Solid[] = this.solids.map((s) => ({
      x: s.curX,
      y: s.curY,
      w: s.w,
      h: s.h,
      active: s.active,
      tag: s.fake ? 'liar' : 'solid',
    }))
    const doorOpen = !this.level.exitWindow || this.inWindow(this.level.exitWindow, this.beatPos)
    if (!doorOpen) colliders.push({ x: this.exit.x, y: this.exit.y, w: this.exit.w, h: this.exit.h, active: true, tag: 'door' })

    const wasGround = p.onGround
    const res = p.step(dt, eff, colliders)
    const g = res.ground
    this.ground = g ? this.solids.find((s) => s.curX === g.x && s.curY === g.y) ?? null : null
    if (!lead && !wasGround && p.onGround) this.hooks.sound('land')
    if (!lead && eff.jumpPressed && p.onGround) this.hooks.sound('jump')

    // landing-reactive: an unstable ledge counts down then falls away
    if (this.ground && this.ground.unstable && !this.ground.dropped) {
      if (this.ground.armedBeat < 0) this.ground.armedBeat = this.beatPos
      if (this.beatPos - this.ground.armedBeat >= this.ground.unstable.warn) {
        this.ground.dropped = true
        this.hooks.sound('hit')
        if (!this.hooks.reducedMotion) {
          this.particles.emit(this.ground.curX + this.ground.w / 2, this.ground.curY + this.ground.h, 10, {
            colors: [theme.solidTop, theme.hazard],
            speed: 130,
            life: 0.45,
            gravity: 900,
            shape: 'square',
          })
        }
      }
    }

    if (doorOpen !== this.exitOpen) {
      this.exitOpen = doorOpen
      this.doorPulse = 1
      this.hooks.sound(doorOpen ? 'unlock' : 'blip')
    }
    if (this.doorPulse > 0) this.doorPulse = Math.max(0, this.doorPulse - dt * 3)

    const pr = this.playerRect()

    for (const h of this.hazards) {
      if (!h.active) continue
      const hit =
        h.kind === 'saw'
          ? circleRect(h.curX + h.w / 2, h.curY + h.h / 2, Math.min(h.w, h.h) / 2, pr)
          : rectsOverlap(pr, { x: h.curX, y: h.curY, w: h.w, h: h.h })
      if (hit) {
        this.die(h.deathMsg)
        return
      }
    }

    if (this.decoy && rectsOverlap(pr, this.decoy)) {
      this.die('That door was a decoy. The rail never lies about the real one.')
      return
    }

    if (rectsOverlap(pr, this.exit)) {
      if (doorOpen) {
        this.hooks.sound('win')
        this.hooks.complete()
        return
      }
      this.die('The door was shut. The rail told you when it opens.')
      return
    }

    if (p.y > 640) {
      this.die('You left the stage.')
      return
    }

    this.particles.update(dt)
  }

  focus(): Vec {
    return { x: this.player.centerX, y: this.player.centerY }
  }

  // ---- rendering ----------------------------------------------------------

  render(g: CanvasRenderingContext2D, w: number, h: number) {
    const pulse = Math.max(0, 1 - this.beatFrac * 3)
    this.drawBackground(g, w, h, pulse)
    for (const s of this.solids) this.drawSolid(g, s, pulse)
    for (const hz of this.hazards) this.drawHazard(g, hz, pulse)
    this.drawExit(g, pulse)
    this.drawPlayer(g)
    this.particles.render(g)
    this.drawHint(g)
    this.drawBeatRail(g, w, pulse)
    this.drawTempo(g, w, h)
    if (this.beatPos < LEAD_BEATS) this.drawLeadIn(g, w, h)
  }

  private drawBackground(g: CanvasRenderingContext2D, w: number, h: number, pulse: number) {
    g.fillStyle = theme.bg
    g.fillRect(0, 0, w, h)
    drawGrid(g, w, h, 40, 'rgba(255,255,255,0.035)')
    const grad = g.createRadialGradient(w * 0.5, h * 0.15, 20, w * 0.5, h * 0.15, w * 0.75)
    grad.addColorStop(0, `rgba(0,102,255,${0.08 + pulse * 0.06})`)
    grad.addColorStop(0.5, 'rgba(255,255,255,0.05)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
  }

  private drawSolid(g: CanvasRenderingContext2D, s: RTSolid, pulse: number) {
    const x = s.curX
    const y = s.curY
    const active = s.active
    if (!active) {
      // ghost of a rhythmic / fallen platform
      fillRoundRect(g, x, y, s.w, s.h, 4, 'rgba(255,255,255,0.05)')
      strokeRoundRect(g, x, y, s.w, s.h, 4, 'rgba(255,255,255,0.22)', 1)
      if (s.window) {
        // countdown pips toward the next solid window
        const p = s.window.period
        const xx = (((this.beatPos + (s.window.phase ?? 0)) % p) + p) % p
        const remain = p - xx
        for (let i = 0; i < Math.min(3, Math.ceil(remain)); i++) {
          g.fillStyle = i === 0 ? 'rgba(0,102,255,0.7)' : 'rgba(0,102,255,0.28)'
          g.fillRect(x + 6 + i * 10, y + s.h / 2 - 2, 6, 4)
        }
      }
      return
    }
    const base = s.fake ? '#2a2a2a' : theme.solid
    const lip = s.fake ? theme.accent2 : theme.solidTop
    fillRoundRect(g, x, y, s.w, s.h, 4, base)
    g.fillStyle = lip
    g.fillRect(x, y, s.w, 3)
    if (s.fake) {
      // hatched liar tell
      g.save()
      roundRect(g, x, y, s.w, s.h, 4)
      g.clip()
      g.strokeStyle = 'rgba(189,189,189,0.5)'
      g.lineWidth = 1
      for (let i = -s.h; i < s.w; i += 9) {
        g.beginPath()
        g.moveTo(x + i, y)
        g.lineTo(x + i + s.h, y + s.h)
        g.stroke()
      }
      g.restore()
      g.fillStyle = theme.accent2
      g.fillRect(x + s.w - 12, y + 4, 6, 2)
      g.fillRect(x + s.w - 9, y + 1, 2, 8)
    }
    if (s.unstable) {
      // cracking ledge: one bar per beat of warning
      const armed = s.armedBeat >= 0 ? this.beatPos - s.armedBeat : 0
      const col = armed > 0 ? theme.hazard : theme.accent
      strokeRoundRect(g, x, y, s.w, s.h, 4, col, s.expiring ? 3 : 2)
      g.strokeStyle = col
      g.lineWidth = 1
      for (let i = 1; i < 4; i++) {
        const cx = x + (s.w * i) / 4
        g.beginPath()
        g.moveTo(cx, y)
        g.lineTo(cx - 4, y + s.h)
        g.stroke()
      }
      if (s.expiring) {
        g.globalAlpha = 0.35 + pulse * 0.4
        fillRoundRect(g, x, y, s.w, s.h, 4, theme.hazard)
        g.globalAlpha = 1
      }
    } else if (s.window) {
      const col = s.expiring ? theme.hazard : theme.accent
      strokeRoundRect(g, x, y, s.w, s.h, 4, col, s.expiring ? 3 : 2)
      if (s.expiring) {
        g.globalAlpha = 0.35 + pulse * 0.4
        fillRoundRect(g, x, y, s.w, s.h, 4, theme.hazard)
        g.globalAlpha = 1
      }
    } else if (s.fake) {
      strokeRoundRect(g, x, y, s.w, s.h, 4, 'rgba(189,189,189,0.8)', 2)
    }
  }

  private drawHazard(g: CanvasRenderingContext2D, hz: RTHazard, pulse: number) {
    const x = hz.curX
    const y = hz.curY
    const active = hz.active
    const telegraph = hz.telegraph
    const alpha = active ? 1 : telegraph ? 0.45 + pulse * 0.45 : hz.window || hz.trip ? 0.16 : 1
    g.save()

    // boundary sensor: a dashed line marks where the trap arms
    if (hz.trip) {
      const sx = hz.trip.at
      g.globalAlpha = 1
      g.strokeStyle = hz.tripped ? theme.hazard : theme.accent
      g.lineWidth = 2
      g.setLineDash([5, 5])
      g.beginPath()
      g.moveTo(sx, 300)
      g.lineTo(sx, 480)
      g.stroke()
      g.setLineDash([])
      g.fillStyle = hz.tripped ? theme.hazard : theme.accent
      g.beginPath()
      g.arc(sx, 480, 4, 0, Math.PI * 2)
      g.fill()
    }

    g.globalAlpha = alpha

    if (hz.kind === 'saw') {
      const cx = x + hz.w / 2
      const cy = y + hz.h / 2
      const r = Math.min(hz.w, hz.h) / 2
      g.save()
      g.translate(cx, cy)
      g.rotate(this.time * 6)
      g.fillStyle = theme.hazard
      g.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        const rr = i % 2 === 0 ? r : r * 0.72
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
      }
      g.closePath()
      g.fill()
      g.fillStyle = '#000000'
      g.beginPath()
      g.arc(0, 0, r * 0.28, 0, Math.PI * 2)
      g.fill()
      g.restore()
    } else if (hz.h >= hz.w * 2) {
      // vertical gate / beam
      fillRoundRect(g, x, y, hz.w, hz.h, 4, active ? '#181818' : 'rgba(255,0,0,0.10)')
      if (active) {
        g.fillStyle = theme.hazard
        for (let yy = y + 6; yy < y + hz.h - 6; yy += 14) {
          g.beginPath()
          g.moveTo(x - 4, yy + 7)
          g.lineTo(x + hz.w / 2, yy)
          g.lineTo(x + hz.w + 4, yy + 7)
          g.lineTo(x + hz.w / 2, yy + 5)
          g.closePath()
          g.fill()
        }
      }
      g.strokeStyle = hz.fake ? theme.accent2 : theme.hazard
      g.lineWidth = active ? 3 : 2
      if (hz.fake) g.setLineDash([6, 5])
      strokeRoundRect(g, x, y, hz.w, hz.h, 4, hz.fake ? theme.accent2 : active ? theme.hazard : 'rgba(255,0,0,0.5)', active ? 3 : 2)
      g.setLineDash([])
    } else {
      // spike strip
      const count = Math.max(1, Math.floor(hz.w / 20))
      g.fillStyle = active ? theme.hazard : 'rgba(255,0,0,0.35)'
      for (let i = 0; i < count; i++) {
        const sx = x + (hz.w / count) * i
        const sw = hz.w / count
        g.beginPath()
        g.moveTo(sx, y + hz.h)
        g.lineTo(sx + sw / 2, y)
        g.lineTo(sx + sw, y + hz.h)
        g.closePath()
        g.fill()
      }
      if (hz.window) {
        g.strokeStyle = hz.fake ? theme.accent2 : theme.hazard
        g.lineWidth = 2
        if (hz.fake) g.setLineDash([6, 5])
        g.strokeRect(x - 1, y - 3, hz.w + 2, hz.h + 4)
        g.setLineDash([])
      }
    }

    // trip fuse: a bar over the blade shows time to fire, then the burn
    if (hz.trip) {
      const rel = this.tripRel(hz)
      const t = hz.trip
      g.globalAlpha = 1
      const bx = x - 4
      const by = y - 14
      const bw = hz.w + 8
      g.fillStyle = 'rgba(255,255,255,0.18)'
      g.fillRect(bx, by, bw, 4)
      if (rel < t.delay) {
        g.fillStyle = theme.accent
        g.fillRect(bx, by, bw * (rel / t.delay), 4)
      } else if (rel < t.delay + t.on) {
        g.fillStyle = theme.hazard
        g.fillRect(bx, by, bw, 4)
      }
    }

    // liar glyph: off-beat patterns are marked with a half-moon + not-equal
    if (hz.fake) {
      g.globalAlpha = 1
      const cx = x + hz.w / 2
      const cy = y + hz.h / 2
      g.strokeStyle = theme.accent2
      g.lineWidth = 2
      g.beginPath()
      g.arc(cx - 7, cy, 5, -Math.PI / 2, Math.PI / 2)
      g.stroke()
      g.fillStyle = theme.accent2
      g.font = '700 13px "Arial Black", Arial, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('≠', cx + 4, cy)
    }

    // beat telegraph ring while a window is about to open
    if (telegraph) {
      g.globalAlpha = 0.5 + pulse * 0.5
      g.strokeStyle = theme.accent
      g.lineWidth = 2
      g.setLineDash([4, 4])
      g.strokeRect(x - 5, y - 5, hz.w + 10, hz.h + 10)
      g.setLineDash([])
    }
    g.restore()
  }

  private drawExit(g: CanvasRenderingContext2D, pulse: number) {
    const r = this.exit
    const open = this.exitOpen
    const col = open ? theme.exit : '#181818'
    g.save()
    g.shadowColor = open ? 'rgba(0,168,59,0.55)' : 'rgba(0,0,0,0)'
    g.shadowBlur = open ? 22 + pulse * 10 : 0
    fillRoundRect(g, r.x, r.y, r.w, r.h, 4, open ? '#181818' : '#181818')
    g.restore()
    strokeRoundRect(g, r.x, r.y, r.w, r.h, 4, col, 2)
    g.fillStyle = open ? 'rgba(0,168,59,0.18)' : 'rgba(189,189,189,0.08)'
    g.fillRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10)
    if (open) {
      g.fillStyle = theme.exit
      g.beginPath()
      g.moveTo(r.x + r.w * 0.36, r.y + r.h * 0.34)
      g.lineTo(r.x + r.w * 0.64, r.y + r.h * 0.5)
      g.lineTo(r.x + r.w * 0.36, r.y + r.h * 0.66)
      g.closePath()
      g.fill()
    } else {
      // padlock
      g.strokeStyle = '#bdbdbd'
      g.lineWidth = 2
      g.strokeRect(r.x + r.w / 2 - 7, r.y + r.h / 2 - 6, 14, 12)
      g.beginPath()
      g.arc(r.x + r.w / 2, r.y + r.h / 2 - 6, 5, Math.PI, 0)
      g.stroke()
    }
    if (this.level.exitWindow) {
      const p = this.level.exitWindow.period
      const xx = (((this.beatPos + (this.level.exitWindow.phase ?? 0)) % p) + p) % p
      const remain = this.beatPos === 0 ? 0 : open ? this.level.exitWindow.on - xx : p - xx
      label(g, open ? `OPEN ${Math.max(0, remain).toFixed(1)}` : `OPENS ${Math.max(0, remain).toFixed(1)}`, r.x + r.w / 2, r.y - 10, {
        size: 11,
        align: 'center',
        color: open ? theme.exit : '#9aa6ba',
      })
    }
  }

  private drawPlayer(g: CanvasRenderingContext2D) {
    const p = this.player
    const stretch = clamp(p.vy / 1400, -0.3, 0.3)
    g.save()
    g.translate(p.centerX, p.y + p.h)
    g.scale(1 - stretch, 1 + stretch)
    fillRoundRect(g, -p.w / 2, -p.h, p.w, p.h, 6, theme.player)
    g.fillStyle = '#1b1230'
    const eye = p.facing
    g.fillRect(-4 + eye * 2, -p.h + 10, 3, 5)
    g.fillRect(2 + eye * 2, -p.h + 10, 3, 5)
    g.restore()
  }

  private drawHint(g: CanvasRenderingContext2D) {
    label(g, `LEVEL ${this.index} / ${rbLevels.length}`, 16, 26, { size: 12, color: 'rgba(255,255,255,0.5)', weight: '700' })
    label(g, this.level.name, 16, 46, { size: 16, color: 'rgba(255,255,255,0.9)', glow: 'rgba(0,229,255,0.5)' })
    label(g, this.level.hint, 16, 528, { size: 13, color: 'rgba(255,255,255,0.55)' })
  }

  private drawBeatRail(g: CanvasRenderingContext2D, w: number, pulse: number) {
    const cx0 = 380
    const cx1 = 760
    const cy = 30
    fillRoundRect(g, cx0 - 26, 12, cx1 - cx0 + 52, 36, 8, 'rgba(12,10,28,0.72)')
    label(g, 'BEAT', cx0 - 18, cy + 5, { size: 11, color: 'rgba(255,255,255,0.45)', weight: '700' })
    const step = (cx1 - cx0) / (PIPS - 1)
    const current = ((this.beatIndex % PIPS) + PIPS) % PIPS
    const next = (current + 1) % PIPS
    for (let i = 0; i < PIPS; i++) {
      const x = cx0 + i * step
      const down = i % 4 === 0
      const on = i === current
      const size = down ? 11 : 8
      const col = on ? (down ? theme.accent2 : theme.accent) : 'rgba(255,255,255,0.22)'
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
    // phase sweep marker
    const mx = cx0 + current * step + step * this.beatFrac
    g.strokeStyle = 'rgba(255,255,255,0.5)'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(mx, cy - 13)
    g.lineTo(mx, cy + 13)
    g.stroke()

    const bpmCol = this.tempoWarn ? '#ffcf3a' : 'rgba(255,255,255,0.75)'
    label(g, `${Math.round(this.currentBpm)} BPM`, w - 24, cy + 5, { size: 13, align: 'right', color: bpmCol, weight: '700' })
    if (this.level.tempo && this.level.tempo.length) {
      label(g, 'TEMPO LEVEL', w - 24, cy + 20, { size: 9, align: 'right', color: 'rgba(255,255,255,0.35)' })
    }
  }

  private drawTempo(g: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.tempoWarn && this.tempoFlash <= 0) return
    const up = this.tempoDir > 0
    const text = this.tempoWarn ? (up ? 'TEMPO UP AHEAD' : 'TEMPO DOWN AHEAD') : up ? 'TEMPO UP!' : 'TEMPO DOWN!'
    const col = up ? theme.accent2 : theme.accent
    const a = this.tempoWarn ? 0.6 + Math.abs(Math.sin(this.time * 8)) * 0.4 : this.tempoFlash
    g.save()
    g.globalAlpha = clamp(a, 0, 1)
    label(g, text, w / 2, 110, { size: 30, align: 'center', color: col, glow: col, weight: '700' })
    for (let i = 0; i < 3; i++) {
      const ax = w / 2 - 150 - i * 22
      g.fillStyle = col
      g.beginPath()
      if (up) {
        g.moveTo(ax, 122)
        g.lineTo(ax + 12, 112)
        g.lineTo(ax + 12, 132)
      } else {
        g.moveTo(ax, 112)
        g.lineTo(ax + 12, 122)
        g.lineTo(ax, 132)
      }
      g.closePath()
      g.fill()
    }
    g.restore()
    void h
  }

  private drawLeadIn(g: CanvasRenderingContext2D, w: number, h: number) {
    const remaining = Math.ceil(LEAD_BEATS - this.beatPos)
    const pulse = Math.max(0, 1 - this.beatFrac * 3)
    g.fillStyle = `rgba(7,6,15,${0.35 + pulse * 0.2})`
    g.fillRect(0, 0, w, h)
    const text = remaining <= 0 ? 'GO!' : String(remaining)
    g.save()
    g.globalAlpha = 0.65 + pulse * 0.35
    label(g, text, w / 2, h / 2 + 30, { size: 96, align: 'center', color: theme.accent, glow: theme.accent, weight: '700' })
    g.restore()
    label(g, 'LOCK ON TO THE BEAT', w / 2, h / 2 - 60, { size: 16, align: 'center', color: 'rgba(255,255,255,0.7)' })
  }
}

export const game: GameModule = {
  slug: 'rhythm-betrayer',
  title: 'Rhythm Betrayer',
  tagline: 'Trust the beat. Then question it.',
  theme,
  controls: [
    { keys: 'A / D or ←/→', label: 'Move' },
    { keys: 'W / ↑ / Space', label: 'Jump' },
    { keys: 'R', label: 'Restart level' },
    { keys: 'Esc', label: 'Pause' },
  ],
  instructions: [
    'Reach the door. Every obstacle runs on the same beat clock.',
    'Watch the top rail — the beat is fully playable without sound.',
    'A dashed edge and a "≠" mark mean a hazard lies about the beat.',
    'Tempo changes are announced before they land.',
    'Time your movement to the pulse. The first four beats are a free count-in.',
  ],
  levels: rbLevels.length,
  view: VIEW,
  create: (hooks) => new RhythmRuntime(hooks),
}

export default game
