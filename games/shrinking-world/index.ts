import { circleRect, clamp, lerp, rectsOverlap } from '@/lib/game/math'
import { ParticleSystem } from '@/lib/game/particles'
import { PlatformerPlayer, type Solid } from '@/lib/game/platformer'
import { drawGrid, fillRoundRect, label, strokeRoundRect } from '@/lib/game/draw'
import type { GameHooks, GameModule, GameRuntime, GameTheme, InputState, Rect, Vec } from '@/lib/game/types'
import { shrinkingLevels } from './levels'
import type { SWHazard, SWLevel, SWMorph, SWPlatform, SWTrigger } from './types'

const VIEW = { w: 960, h: 540 }
const DEATH_Y = 660

const theme: GameTheme = {
  background: '#0a0705',
  bg: '#15100d',
  panel: '#241b15',
  solid: '#3a2c22',
  solidTop: '#7c5c3c',
  hazard: '#ff5a2e',
  accent: '#ffb020',
  accent2: '#8a5230',
  player: '#f6ead6',
  exit: '#4ce0a8',
  text: '#fff6ea',
}

interface RTPlatform {
  def: SWPlatform
  x: number
  y: number
  w: number
  h: number
  prevX: number
  prevY: number
  active: boolean
  hidden: boolean
  armed: boolean
  t: number
  blinkOn: boolean
  blinkCountdown: number
  passed: boolean
  fadeT: number
}

interface RTHazard extends SWHazard {
  curX: number
  curY: number
}

interface RTTrigger {
  def: SWTrigger
  fired: boolean
}

const ease = (t: number) => t * t * (3 - 2 * t)

/** Deterministic morph progress (0..1) and whether the telegraph is showing. */
function morphPhase(m: SWMorph, t: number): { p: number; warning: boolean } {
  const time = Math.max(0.0001, m.time)
  if (!m.cycle) {
    if (t < m.warn) return { p: 0, warning: true }
    return { p: clamp((t - m.warn) / time, 0, 1), warning: false }
  }
  const hold = m.hold ?? 0.5
  const seg = m.warn + time + hold + time + hold
  const ph = ((t % seg) + seg) % seg
  if (ph < m.warn) return { p: 0, warning: ph > m.warn - 0.6 }
  if (ph < m.warn + time) return { p: (ph - m.warn) / time, warning: false }
  if (ph < m.warn + time + hold) return { p: 1, warning: false }
  if (ph < m.warn + 2 * time + hold) return { p: 1 - (ph - m.warn - time - hold) / time, warning: false }
  return { p: 0, warning: false }
}

class ShrinkingWorldRuntime implements GameRuntime {
  private hooks: GameHooks
  private player = new PlatformerPlayer()
  private particles = new ParticleSystem()
  private index = 1
  private level!: SWLevel
  private platforms: RTPlatform[] = []
  private hazards: RTHazard[] = []
  private triggers: RTTrigger[] = []
  private decoys: Rect[] = []
  private exit: Rect = { x: 0, y: 0, w: 0, h: 0 }
  private exitHidden = false
  private exitRevealed = false
  private time = 0
  private done = false
  private ground: RTPlatform | null = null
  private prevGround: RTPlatform | null = null
  private wallLeft = -1
  private wallRight = VIEW.w + 999
  private wallTop = -1
  private wallBottom = VIEW.h + 999
  private riseSurface = VIEW.h + 999
  private pressureActive = false
  private pressureProgress = 0

  constructor(hooks: GameHooks) {
    this.hooks = hooks
  }

  load(level: number) {
    const def = shrinkingLevels[clamp(level - 1, 0, shrinkingLevels.length - 1)]
    this.index = clamp(level, 1, shrinkingLevels.length)
    this.level = def
    this.time = 0
    this.done = false
    this.ground = null
    this.prevGround = null
    this.exitHidden = def.exitHidden ?? false
    this.exitRevealed = !this.exitHidden
    this.exit = { ...def.exit }
    this.decoys = (def.decoys ?? []).map((d) => ({ ...d }))
    this.particles.clear()
    this.player = new PlatformerPlayer()
    this.player.reset(def.start.x, def.start.y)

    this.platforms = def.platforms.map((p) => ({
      def: p,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      prevX: p.x,
      prevY: p.y,
      active: !(p.hidden ?? false),
      hidden: p.hidden ?? false,
      armed: false,
      t: 0,
      blinkOn: true,
      blinkCountdown: p.blink?.on ?? 0,
      passed: false,
      fadeT: 0,
    }))
    this.hazards = (def.hazards ?? []).map((hz) => ({ ...hz, curX: hz.x, curY: hz.y }))
    this.triggers = (def.triggers ?? []).map((t) => ({ def: t, fired: false }))
    this.wallLeft = -1
    this.wallRight = VIEW.w + 999
    this.wallTop = -1
    this.wallBottom = VIEW.h + 999
    this.riseSurface = VIEW.h + 999
    this.pressureActive = (def.pressure ?? null) !== null
    this.pressureProgress = 0
  }

  private playerRect(): Rect {
    const p = this.player
    return { x: p.x, y: p.y, w: p.w, h: p.h }
  }

  private kill(msg: string) {
    if (this.done) return
    this.done = true
    this.hooks.sound('death')
    this.hooks.shake(0.7)
    const p = this.player
    this.particles.emit(p.centerX, p.centerY, this.hooks.reducedMotion ? 6 : 18, {
      colors: [theme.player, theme.hazard, theme.accent],
      speed: 260,
      life: 0.6,
      gravity: 900,
    })
    this.hooks.death(msg)
  }

  private arm(id: string) {
    const pl = this.platforms.find((p) => p.def.id === id)
    if (pl && !pl.armed) {
      pl.armed = true
      pl.t = 0
      this.hooks.sound('blip')
    }
  }

  private fireTrigger(tr: RTTrigger) {
    const d = tr.def
    if (d.arm) for (const id of d.arm) this.arm(id)
    if (d.show) for (const id of d.show) {
      const pl = this.platforms.find((p) => p.def.id === id)
      if (pl) pl.hidden = false
      const hz = this.hazards.find((h) => h.id === id)
      if (hz) hz.hidden = false
    }
    if (d.hide) for (const id of d.hide) {
      const pl = this.platforms.find((p) => p.def.id === id)
      if (pl) pl.hidden = true
      const hz = this.hazards.find((h) => h.id === id)
      if (hz) hz.hidden = true
    }
    if (d.revealExit && this.exitHidden && !this.exitRevealed) {
      this.exitRevealed = true
      this.particles.emit(this.exit.x + this.exit.w / 2, this.exit.y + this.exit.h / 2, 14, {
        colors: [theme.exit, '#ffffff'],
        speed: 200,
        life: 0.7,
        gravity: 120,
      })
    }
    if (d.shake) this.hooks.shake(d.shake)
    if (d.sound) this.hooks.sound(d.sound)
    if (d.kill) this.kill('That switch was wired to something unfortunate.')
  }

  private updatePressure() {
    const pr = this.level.pressure
    if (!pr) {
      this.pressureProgress = 0
      return
    }
    this.pressureActive = true
    const prog = clamp((this.time - pr.delay) / Math.max(0.0001, pr.time ?? 1), 0, 1)
    if (pr.kind === 'walls') {
      const e = ease(prog)
      const r = pr.reach ?? {}
      const edges = pr.edges ?? []
      this.wallLeft = edges.includes('left') ? lerp(0, r.left ?? 0, e) : -1
      this.wallRight = edges.includes('right') ? lerp(VIEW.w, r.right ?? VIEW.w, e) : VIEW.w + 999
      this.wallTop = edges.includes('top') ? lerp(0, r.top ?? 0, e) : -1
      this.wallBottom = edges.includes('bottom') ? lerp(VIEW.h, r.bottom ?? VIEW.h, e) : VIEW.h + 999
      this.pressureProgress = prog
    } else {
      const elapsed = Math.max(0, this.time - pr.delay)
      const from = pr.from ?? VIEW.h
      const cap = pr.cap ?? -200
      this.riseSurface = Math.max(cap, from - (pr.speed ?? 20) * elapsed)
      this.pressureProgress = clamp((from - this.riseSurface) / Math.max(1, from - cap), 0, 1)
    }
  }

  private updatePlatforms(dt: number) {
    const px = this.player.x
    for (const pl of this.platforms) {
      pl.prevX = pl.x
      pl.prevY = pl.y
      const def = pl.def
      let bx = def.x
      let by = def.y
      let bw = def.w
      let bh = def.h
      if (def.move) {
        const ph = (this.time / def.move.period + (def.move.phase ?? 0)) * Math.PI * 2
        bx = def.x + Math.sin(ph) * def.move.dx
        by = def.y + Math.sin(ph) * def.move.dy
      }
      let active = !pl.hidden

      if (def.mode === 'gate') {
        // a gate is off the map until armed, then it seals the route
        active = active || pl.armed
      }

      if (def.mode === 'blink' && def.blink) {
        const span = def.blink.on + def.blink.off
        const ph = (((this.time + (def.blink.phase ?? 0)) % span) + span) % span
        pl.blinkOn = ph < def.blink.on
        pl.blinkCountdown = pl.blinkOn ? def.blink.on - ph : span - ph
        active = active && pl.blinkOn
      }

      if (def.morph && (def.mode === 'shrink' || def.mode === 'retract')) {
        if (!pl.armed && def.morph.auto != null && this.time >= def.morph.auto) pl.armed = true
        if (pl.armed) {
          pl.t += dt
          const raw = morphPhase(def.morph, pl.t).p
          const e = ease(raw)
          if (def.mode === 'retract') {
            if ((def.morph.axis ?? 'x') === 'x') bx += (def.morph.travel ?? 0) * e
            else by += (def.morph.travel ?? 0) * e
            if (!def.morph.cycle && raw >= 1) active = false
          } else if (def.mode === 'shrink') {
            bw = lerp(def.w, def.morph.toW ?? def.w, e)
            bh = lerp(def.h, def.morph.toH ?? def.h, e)
            const anchor = def.morph.anchor ?? 'left'
            if (anchor === 'right') bx = def.x + (def.w - bw)
            else if (anchor === 'center') bx = def.x + (def.w - bw) / 2
            else bx = def.x
            if (bw <= 2) active = false
          }
        }
      }

      if (def.mode === 'fade' && !pl.hidden) {
        if (!pl.passed && px >= def.x + def.w) {
          pl.passed = true
          this.particles.emit(def.x + def.w - 6, def.y + def.h / 2, this.hooks.reducedMotion ? 3 : 8, {
            colors: [theme.solid, theme.accent2],
            speed: 120,
            life: 0.5,
            gravity: 700,
          })
        }
        if (pl.passed) {
          pl.fadeT = Math.min(1, pl.fadeT + dt / 0.3)
          if (pl.fadeT >= 1) active = false
        }
      }

      pl.x = bx
      pl.y = by
      pl.w = bw
      pl.h = bh
      pl.active = active
    }
  }

  update(dt: number, input: InputState) {
    if (this.done) {
      this.particles.update(dt)
      return
    }
    this.time += dt
    this.updatePressure()

    for (const h of this.hazards) {
      if (h.move) {
        const ph = (this.time / h.move.period + (h.move.phase ?? 0)) * Math.PI * 2
        h.curX = h.x + Math.sin(ph) * h.move.dx
        h.curY = h.y + Math.sin(ph) * h.move.dy
      } else {
        h.curX = h.x
        h.curY = h.y
      }
    }

    this.updatePlatforms(dt)

    // carry the player with the platform they are standing on
    if (this.ground && this.ground.active && this.player.onGround) {
      this.player.x += this.ground.x - this.ground.prevX
      this.player.y += this.ground.y - this.ground.prevY
    }

    const colliders: Solid[] = []
    const owners: RTPlatform[] = []
    for (const pl of this.platforms) {
      if (!pl.active) continue
      colliders.push({ x: pl.x, y: pl.y, w: pl.w, h: pl.h, active: true })
      owners.push(pl)
    }

    this.prevGround = this.ground
    const res = this.player.step(dt, input, colliders)
    const gi = res.ground ? colliders.indexOf(res.ground) : -1
    this.ground = gi >= 0 ? owners[gi] : null

    if (input.jumpPressed && this.player.onGround) this.hooks.sound('jump')
    if (!this.prevGround && this.ground) this.hooks.sound('land')
    // step-armed platforms fire whether you land on them or walk onto them
    if (this.ground?.def.morph?.armOnStep && !this.ground.armed) {
      this.ground.armed = true
      this.ground.t = 0
      this.hooks.sound('blip')
    }

    const pr = this.playerRect()

    for (const tr of this.triggers) {
      if (tr.fired) continue
      if (rectsOverlap(pr, tr.def)) {
        this.fireTrigger(tr)
        tr.fired = true
        if (this.done) return
      }
    }

    for (const h of this.hazards) {
      if (h.hidden) continue
      if (h.kind === 'saw') {
        if (circleRect(h.curX + h.w / 2, h.curY + h.h / 2, Math.min(h.w, h.h) / 2, pr)) {
          this.kill('Sliced by the line.')
          return
        }
      } else if (rectsOverlap(pr, { x: h.curX, y: h.curY, w: h.w, h: h.h })) {
        this.kill(h.kind === 'crusher' ? 'Flattened room service.' : 'Straight onto the spikes.')
        return
      }
    }

    for (const d of this.decoys) {
      if (rectsOverlap(pr, d)) {
        this.kill('That door was bait. The quiet one was real.')
        return
      }
    }

    if (this.pressureActive) {
      if (this.wallLeft > -1 && pr.x < this.wallLeft) return this.kill('The wall caught you.')
      if (this.wallRight < VIEW.w + 999 && pr.x + pr.w > this.wallRight) return this.kill('Crushed by the closing wall.')
      if (this.wallTop > -1 && pr.y < this.wallTop) return this.kill('The ceiling came down.')
      if (this.wallBottom < VIEW.h + 999 && pr.y + pr.h > this.wallBottom) return this.kill('The floor came up.')
      if (this.riseSurface < VIEW.h + 999 && pr.y + pr.h > this.riseSurface) {
        return this.kill('The basin took you.')
      }
    }

    if ((!this.exitHidden || this.exitRevealed) && rectsOverlap(pr, this.exit)) {
      this.done = true
      this.hooks.sound('win')
      this.hooks.complete()
      return
    }

    if (this.player.y > DEATH_Y) {
      this.kill('You fell out of the world.')
      return
    }

    this.particles.update(dt)
  }

  focus(): Vec {
    return { x: this.player.centerX, y: this.player.centerY }
  }

  destroy() {
    this.particles.clear()
  }

  render(g: CanvasRenderingContext2D, w: number, h: number) {
    g.fillStyle = theme.bg
    g.fillRect(0, 0, w, h)
    drawGrid(g, w, h, 32, 'rgba(255,150,80,0.045)')

    const grad = g.createRadialGradient(w * 0.5, h * 0.45, 40, w * 0.5, h * 0.45, w * 0.72)
    grad.addColorStop(0, 'rgba(255,150,60,0.06)')
    grad.addColorStop(1, 'rgba(0,0,0,0.55)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)

    this.drawPressure(g, w, h)

    for (const pl of this.platforms) this.drawPlatform(g, pl)
    for (const hz of this.hazards) if (!hz.hidden) this.drawHazard(g, hz)
    for (const tr of this.triggers) this.drawTrigger(g, tr)
    if (!this.exitHidden || this.exitRevealed) this.drawExit(g, this.exit)
    else this.drawExitSocket(g, this.exit)
    for (const d of this.decoys) this.drawDecoy(g, d)

    this.drawPlayer(g)
    this.particles.render(g)

    g.strokeStyle = 'rgba(255,150,80,0.18)'
    g.lineWidth = 2
    g.strokeRect(1, 1, w - 2, h - 2)

    this.drawHud(g, w)
  }

  private drawPressure(g: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.pressureActive) return
    const pr = this.level.pressure
    if (!pr) return
    if (pr.kind === 'walls') {
      const hatch = (r: Rect) => {
        g.save()
        g.beginPath()
        g.rect(r.x, r.y, r.w, r.h)
        g.clip()
        g.fillStyle = 'rgba(18,9,5,0.85)'
        g.fillRect(r.x, r.y, r.w, r.h)
        g.strokeStyle = 'rgba(255,90,46,0.32)'
        g.lineWidth = 1
        g.beginPath()
        for (let i = -h; i < w + h; i += 14) {
          g.moveTo(i, 0)
          g.lineTo(i + h, h)
        }
        g.stroke()
        g.restore()
      }
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 8)
      g.globalAlpha = 0.45 + 0.45 * pulse
      g.fillStyle = theme.hazard
      if (this.wallLeft > 0) {
        hatch({ x: 0, y: 0, w: this.wallLeft, h })
        g.fillRect(this.wallLeft - 3, 0, 3, h)
      }
      if (this.wallRight < w) {
        hatch({ x: this.wallRight, y: 0, w: w - this.wallRight, h })
        g.fillRect(this.wallRight, 0, 3, h)
      }
      if (this.wallTop > 0) {
        hatch({ x: 0, y: 0, w, h: this.wallTop })
        g.fillRect(0, this.wallTop - 3, w, 3)
      }
      if (this.wallBottom < h) {
        hatch({ x: 0, y: this.wallBottom, w, h: h - this.wallBottom })
        g.fillRect(0, this.wallBottom, w, 3)
      }
      g.globalAlpha = 1
    } else {
      const y = this.riseSurface
      if (y < h) {
        const liquid = g.createLinearGradient(0, y, 0, h)
        liquid.addColorStop(0, 'rgba(255,90,46,0.5)')
        liquid.addColorStop(1, 'rgba(70,16,8,0.92)')
        g.fillStyle = liquid
        g.fillRect(0, y, w, h - y)
        g.fillStyle = 'rgba(255,160,90,0.85)'
        g.beginPath()
        g.moveTo(0, y)
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.05 + this.time * 3) * 3)
        g.lineTo(w, y + 8)
        g.lineTo(0, y + 8)
        g.closePath()
        g.fill()
      }
    }
  }

  private body(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    tag: 'metal' | 'grate' | 'panic' | undefined,
    alpha = 1,
  ) {
    if (alpha <= 0 || w <= 0) return
    g.save()
    g.globalAlpha = alpha
    fillRoundRect(g, x, y, w, h, 3, tag === 'panic' ? '#4a2a22' : theme.solid)
    g.fillStyle = tag === 'panic' ? theme.hazard : theme.solidTop
    g.fillRect(x, y, w, 3)
    if (tag === 'grate') {
      g.strokeStyle = 'rgba(0,0,0,0.4)'
      g.lineWidth = 1
      g.beginPath()
      for (let gx = x + 8; gx < x + w - 4; gx += 12) {
        g.moveTo(gx, y + 4)
        g.lineTo(gx, y + h - 2)
      }
      g.stroke()
    }
    g.restore()
  }

  private timerBar(g: CanvasRenderingContext2D, cx: number, y: number, frac: number, color: string) {
    const W = 46
    const H = 5
    const x = cx - W / 2
    fillRoundRect(g, x, y, W, H, 2, 'rgba(0,0,0,0.6)')
    fillRoundRect(g, x + 1, y + 1, Math.max(0, (W - 2) * clamp(frac, 0, 1)), H - 2, 1, color)
    strokeRoundRect(g, x, y, W, H, 2, 'rgba(255,255,255,0.3)', 1)
  }

  private drawPlatform(g: CanvasRenderingContext2D, pl: RTPlatform) {
    const def = pl.def
    const mode = def.mode ?? 'static'
    const live = pl.active && !pl.hidden

    if (mode === 'gate') {
      g.save()
      g.strokeStyle = 'rgba(255,90,46,0.4)'
      g.lineWidth = 2
      g.strokeRect(def.x + 1, def.y + 1, def.w - 2, def.h - 2)
      g.fillStyle = 'rgba(255,90,46,0.08)'
      g.fillRect(def.x + 3, def.y + 3, def.w - 6, def.h - 6)
      g.restore()
      if (!live) return
    }

    if (mode === 'blink') {
      if (!live) {
        g.save()
        g.globalAlpha = 0.4
        strokeRoundRect(g, def.x, def.y, def.w, def.h, 3, theme.hazard, 1.5)
        g.restore()
        this.timerBar(g, def.x + def.w / 2, def.y - 10, pl.blinkCountdown / (def.blink?.on ?? 1), theme.accent)
        return
      }
      this.body(g, pl.x, pl.y, pl.w, pl.h, def.tag)
      this.timerBar(g, pl.x + pl.w / 2, pl.y - 10, pl.blinkCountdown / (def.blink?.on ?? 1), theme.exit)
      return
    }

    if (mode === 'fade') {
      const a = 1 - pl.fadeT
      if (a <= 0) return
      this.body(g, pl.x, pl.y, pl.w, pl.h, def.tag, a)
      return
    }

    this.body(g, pl.x, pl.y, pl.w, pl.h, def.tag)

    if (def.morph && (mode === 'shrink' || mode === 'retract')) {
      const m = def.morph
      const warning = pl.armed && pl.t < m.warn && m.warn > 0
      g.save()
      g.setLineDash([5, 4])
      g.lineWidth = 1.5
      g.strokeStyle = warning ? theme.hazard : 'rgba(255,150,80,0.5)'
      if (mode === 'shrink') {
        const toW = m.toW ?? def.w
        let fx = def.x
        if (m.anchor === 'right') fx = def.x + def.w - toW
        else if (m.anchor === 'center') fx = def.x + (def.w - toW) / 2
        g.strokeRect(fx + 0.5, def.y + 0.5, Math.max(1, toW) - 1, def.h - 1)
      } else {
        const axis = m.axis ?? 'x'
        const dx = axis === 'x' ? m.travel ?? 0 : 0
        const dy = axis === 'y' ? m.travel ?? 0 : 0
        g.strokeRect(def.x + dx + 0.5, def.y + dy + 0.5, def.w - 1, def.h - 1)
      }
      g.restore()
      if (warning) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 16)
        g.save()
        g.globalAlpha = 0.35 + 0.45 * pulse
        strokeRoundRect(g, pl.x - 1, pl.y - 1, pl.w + 2, pl.h + 2, 3, theme.hazard, 2)
        g.restore()
        this.timerBar(g, pl.x + pl.w / 2, pl.y - 10, 1 - pl.t / m.warn, theme.hazard)
      }
    }
  }

  private drawHazard(g: CanvasRenderingContext2D, hz: RTHazard) {
    const kind = hz.kind ?? 'spike'
    if (kind === 'saw') {
      const cx = hz.curX + hz.w / 2
      const cy = hz.curY + hz.h / 2
      const r = Math.min(hz.w, hz.h) / 2
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
      g.fillStyle = '#2a1208'
      g.beginPath()
      g.arc(0, 0, r * 0.3, 0, Math.PI * 2)
      g.fill()
      g.restore()
      return
    }
    if (kind === 'crusher') {
      fillRoundRect(g, hz.curX, hz.curY, hz.w, hz.h, 4, '#4a2a22')
      g.save()
      g.beginPath()
      g.rect(hz.curX, hz.curY, hz.w, hz.h)
      g.clip()
      g.strokeStyle = theme.hazard
      g.lineWidth = 6
      g.beginPath()
      for (let i = -hz.h; i < hz.w + hz.h; i += 12) {
        g.moveTo(hz.curX + i, hz.curY)
        g.lineTo(hz.curX + i + hz.h, hz.curY + hz.h)
      }
      g.stroke()
      g.restore()
      return
    }
    const count = Math.max(1, Math.floor(hz.w / 20))
    g.fillStyle = theme.hazard
    for (let i = 0; i < count; i++) {
      const sx = hz.curX + (hz.w / count) * i
      const sw = hz.w / count
      g.beginPath()
      g.moveTo(sx, hz.curY + hz.h)
      g.lineTo(sx + sw / 2, hz.curY)
      g.lineTo(sx + sw, hz.curY + hz.h)
      g.closePath()
      g.fill()
    }
  }

  private drawTrigger(g: CanvasRenderingContext2D, tr: RTTrigger) {
    const d = tr.def
    const cx = d.x + d.w / 2
    const cy = d.y + d.h / 2
    g.save()
    g.globalAlpha = tr.fired ? 0.2 : 0.45
    g.strokeStyle = tr.fired ? theme.exit : theme.accent
    g.lineWidth = 1.5
    g.setLineDash([4, 5])
    g.strokeRect(d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1)
    g.setLineDash([])
    g.globalAlpha = tr.fired ? 0.35 : 1
    fillRoundRect(g, cx - 12, cy - 9, 24, 18, 3, tr.fired ? '#123a2c' : theme.panel)
    g.fillStyle = tr.fired ? theme.exit : theme.accent
    g.fillRect(cx - 3, cy - 6, 6, tr.fired ? 6 : 11)
    g.restore()
  }

  private drawDecoy(g: CanvasRenderingContext2D, r: Rect) {
    g.save()
    g.shadowColor = 'rgba(255,80,60,0.5)'
    g.shadowBlur = 20
    fillRoundRect(g, r.x, r.y, r.w, r.h, 4, '#3a1014')
    g.restore()
    strokeRoundRect(g, r.x, r.y, r.w, r.h, 4, theme.hazard, 2)
    g.fillStyle = 'rgba(255,90,46,0.18)'
    g.fillRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10)
    g.fillStyle = theme.hazard
    g.beginPath()
    g.moveTo(r.x + r.w * 0.36, r.y + r.h * 0.34)
    g.lineTo(r.x + r.w * 0.64, r.y + r.h * 0.5)
    g.lineTo(r.x + r.w * 0.36, r.y + r.h * 0.66)
    g.closePath()
    g.fill()
    g.strokeStyle = 'rgba(255,225,205,0.8)'
    g.lineWidth = 1.5
    g.beginPath()
    g.moveTo(r.x + r.w * 0.5, r.y + 3)
    g.lineTo(r.x + r.w * 0.44, r.y + r.h * 0.45)
    g.lineTo(r.x + r.w * 0.54, r.y + r.h * 0.6)
    g.lineTo(r.x + r.w * 0.48, r.y + r.h - 3)
    g.stroke()
  }

  private drawExit(g: CanvasRenderingContext2D, r: Rect) {
    g.save()
    g.shadowColor = 'rgba(76,224,168,0.5)'
    g.shadowBlur = 22
    fillRoundRect(g, r.x, r.y, r.w, r.h, 4, '#0f3a2c')
    g.restore()
    strokeRoundRect(g, r.x, r.y, r.w, r.h, 4, theme.exit, 2)
    g.fillStyle = 'rgba(76,224,168,0.16)'
    g.fillRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10)
    g.fillStyle = theme.exit
    g.beginPath()
    g.moveTo(r.x + r.w * 0.36, r.y + r.h * 0.34)
    g.lineTo(r.x + r.w * 0.64, r.y + r.h * 0.5)
    g.lineTo(r.x + r.w * 0.36, r.y + r.h * 0.66)
    g.closePath()
    g.fill()
    g.fillStyle = 'rgba(76,224,168,0.12)'
    g.fillRect(r.x + 6, r.y - 12, r.w - 12, 12)
  }

  private drawExitSocket(g: CanvasRenderingContext2D, r: Rect) {
    fillRoundRect(g, r.x, r.y, r.w, r.h, 4, 'rgba(10,20,16,0.6)')
    strokeRoundRect(g, r.x, r.y, r.w, r.h, 4, 'rgba(76,224,168,0.3)', 2)
    g.fillStyle = 'rgba(76,224,168,0.25)'
    g.fillRect(r.x + 6, r.y + r.h - 10, r.w - 12, 4)
    label(g, '?', r.x + r.w / 2, r.y + r.h / 2 + 2, {
      size: 16,
      color: 'rgba(120,255,200,0.45)',
      align: 'center',
      baseline: 'middle',
    })
  }

  private drawPlayer(g: CanvasRenderingContext2D) {
    const p = this.player
    const stretch = clamp(p.vy / 1400, -0.3, 0.3)
    g.save()
    g.translate(p.centerX, p.y + p.h)
    g.scale(1 - stretch, 1 + stretch)
    g.save()
    g.shadowColor = 'rgba(255,220,170,0.4)'
    g.shadowBlur = 12
    fillRoundRect(g, -p.w / 2, -p.h, p.w, p.h, 6, theme.player)
    g.restore()
    g.fillStyle = '#2a1e14'
    const e = p.facing
    g.fillRect(-4 + e * 2, -p.h + 10, 3, 5)
    g.fillRect(2 + e * 2, -p.h + 10, 3, 5)
    g.restore()
  }

  private drawHud(g: CanvasRenderingContext2D, w: number) {
    label(g, `LEVEL ${this.index}/10`, 16, 26, { size: 12, color: 'rgba(255,200,150,0.55)', weight: '700' })
    label(g, this.level.name, 16, 47, { size: 16, color: theme.text })
    label(g, this.level.hint, 16, 67, { size: 12, color: 'rgba(255,235,220,0.62)', weight: '500' })

    const bw = 240
    const bx = w - bw - 18
    const by = 24
    const bh = 13
    const stable = !this.pressureActive
    label(g, stable ? 'STRUCTURE STABLE' : 'WORLD INTEGRITY', bx, by - 6, {
      size: 11,
      color: 'rgba(255,220,190,0.7)',
      weight: '700',
    })
    fillRoundRect(g, bx, by, bw, bh, 3, 'rgba(0,0,0,0.55)')
    const frac = stable ? 1 : 1 - this.pressureProgress
    const col = stable ? theme.exit : this.pressureProgress > 0.66 ? theme.hazard : theme.accent
    fillRoundRect(g, bx + 1, by + 1, Math.max(0, (bw - 2) * clamp(frac, 0, 1)), bh - 2, 2, col)
    strokeRoundRect(g, bx, by, bw, bh, 3, 'rgba(255,255,255,0.25)', 1)
    label(g, stable ? 'NOMINAL' : `${Math.round(this.pressureProgress * 100)}% CLOSED`, bx + bw / 2, by + bh - 3, {
      size: 9,
      color: '#1a0e08',
      align: 'center',
      weight: '700',
    })
  }
}

export const game: GameModule = {
  slug: 'shrinking-world',
  title: 'Shrinking World',
  tagline: 'The room is closing. Keep moving or be part of it.',
  theme,
  controls: [
    { keys: 'A / D or ←/→', label: 'Move' },
    { keys: 'W / ↑ / Space', label: 'Jump' },
    { keys: 'R', label: 'Restart level' },
    { keys: 'Esc', label: 'Pause' },
  ],
  instructions: [
    'Reach the green exit before the world closes around you.',
    'Retracting, blinking and crumbling floors are telegraphed - read the bars.',
    'Plates you leave behind drop away: there is no going back.',
    'Later rooms bait you with fake doors. The quiet exit is the real one.',
    'If the jaws reach you, you are already too late.',
  ],
  levels: shrinkingLevels.length,
  view: VIEW,
  create: (hooks) => new ShrinkingWorldRuntime(hooks),
}

export default game
