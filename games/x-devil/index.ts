import { circleRect, clamp, rectsOverlap } from '@/lib/game/math'
import { ParticleSystem } from '@/lib/game/particles'
import { PlatformerPlayer, type Solid } from '@/lib/game/platformer'
import { drawGrid, fillRoundRect, label, roundRect, strokeRoundRect } from '@/lib/game/draw'
import type { GameHooks, GameModule, GameRuntime, GameTheme, InputState, Rect, Vec } from '@/lib/game/types'
import { xDevilLevels } from './levels'
import type { XDDecoy, XDHazard, XDLevel, XDSolid, XDSpring, XDTrigger } from './types'

const VIEW = { w: 960, h: 540 }
const GRAVITY = 2100
const MARKER_KEY = 'xg.xdevil.markers'

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

interface RTSolid extends XDSolid {
  hidden: boolean
  fallTimer: number
  falling: boolean
  vy: number
  curX: number
  curY: number
  prevX: number
  prevY: number
}

interface RTHazard extends XDHazard {
  hidden: boolean
  curX: number
  curY: number
}

interface RTDecoy extends XDDecoy {
  hidden: boolean
}

interface RTTrigger {
  def: XDTrigger
  fired: boolean
}

function loadMarkers(level: number): Vec[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(`${MARKER_KEY}.${level}`)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(-14) : []
  } catch {
    return []
  }
}

function saveMarkers(level: number, markers: Vec[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${MARKER_KEY}.${level}`, JSON.stringify(markers.slice(-14)))
  } catch {
    /* ignore */
  }
}

class XDevilRuntime implements GameRuntime {
  private hooks: GameHooks
  private player = new PlatformerPlayer()
  private particles = new ParticleSystem()
  private index = 0
  private level!: XDLevel
  private solids: RTSolid[] = []
  private hazards: RTHazard[] = []
  private decoys: RTDecoy[] = []
  private springs: XDSpring[] = []
  private triggers: RTTrigger[] = []
  private exit!: Rect
  private markers: Vec[] = []
  private time = 0
  private ground: RTSolid | null = null

  constructor(hooks: GameHooks) {
    this.hooks = hooks
  }

  load(level: number) {
    const def = xDevilLevels[clamp(level - 1, 0, xDevilLevels.length - 1)]
    this.index = level
    this.level = def
    this.time = 0
    this.ground = null
    this.particles.clear()
    this.player = new PlatformerPlayer()
    this.player.reset(def.start.x, def.start.y)

    this.solids = def.solids.map((s) => ({
      ...s,
      hidden: s.hidden ?? false,
      fallTimer: -1,
      falling: false,
      vy: 0,
      curX: s.x,
      curY: s.y,
      prevX: s.x,
      prevY: s.y,
    }))
    this.hazards = def.hazards.map((h) => ({ ...h, hidden: h.hidden ?? false, curX: h.x, curY: h.y }))
    this.decoys = (def.decoys ?? []).map((d) => ({ ...d, hidden: d.hidden ?? false }))
    this.springs = (def.springs ?? []).map((s) => ({ ...s }))
    this.triggers = (def.triggers ?? []).map((t) => ({ def: t, fired: false }))
    this.exit = { ...def.exit }
    this.markers = loadMarkers(level)
  }

  private die(msg?: string) {
    const p = this.player
    this.markers.push({ x: p.centerX, y: p.centerY })
    saveMarkers(this.index, this.markers)
    this.hooks.death(msg)
  }

  private findEntity(id: string): { hidden: boolean } | null {
    return (
      this.solids.find((s) => s.id === id) ??
      this.hazards.find((h) => h.id === id) ??
      this.decoys.find((d) => d.id === id) ??
      null
    )
  }

  private fireTrigger(t: XDTrigger) {
    if (t.show) for (const id of t.show) {
      const e = this.findEntity(id)
      if (e) e.hidden = false
    }
    if (t.hide) for (const id of t.hide) {
      const e = this.findEntity(id)
      if (e) e.hidden = true
    }
    if (t.collapse) for (const id of t.collapse) {
      const s = this.solids.find((x) => x.id === id)
      if (s && s.fallTimer < 0) s.fallTimer = 0
    }
    if (t.moveExit) {
      this.exit = { ...this.exit, x: this.exit.x + t.moveExit.dx, y: this.exit.y + t.moveExit.dy }
    }
    if (t.shake) this.hooks.shake(t.shake)
    if (t.show && t.show.length) this.hooks.sound('blip')
    if (t.kill) this.die('Right into the invisible wall. Admirable.')
  }

  update(dt: number, input: InputState) {
    this.time += dt
    const p = this.player

    // moving solids
    for (const s of this.solids) {
      s.prevX = s.curX
      s.prevY = s.curY
      if (s.move) {
        const phase = (this.time / s.move.period + (s.move.phase ?? 0)) * Math.PI * 2
        s.curX = s.x + Math.sin(phase) * s.move.dx
        s.curY = s.y + Math.sin(phase) * s.move.dy
      }
      if (s.falling) {
        s.vy += GRAVITY * dt
        s.curY += s.vy * dt
      } else if (s.fallTimer >= 0 && s.kind === 'fall') {
        s.fallTimer += dt
        if (s.fallTimer >= (s.delay ?? 0.4)) {
          s.falling = true
          s.vy = 0
          this.hooks.sound('hit')
          this.particles.emit(s.curX + s.w / 2, s.curY + s.h, 12, {
            colors: [theme.solid, theme.solidTop, theme.hazard],
            speed: 140,
            life: 0.5,
            gravity: 900,
          })
        }
      }
    }

    // moving hazards
    for (const h of this.hazards) {
      if (h.move) {
        const phase = (this.time / h.move.period + (h.move.phase ?? 0)) * Math.PI * 2
        h.curX = h.x + Math.sin(phase) * h.move.dx
        h.curY = h.y + Math.sin(phase) * h.move.dy
      }
      if (h.chase) {
        const target = p.centerX - h.w / 2
        const dir = Math.sign(target - h.curX)
        if (dir !== 0) h.curX += dir * h.chase.speed * dt
        h.curX = clamp(h.curX, h.chase.min, h.chase.max)
      }
    }

    // carry on moving solids (only used if a level moves a platform underfoot)
    if (this.ground?.move && p.onGround) {
      const g = this.ground
      p.x += g.curX - g.prevX
      p.y += g.curY - g.prevY
    }

    // build colliders
    const colliders: Solid[] = this.solids.map((s) => ({
      x: s.curX,
      y: s.curY,
      w: s.w,
      h: s.h,
      active: !s.hidden && s.kind !== 'fake' && s.curY < 640,
      tag: s.kind,
    }))

    const before = this.ground
    const res = p.step(dt, input, colliders)
    const groundSolid = res.ground
    this.ground = groundSolid ? this.solids.find((s) => s.curX === groundSolid.x && s.curY === groundSolid.y) ?? null : null

    // landing feedback + bouncy
    if (!before && this.ground) {
      const g = this.ground
      if (g.kind === 'bouncy') {
        p.vy = -900
        this.hooks.sound('flip')
        this.particles.emit(p.centerX, p.y + p.h, 10, { colors: [theme.accent2, theme.accent], speed: 220, life: 0.4, gravity: 500 })
      } else {
        this.hooks.sound('land')
      }
      // start collapse
      if (g.kind === 'fall' && g.fallTimer < 0) g.fallTimer = 0
    }

    if (input.jumpPressed && p.onGround) this.hooks.sound('jump')

    // springs
    for (const s of this.springs) {
      if (rectsOverlap(this.playerRect(), s)) {
        p.vy = -s.power
        this.hooks.sound('flip')
      }
    }

    // triggers
    const pr = this.playerRect()
    for (const t of this.triggers) {
      if (t.fired && t.def.once) continue
      if (rectsOverlap(pr, t.def)) {
        this.fireTrigger(t.def)
        t.fired = true
      }
    }

    // hazards
    for (const h of this.hazards) {
      if (h.hidden) continue
      if (h.kind === 'saw') {
        const cx = h.curX + h.w / 2
        const cy = h.curY + h.h / 2
        if (circleRect(cx, cy, Math.min(h.w, h.h) / 2, pr)) {
          this.die('The saw says hello.')
          return
        }
      } else if (rectsOverlap(pr, { x: h.curX, y: h.curY, w: h.w, h: h.h })) {
        this.die()
        return
      }
    }

    // decoys (fake doors)
    for (const d of this.decoys) {
      if (d.hidden) continue
      if (rectsOverlap(pr, d)) {
        this.die('That was not the door. It never was.')
        return
      }
    }

    // exit
    if (rectsOverlap(pr, this.exit)) {
      this.hooks.sound('win')
      this.hooks.complete()
      return
    }

    // fell out of the world
    if (p.y > 640) {
      this.die('The floor said goodbye.')
      return
    }

    this.particles.update(dt)
  }

  private playerRect(): Rect {
    const p = this.player
    return { x: p.x, y: p.y, w: p.w, h: p.h }
  }

  focus(): Vec {
    return { x: this.player.centerX, y: this.player.centerY }
  }

  render(g: CanvasRenderingContext2D, w: number, h: number) {
    g.fillStyle = theme.bg
    g.fillRect(0, 0, w, h)
    drawGrid(g, w, h, 40, 'rgba(255,255,255,0.035)')

    // decorative back glow
    const grad = g.createRadialGradient(w * 0.5, h * 0.1, 20, w * 0.5, h * 0.1, w * 0.7)
    grad.addColorStop(0, 'rgba(0,102,255,0.14)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)

    // solids
    for (const s of this.solids) {
      if (s.hidden && s.kind !== 'fake') continue
      const x = s.curX
      const y = s.curY
      if (s.kind === 'fake') {
        fillRoundRect(g, x, y, s.w, s.h, 3, 'rgba(90,90,90,0.35)')
        strokeRoundRect(g, x, y, s.w, s.h, 3, 'rgba(189,189,189,0.25)', 1)
        continue
      }
      if (s.kind === 'bouncy') {
        fillRoundRect(g, x, y, s.w, s.h, 4, theme.accent2)
        g.fillStyle = 'rgba(255,255,255,0.5)'
        g.fillRect(x + 3, y + 2, s.w - 6, 2)
        continue
      }
      fillRoundRect(g, x, y, s.w, s.h, 3, s.kind === 'fall' && s.fallTimer >= 0 ? '#3a3a3a' : theme.solid)
      g.fillStyle = s.kind === 'fall' && s.fallTimer >= 0 ? theme.hazard : theme.solidTop
      g.fillRect(x, y, s.w, 3)
      if (s.kind === 'vanish') {
        g.strokeStyle = 'rgba(255,0,0,0.4)'
        g.lineWidth = 1
        g.strokeRect(x + 0.5, y + 0.5, s.w - 1, s.h - 1)
      }
      if (s.kind === 'fall') {
        g.strokeStyle = 'rgba(255,255,255,0.25)'
        g.beginPath()
        g.moveTo(x + s.w / 2 - 8, y + 4)
        g.lineTo(x + s.w / 2, y + s.h - 2)
        g.lineTo(x + s.w / 2 + 8, y + 4)
        g.stroke()
      }
    }

    // springs
    for (const s of this.springs) {
      fillRoundRect(g, s.x, s.y, s.w, s.h, 3, theme.accent2)
      g.fillStyle = 'rgba(255,255,255,0.6)'
      g.fillRect(s.x + 4, s.y + 2, s.w - 8, 2)
    }

    // hazards
    for (const hz of this.hazards) {
      if (hz.hidden) continue
      if (hz.kind === 'saw') {
        const cx = hz.curX + hz.w / 2
        const cy = hz.curY + hz.h / 2
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
      } else {
        // spikes
        const spikeW = 20
        const count = Math.max(1, Math.floor(hz.w / spikeW))
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
    }

    // exit door
    this.drawDoor(g, this.exit, true)
    // decoys
    for (const d of this.decoys) if (!d.hidden) this.drawDoor(g, d, true, true)

    // death markers
    for (const m of this.markers) {
      g.strokeStyle = 'rgba(255,0,0,0.45)'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(m.x - 5, m.y - 5)
      g.lineTo(m.x + 5, m.y + 5)
      g.moveTo(m.x + 5, m.y - 5)
      g.lineTo(m.x - 5, m.y + 5)
      g.stroke()
    }

    // player
    this.drawPlayer(g)

    this.particles.render(g)

    // level tag
    label(g, `LEVEL ${this.index}`, 16, 28, { size: 13, color: 'rgba(255,255,255,0.5)', weight: '700' })
    label(g, this.level.name, 16, 48, { size: 15, color: 'rgba(255,255,255,0.85)' })
  }

  private drawDoor(g: CanvasRenderingContext2D, r: Rect, real: boolean, decoy = false) {
    const glow = decoy ? 'rgba(255,80,100,0.35)' : 'rgba(60,230,160,0.4)'
    g.save()
    g.shadowColor = glow
    g.shadowBlur = 22
    fillRoundRect(g, r.x, r.y, r.w, r.h, 4, real ? '#123a2c' : '#3a1220')
    g.restore()
    strokeRoundRect(g, r.x, r.y, r.w, r.h, 4, theme.exit, 2)
    // inner door
    g.fillStyle = 'rgba(60,230,160,0.16)'
    g.fillRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10)
    // chevron
    g.fillStyle = theme.exit
    g.beginPath()
    g.moveTo(r.x + r.w * 0.36, r.y + r.h * 0.34)
    g.lineTo(r.x + r.w * 0.64, r.y + r.h * 0.5)
    g.lineTo(r.x + r.w * 0.36, r.y + r.h * 0.66)
    g.closePath()
    g.fill()
    // subtle tell: decoys carry a faint hairline crack
    if (decoy) {
      g.strokeStyle = 'rgba(255,90,110,0.55)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(r.x + r.w * 0.5, r.y + 4)
      g.lineTo(r.x + r.w * 0.46, r.y + r.h * 0.5)
      g.lineTo(r.x + r.w * 0.54, r.y + r.h - 4)
      g.stroke()
    }
  }

  private drawPlayer(g: CanvasRenderingContext2D) {
    const p = this.player
    const stretch = clamp(p.vy / 1400, -0.3, 0.3)
    const sx = 1 - stretch
    const sy = 1 + stretch
    const cx = p.centerX
    const by = p.y + p.h
    g.save()
    g.translate(cx, by)
    g.scale(sx, sy)
    fillRoundRect(g, -p.w / 2, -p.h, p.w, p.h, 6, theme.player)
    // eyes
    g.fillStyle = '#000000'
    const eyeDir = p.facing
    g.fillRect(-4 + eyeDir * 2, -p.h + 10, 3, 5)
    g.fillRect(2 + eyeDir * 2, -p.h + 10, 3, 5)
    g.restore()
  }
}

export const game: GameModule = {
  slug: 'x-devil',
  title: 'X Devil',
  tagline: 'The floor is a suggestion. The door is probably a lie.',
  theme,
  controls: [
    { keys: 'A / D or ←/→', label: 'Move' },
    { keys: 'W / ↑ / Space', label: 'Jump' },
    { keys: 'R', label: 'Restart' },
    { keys: 'Esc', label: 'Pause' },
  ],
  instructions: [
    'Reach the glowing door at the end of each level.',
    'Everything is exactly as it looks. Until it is not.',
    'Traps are deterministic — every death is learnable.',
    'Faint markers show where you died before.',
  ],
  levels: xDevilLevels.length,
  view: VIEW,
  create: (hooks) => new XDevilRuntime(hooks),
}

export default game
