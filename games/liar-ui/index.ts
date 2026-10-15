import { circleRect, clamp, pointInRect, rectsOverlap } from '@/lib/game/math'
import { ParticleSystem } from '@/lib/game/particles'
import { PlatformerPlayer, type Solid } from '@/lib/game/platformer'
import { drawGrid, fillRoundRect, label, strokeRoundRect } from '@/lib/game/draw'
import type { GameHooks, GameModule, GameRuntime, GameTheme, InputState, Rect, Vec } from '@/lib/game/types'
import { liarLevels } from './levels'
import type { Effect, LArrow, LButton, LDoor, LHazard, LLabel, LLevel, LSolid, LTrigger } from './types'

const VIEW = { w: 960, h: 540 }
/** how close the player must be (centre-to-centre) for E to press a button */
const ACTION_RADIUS = 96
/** how far away a clickable platform can be for E (facing) to toggle it */
const PLATFORM_RADIUS = 250

const theme: GameTheme = {
  background: '#0a0714',
  bg: '#100a1e',
  panel: '#1a1130',
  solid: '#2b1c46',
  solidTop: '#5b3f86',
  hazard: '#ff3d6e',
  accent: '#c026d3',
  accent2: '#7c3aed',
  player: '#f5ecff',
  exit: '#39ffb0',
  text: '#ffffff',
}

interface RTSolid {
  def: LSolid
  x: number
  y: number
  hidden: boolean
  toggled: boolean
  prevX: number
  prevY: number
}
interface RTHazard {
  def: LHazard
  hidden: boolean
  curX: number
  curY: number
}
interface RTDoor {
  def: LDoor
  x: number
  y: number
  hidden: boolean
  real: boolean
}
interface RTButton {
  def: LButton
  x: number
  used: boolean
  press: number
}
interface RTTrigger {
  def: LTrigger
  fired: boolean
}

class LiarUiRuntime implements GameRuntime {
  private hooks: GameHooks
  private player = new PlatformerPlayer()
  private particles = new ParticleSystem()
  private index = 1
  private level!: LLevel
  private solids: RTSolid[] = []
  private hazards: RTHazard[] = []
  private doors: RTDoor[] = []
  private buttons: RTButton[] = []
  private triggers: RTTrigger[] = []
  private time = 0
  private dead = false
  private won = false
  private mapAccurate = true
  private message = ''
  private messageTimer = 0
  private ground: RTSolid | null = null

  constructor(hooks: GameHooks) {
    this.hooks = hooks
  }

  // -------------------------------------------------------------------------
  // lifecycle
  // -------------------------------------------------------------------------

  load(level: number) {
    const def = liarLevels[clamp(Math.floor(level) - 1, 0, liarLevels.length - 1)]
    this.level = def
    this.index = clamp(Math.floor(level), 1, liarLevels.length)
    this.time = 0
    this.dead = false
    this.won = false
    this.ground = null
    this.mapAccurate = def.mapAccurate ?? true
    this.message = ''
    this.messageTimer = 0
    this.particles.clear()
    this.player = new PlatformerPlayer()
    this.player.reset(def.start.x, def.start.y)
    this.solids = def.solids.map((s) => ({
      def: s,
      x: s.x,
      y: s.y,
      hidden: s.hidden ?? false,
      toggled: false,
      prevX: s.x,
      prevY: s.y,
    }))
    this.hazards = def.hazards.map((h) => ({ def: h, hidden: h.hidden ?? false, curX: h.x, curY: h.y }))
    this.doors = def.doors.map((d) => ({ def: d, x: d.x, y: d.y, hidden: d.hidden ?? false, real: d.real }))
    this.buttons = (def.buttons ?? []).map((b) => ({ def: b, x: b.x, used: false, press: 0 }))
    this.triggers = (def.triggers ?? []).map((t) => ({ def: t, fired: false }))
  }

  destroy() {
    this.solids = []
    this.hazards = []
    this.doors = []
    this.buttons = []
    this.triggers = []
    this.particles.clear()
  }

  private die(msg?: string) {
    if (this.dead || this.won) return
    this.dead = true
    const p = this.player
    if (!this.hooks.reducedMotion) {
      this.particles.emit(p.centerX, p.centerY, 22, {
        colors: ['#ff3d6e', '#c026d3', '#7c3aed', '#ffffff'],
        speed: 250,
        life: 0.7,
        size: 5,
        gravity: 700,
      })
    }
    this.hooks.death(msg)
  }

  private win() {
    if (this.dead || this.won) return
    this.won = true
    this.hooks.sound('win')
    this.hooks.complete()
  }

  // -------------------------------------------------------------------------
  // world changes
  // -------------------------------------------------------------------------

  private findById(id: string): { hidden: boolean } | null {
    return (
      this.solids.find((s) => s.def.id === id) ??
      this.hazards.find((h) => h.def.id === id) ??
      this.doors.find((d) => d.def.id === id) ??
      null
    )
  }

  private applyEffect(e: Effect) {
    if (e.show) for (const id of e.show) {
      const f = this.findById(id)
      if (f) f.hidden = false
    }
    if (e.hide) for (const id of e.hide) {
      const f = this.findById(id)
      if (f) f.hidden = true
    }
    if (e.toggle) for (const id of e.toggle) {
      const f = this.findById(id)
      if (f) f.hidden = !f.hidden
    }
    if (e.swapDoors) {
      const a = this.doors.find((d) => d.def.id === e.swapDoors![0])
      const b = this.doors.find((d) => d.def.id === e.swapDoors![1])
      if (a && b) {
        const ax = a.x
        const ay = a.y
        a.x = b.x
        a.y = b.y
        b.x = ax
        b.y = ay
      }
    }
    if (e.moveDoor) {
      const d = this.doors.find((x) => x.def.id === e.moveDoor!.id)
      if (d) {
        d.x += e.moveDoor.dx
        d.y += e.moveDoor.dy
      }
    }
    if (e.moveSolid) {
      const s = this.solids.find((x) => x.def.id === e.moveSolid!.id)
      if (s) {
        if (e.moveSolid.x !== undefined) s.x = e.moveSolid.x
        if (e.moveSolid.y !== undefined) s.y = e.moveSolid.y
        if (e.moveSolid.dx !== undefined) s.x += e.moveSolid.dx
        if (e.moveSolid.dy !== undefined) s.y += e.moveSolid.dy
      }
    }
    if (e.armDoor) {
      const d = this.doors.find((x) => x.def.id === e.armDoor)
      if (d) {
        d.hidden = false
        d.real = false
      }
    }
    if (e.setMap !== undefined) this.mapAccurate = e.setMap
    if (e.shake) this.hooks.shake(e.shake)
    if (e.sound) this.hooks.sound(e.sound)
    if (e.message) {
      this.message = e.message
      this.messageTimer = 3.2
    }
    if (e.win) {
      this.win()
      return
    }
    if (e.death) {
      this.die(e.message)
    }
  }

  // -------------------------------------------------------------------------
  // interaction
  // -------------------------------------------------------------------------

  private playerRect(): Rect {
    const p = this.player
    return { x: p.x, y: p.y, w: p.w, h: p.h }
  }

  private buttonRect(b: RTButton): Rect {
    return { x: b.x, y: b.def.y, w: b.def.w, h: b.def.h }
  }

  private nearestButton(): RTButton | null {
    let best: RTButton | null = null
    let bestD = ACTION_RADIUS
    for (const b of this.buttons) {
      if (b.def.once && b.used) continue
      const r = this.buttonRect(b)
      const d = Math.hypot(this.player.centerX - (r.x + r.w / 2), this.player.centerY - (r.y + r.h / 2))
      if (d < bestD) {
        bestD = d
        best = b
      }
    }
    return best
  }

  private nearestPlatform(): RTSolid | null {
    let best: RTSolid | null = null
    let bestD = PLATFORM_RADIUS
    for (const s of this.solids) {
      if (!s.def.click || s.hidden) continue
      if (s === this.ground) continue
      const cx = s.x + s.def.w / 2
      const dx = cx - this.player.centerX
      const inFront = dx * this.player.facing >= -12
      if (!inFront) continue
      const d = Math.hypot(dx, s.y + s.def.h / 2 - this.player.centerY)
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    return best
  }

  private activateButton(b: RTButton) {
    if (b.def.once && b.used) return
    b.used = true
    b.press = 0.18
    this.hooks.sound('click')
    const r = this.buttonRect(b)
    if (!this.hooks.reducedMotion) {
      this.particles.emit(r.x + r.w / 2, r.y + r.h / 2, 8, { colors: ['#c026d3', '#ffffff'], speed: 150, life: 0.35, gravity: 500 })
    }
    this.applyEffect(b.def.effect)
  }

  private toggleSolid(s: RTSolid) {
    const c = s.def.click
    if (!c) return
    const nx = s.toggled ? s.def.x : c.x2
    const ny = s.toggled ? s.def.y : c.y2
    const dx = nx - s.x
    const dy = ny - s.y
    if (this.ground === s) {
      this.player.x += dx
      this.player.y += dy
    }
    s.x = nx
    s.y = ny
    s.toggled = !s.toggled
    this.hooks.sound('click')
    if (!this.hooks.reducedMotion) {
      this.particles.emit(s.x + s.def.w / 2, s.y + s.def.h / 2, 10, { colors: ['#7c3aed', '#c9b6ff'], speed: 170, life: 0.4, gravity: 600 })
    }
  }

  private handleInteractions(input: InputState) {
    if (input.pointer.pressed) {
      let hit = false
      for (const b of this.buttons) {
        if (b.def.once && b.used) continue
        if (pointInRect(input.pointer.x, input.pointer.y, this.buttonRect(b))) {
          this.activateButton(b)
          hit = true
          break
        }
      }
      if (!hit) {
        for (const s of this.solids) {
          if (!s.def.click || s.hidden) continue
          if (pointInRect(input.pointer.x, input.pointer.y, { x: s.x, y: s.y, w: s.def.w, h: s.def.h })) {
            this.toggleSolid(s)
            break
          }
        }
      }
    }
    if (input.actionPressed) {
      const b = this.nearestButton()
      if (b) {
        this.activateButton(b)
      } else {
        const s = this.nearestPlatform()
        if (s) this.toggleSolid(s)
      }
    }
  }

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  update(dt: number, input: InputState) {
    if (this.dead || this.won) return
    this.time += dt
    if (this.messageTimer > 0) this.messageTimer -= dt
    const p = this.player

    // moving solids
    for (const s of this.solids) {
      s.prevX = s.x
      s.prevY = s.y
      if (s.def.move) {
        const ph = (this.time / s.def.move.period + (s.def.move.phase ?? 0)) * Math.PI * 2
        s.x = s.def.x + Math.sin(ph) * s.def.move.dx
        s.y = s.def.y + Math.sin(ph) * s.def.move.dy
      }
    }
    if (this.ground?.def.move && p.onGround) {
      p.x += this.ground.x - this.ground.prevX
      p.y += this.ground.y - this.ground.prevY
    }

    // moving hazards
    for (const h of this.hazards) {
      if (h.def.move) {
        const ph = (this.time / h.def.move.period + (h.def.move.phase ?? 0)) * Math.PI * 2
        h.curX = h.def.x + Math.sin(ph) * h.def.move.dx
        h.curY = h.def.y + Math.sin(ph) * h.def.move.dy
      }
    }

    // proximity-fleeing buttons
    for (const b of this.buttons) {
      const f = b.def.flee
      if (!f) continue
      const bcx = b.x + b.def.w / 2
      const d = Math.abs(p.centerX - bcx)
      if (d < f.radius) {
        const dir = p.centerX < bcx ? 1 : -1
        b.x = clamp(b.x + dir * (f.speed ?? 280) * dt, f.minX, f.maxX)
      }
    }
    for (const b of this.buttons) if (b.press > 0) b.press = Math.max(0, b.press - dt)

    // player-driven world (click / tap / E)
    this.handleInteractions(input)
    if (this.dead || this.won) return

    // collide
    const colliders: Solid[] = []
    const groundMap = new Map<Solid, RTSolid>()
    for (const s of this.solids) {
      const active = !s.hidden && s.def.kind !== 'fake' && s.y < 660
      const col: Solid = { x: s.x, y: s.y, w: s.def.w, h: s.def.h, active, tag: s.def.kind }
      colliders.push(col)
      groundMap.set(col, s)
    }
    const wasGround = this.ground
    const res = p.step(dt, input, colliders)
    this.ground = res.ground ? groundMap.get(res.ground) ?? null : null
    if (!wasGround && this.ground) this.hooks.sound('land')
    if (input.jumpPressed && p.onGround) this.hooks.sound('jump')

    // triggers
    const pr = this.playerRect()
    for (const t of this.triggers) {
      if (t.fired && t.def.once) continue
      if (rectsOverlap(pr, t.def)) {
        t.fired = true
        this.applyEffect(t.def.effect)
        if (this.dead || this.won) return
      }
    }

    // hazards
    for (const h of this.hazards) {
      if (h.hidden) continue
      if (h.def.kind === 'saw') {
        const cx = h.curX + h.def.w / 2
        const cy = h.curY + h.def.h / 2
        if (circleRect(cx, cy, Math.min(h.def.w, h.def.h) / 2, pr)) {
          this.die('The saw disagreed with you.')
          return
        }
      } else if (rectsOverlap(pr, { x: h.curX, y: h.curY, w: h.def.w, h: h.def.h })) {
        this.die()
        return
      }
    }

    // doors
    for (const d of this.doors) {
      if (d.hidden) continue
      if (rectsOverlap(pr, { x: d.x, y: d.y, w: d.def.w, h: d.def.h })) {
        if (d.real) {
          this.win()
          return
        }
        this.die('That door was a painting.')
        return
      }
    }

    if (p.y > 680) {
      this.die('The level let go of you.')
      return
    }

    this.particles.update(dt)
  }

  focus(): Vec {
    return { x: this.player.centerX, y: this.player.centerY }
  }

  // -------------------------------------------------------------------------
  // render
  // -------------------------------------------------------------------------

  render(g: CanvasRenderingContext2D, w: number, h: number) {
    g.fillStyle = theme.bg
    g.fillRect(0, 0, w, h)
    drawGrid(g, w, h, 40, 'rgba(255,255,255,0.03)')

    const grad = g.createRadialGradient(w * 0.5, h * 0.08, 20, w * 0.5, h * 0.08, w * 0.75)
    grad.addColorStop(0, 'rgba(124,58,237,0.2)')
    grad.addColorStop(0.6, 'rgba(192,38,211,0.06)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)

    // fake platforms first (behind everything)
    for (const s of this.solids) {
      if (s.def.kind !== 'fake') continue
      fillRoundRect(g, s.x, s.y, s.def.w, s.def.h, 3, 'rgba(120,90,170,0.22)')
      strokeRoundRect(g, s.x, s.y, s.def.w, s.def.h, 3, 'rgba(200,170,255,0.28)', 1)
      this.drawHairline(g, s.x, s.y, s.def.w, s.def.h)
    }

    // solids
    for (const s of this.solids) {
      if (s.def.kind === 'fake' || s.hidden) continue
      if (s.def.kind === 'bouncy') {
        fillRoundRect(g, s.x, s.y, s.def.w, s.def.h, 4, theme.accent2)
        g.fillStyle = 'rgba(255,255,255,0.5)'
        g.fillRect(s.x + 3, s.y + 2, s.def.w - 6, 2)
        continue
      }
      fillRoundRect(g, s.x, s.y, s.def.w, s.def.h, 3, theme.solid)
      g.fillStyle = s.def.kind === 'vanish' ? theme.accent2 : theme.solidTop
      g.fillRect(s.x, s.y, s.def.w, 3)
      if (s.def.click) {
        g.setLineDash([5, 4])
        strokeRoundRect(g, s.x, s.y, s.def.w, s.def.h, 3, 'rgba(201,182,255,0.8)', 1.5)
        g.setLineDash([])
        if (s.def.label) label(g, s.def.label, s.x + s.def.w / 2, s.y + s.def.h + 13, { size: 10, align: 'center', color: '#c9b6ff' })
      }
    }

    // hazards
    for (const hz of this.hazards) {
      if (hz.hidden) continue
      if (hz.def.kind === 'saw') this.drawSaw(g, hz.curX, hz.curY, hz.def.w, hz.def.h)
      else this.drawSpikes(g, hz.curX, hz.curY, hz.def.w, hz.def.h)
    }

    // doors
    for (const d of this.doors) {
      if (d.hidden) continue
      this.drawDoor(g, d.x, d.y, d.def.w, d.def.h, d.real)
    }

    // buttons
    for (const b of this.buttons) this.drawButton(g, b)

    // labels
    for (const l of this.level.labels ?? []) this.drawLabel(g, l)

    // arrows
    for (const a of this.level.arrows ?? []) this.drawArrow(g, a)

    // minimap
    if (this.level.minimap) this.drawMinimap(g)

    // player
    this.drawPlayer(g)
    this.particles.render(g)

    // captions
    this.drawCaptions(g)
  }

  private drawHairline(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    g.save()
    g.setLineDash([6, 5])
    g.strokeStyle = 'rgba(255,255,255,0.35)'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(x + 4, y + h / 2)
    g.lineTo(x + w - 4, y + h / 2)
    g.stroke()
    g.restore()
  }

  private drawSpikes(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const count = Math.max(1, Math.floor(w / 20))
    g.fillStyle = theme.hazard
    for (let i = 0; i < count; i++) {
      const sx = x + (w / count) * i
      const sw = w / count
      g.beginPath()
      g.moveTo(sx, y + h)
      g.lineTo(sx + sw / 2, y)
      g.lineTo(sx + sw, y + h)
      g.closePath()
      g.fill()
    }
  }

  private drawSaw(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const cx = x + w / 2
    const cy = y + h / 2
    const r = Math.min(w, h) / 2
    g.save()
    g.translate(cx, cy)
    g.rotate(this.time * 7)
    g.fillStyle = theme.hazard
    g.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      const rr = i % 2 === 0 ? r : r * 0.7
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    g.closePath()
    g.fill()
    g.fillStyle = '#2a1020'
    g.beginPath()
    g.arc(0, 0, r * 0.28, 0, Math.PI * 2)
    g.fill()
    g.restore()
  }

  private drawDoor(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, real: boolean) {
    if (real) {
      g.save()
      g.shadowColor = 'rgba(57,255,176,0.55)'
      g.shadowBlur = 20
      fillRoundRect(g, x, y, w, h, 5, '#0f3328')
      g.restore()
      strokeRoundRect(g, x, y, w, h, 5, theme.exit, 2)
      g.fillStyle = 'rgba(57,255,176,0.16)'
      g.fillRect(x + 6, y + 6, w - 12, h - 12)
      g.fillStyle = theme.exit
      g.beginPath()
      g.arc(x + w / 2, y + h * 0.4, 4, 0, Math.PI * 2)
      g.fill()
      g.fillRect(x + w / 2 - 1.5, y + h * 0.4, 3, 11)
      g.beginPath()
      g.moveTo(x + w * 0.3, y + h * 0.72)
      g.lineTo(x + w * 0.5, y + h * 0.86)
      g.lineTo(x + w * 0.7, y + h * 0.72)
      g.strokeStyle = 'rgba(57,255,176,0.6)'
      g.lineWidth = 2
      g.stroke()
    } else {
      const flick = 0.5 + 0.5 * Math.sin(this.time * 22)
      g.save()
      g.shadowColor = `rgba(255,61,110,${(0.32 + 0.24 * flick).toFixed(3)})`
      g.shadowBlur = 14 + 8 * flick
      fillRoundRect(g, x, y, w, h, 5, '#3a1020')
      g.restore()
      strokeRoundRect(g, x, y, w, h, 5, '#ff6b8a', 2)
      g.fillStyle = 'rgba(255,61,110,0.14)'
      g.fillRect(x + 6, y + 6, w - 12, h - 12)
      // subtle tell: a hairline crack down the middle
      g.strokeStyle = 'rgba(255,190,210,0.75)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(x + w * 0.5, y + 5)
      g.lineTo(x + w * 0.42, y + h * 0.4)
      g.lineTo(x + w * 0.56, y + h * 0.62)
      g.lineTo(x + w * 0.48, y + h - 5)
      g.stroke()
    }
  }

  private drawButton(g: CanvasRenderingContext2D, b: RTButton) {
    const r = this.buttonRect(b)
    const sink = b.press > 0 ? 2 : 0
    const base = b.def.color ?? '#3b2f5a'
    g.save()
    g.shadowColor = 'rgba(192,38,211,0.35)'
    g.shadowBlur = 12
    fillRoundRect(g, r.x, r.y + sink, r.w, r.h - sink, 6, base)
    g.restore()
    strokeRoundRect(g, r.x, r.y + sink, r.w, r.h - sink, 6, b.used ? theme.exit : theme.accent, 2)
    label(g, b.def.label, r.x + r.w / 2, r.y + r.h / 2 + 4 + sink, {
      size: Math.min(13, r.w / (b.def.label.length * 0.62)),
      align: 'center',
      color: '#ffffff',
    })
    if (b.def.flee) {
      g.strokeStyle = 'rgba(255,255,255,0.5)'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(r.x - 6, r.y + r.h * 0.35)
      g.lineTo(r.x - 12, r.y + r.h * 0.5)
      g.lineTo(r.x - 6, r.y + r.h * 0.65)
      g.moveTo(r.x + r.w + 6, r.y + r.h * 0.35)
      g.lineTo(r.x + r.w + 12, r.y + r.h * 0.5)
      g.lineTo(r.x + r.w + 6, r.y + r.h * 0.65)
      g.stroke()
    }
  }

  private drawLabel(g: CanvasRenderingContext2D, l: LLabel) {
    const size = l.size ?? 14
    g.font = `700 ${size}px "Arial Black", Arial, sans-serif`
    const tw = g.measureText(l.text).width
    if (l.box) {
      const bw = l.w ?? tw + 24
      const bh = size + 14
      const bx = l.align === 'center' ? l.x - bw / 2 : l.x
      const by = l.y - size - 4
      fillRoundRect(g, bx, by, bw, bh, 6, 'rgba(18,11,32,0.85)')
      strokeRoundRect(g, bx, by, bw, bh, 6, l.color ?? theme.accent, 1.5)
      label(g, l.text, bx + 12, by + bh / 2 + size * 0.34, { size, color: l.color ?? theme.text })
    } else {
      label(g, l.text, l.x, l.y, { size, color: l.color ?? theme.text, align: l.align })
    }
  }

  private drawArrow(g: CanvasRenderingContext2D, a: LArrow) {
    const len = a.len ?? 46
    const m = Math.hypot(a.dx, a.dy) || 1
    const ux = a.dx / m
    const uy = a.dy / m
    const ex = a.x + ux * len
    const ey = a.y + uy * len
    const color = a.color ?? 'rgba(255,255,255,0.5)'
    g.strokeStyle = color
    g.fillStyle = color
    g.lineWidth = 5
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(a.x, a.y)
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
    if (a.label) label(g, a.label, a.x, a.y - 12, { size: 11, color, align: 'center' })
  }

  private drawMinimap(g: CanvasRenderingContext2D) {
    const m = this.level.minimap!
    fillRoundRect(g, m.x, m.y, m.w, m.h, 8, 'rgba(10,6,20,0.86)')
    strokeRoundRect(g, m.x, m.y, m.w, m.h, 8, this.mapAccurate ? '#39ffb0' : '#ff3d6e', 2)
    label(g, m.title ?? 'NAV', m.x + 10, m.y + 16, { size: 12, color: this.mapAccurate ? '#8ef0c0' : '#ff8fa3' })

    const px = (x: number) => m.x + 8 + (this.mapAccurate ? x : VIEW.w - x) * ((m.w - 16) / VIEW.w)
    const py = (y: number) => m.y + 26 + y * ((m.h - 34) / VIEW.h)

    g.save()
    g.beginPath()
    g.rect(m.x + 3, m.y + 3, m.w - 6, m.h - 6)
    g.clip()

    for (const s of this.solids) {
      if (s.def.kind === 'fake' || s.hidden) continue
      const rx1 = px(s.x)
      const rx2 = px(s.x + s.def.w)
      g.fillStyle = 'rgba(120,90,180,0.8)'
      g.fillRect(Math.min(rx1, rx2), py(s.y), Math.abs(rx2 - rx1), 3)
    }
    for (const d of this.doors) {
      if (d.hidden) continue
      g.fillStyle = d.real ? '#39ffb0' : '#ff3d6e'
      g.fillRect(px(d.x) - 2, py(d.y) - 2, 4, 6)
    }
    // player
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(px(this.player.centerX), py(this.player.centerY), 3, 0, Math.PI * 2)
    g.fill()
    g.restore()

    if (!this.mapAccurate) {
      const blink = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 5))
      g.fillStyle = `rgba(255,61,110,${blink.toFixed(3)})`
      g.beginPath()
      g.arc(m.x + m.w - 14, m.y + 14, 4, 0, Math.PI * 2)
      g.fill()
      label(g, 'SYNC?', m.x + m.w - 66, m.y + 18, { size: 10, color: 'rgba(255,143,163,0.9)' })
    }
  }

  private drawPlayer(g: CanvasRenderingContext2D) {
    const p = this.player
    const stretch = clamp(p.vy / 1400, -0.3, 0.3)
    g.save()
    g.translate(p.centerX, p.y + p.h)
    g.scale(1 - stretch, 1 + stretch)
    fillRoundRect(g, -p.w / 2, -p.h, p.w, p.h, 6, theme.player)
    g.fillStyle = '#241a33'
    const e = p.facing
    g.fillRect(-4 + e * 2, -p.h + 10, 3, 5)
    g.fillRect(2 + e * 2, -p.h + 10, 3, 5)
    g.restore()
  }

  private drawCaptions(g: CanvasRenderingContext2D) {
    label(g, `LEVEL ${this.index}`, 16, 28, { size: 13, color: 'rgba(255,255,255,0.5)' })
    label(g, this.level.name, 16, 48, { size: 15, color: 'rgba(255,255,255,0.85)' })

    // in-world hint caption (frequently a lie)
    const hint = this.level.hint
    g.font = '700 14px "Arial Black", Arial, sans-serif'
    const tw = g.measureText(hint).width
    const bw = tw + 132
    const bx = VIEW.w / 2 - bw / 2
    fillRoundRect(g, bx, 14, bw, 34, 8, 'rgba(16,10,30,0.9)')
    strokeRoundRect(g, bx, 14, bw, 34, 8, theme.accent, 1.5)
    label(g, '◈ UI SAYS', bx + 14, 36, { size: 13, color: theme.accent })
    label(g, hint, bx + 108, 36, { size: 14, color: '#e9dcff' })

    if (this.messageTimer > 0 && this.message) {
      const a = clamp(this.messageTimer / 0.6, 0, 1)
      g.globalAlpha = a
      g.font = '700 15px "Arial Black", Arial, sans-serif'
      const mw = g.measureText(this.message).width + 32
      const mx = VIEW.w / 2 - mw / 2
      fillRoundRect(g, mx, VIEW.h - 74, mw, 30, 8, 'rgba(24,10,34,0.92)')
      strokeRoundRect(g, mx, VIEW.h - 74, mw, 30, 8, theme.hazard, 1.5)
      label(g, this.message, VIEW.w / 2, VIEW.h - 53, { size: 15, align: 'center', color: '#ffd9e2' })
      g.globalAlpha = 1
    }
  }
}

export const game: GameModule = {
  slug: 'liar-ui',
  title: 'Liar UI',
  tagline: 'The interface is part of the level. It is not on your side.',
  theme,
  controls: [
    { keys: 'A / D or ←/→', label: 'Move' },
    { keys: 'W / ↑ / Space', label: 'Jump' },
    { keys: 'E / Enter / J', label: 'Use (or tap)' },
    { keys: 'R', label: 'Restart' },
    { keys: 'Esc', label: 'Pause' },
  ],
  instructions: [
    'Reach the glowing door. Read the world, not the labels.',
    'Captions, arrows and the minimap are drawn by the level - they can lie.',
    'Tap a button or platform, or stand close, face it and press E.',
    'Every trap is deterministic. A second look always beats it.',
  ],
  levels: liarLevels.length,
  view: VIEW,
  create: (hooks: GameHooks) => new LiarUiRuntime(hooks),
}

export default game
