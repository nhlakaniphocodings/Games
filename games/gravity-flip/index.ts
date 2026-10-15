import { drawGrid, fillRoundRect, label, strokeRoundRect } from '@/lib/game/draw'
import { clamp, makeRng, rectsOverlap } from '@/lib/game/math'
import { ParticleSystem } from '@/lib/game/particles'
import { PlatformerPlayer, type Solid } from '@/lib/game/platformer'
import type { GameHooks, GameModule, GameRuntime, GameTheme, InputState, Rect, Vec } from '@/lib/game/types'
import { gravityFlipLevels } from './levels'
import type { Dir, GFHazard, GFLevel, GFSolid, GFSwitch, GFZone } from './types'

const VIEW = { w: 960, h: 540 }

/** Space / gravity identity, rendered in the shared monochrome palette. */
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

const DEATH_FALL = 640
const DEATH_RISE = -120

interface RTSolid extends GFSolid {
  curX: number
  curY: number
  prevX: number
  prevY: number
}
interface RTHazard extends GFHazard {
  curX: number
  curY: number
}
interface RTSwitch {
  def: GFSwitch
  armed: boolean
}
interface RTZone {
  def: GFZone
  inside: boolean
  fired: boolean
}

interface Star {
  x: number
  y: number
  r: number
  a: number
  tw: number
}

class GravityFlipRuntime implements GameRuntime {
  private hooks: GameHooks
  private player = new PlatformerPlayer()
  private particles = new ParticleSystem()

  private index = 1
  private level!: GFLevel
  private solids: RTSolid[] = []
  private hazards: RTHazard[] = []
  private switches: RTSwitch[] = []
  private zones: RTZone[] = []
  private decoys: Rect[] = []
  private exit!: Rect
  private exitNeeds: Dir = 1

  private time = 0
  private flips = 0
  private locked = 0
  private riding: RTSolid | null = null
  private stars: Star[] = []

  constructor(hooks: GameHooks) {
    this.hooks = hooks
    const rng = makeRng(0x91a5)
    for (let i = 0; i < 90; i++) {
      this.stars.push({ x: rng() * VIEW.w, y: rng() * VIEW.h, r: 0.5 + rng() * 1.6, a: 0.15 + rng() * 0.5, tw: rng() * 6.28 })
    }
  }

  load(level: number) {
    const def = gravityFlipLevels[clamp(Math.floor(level) - 1, 0, gravityFlipLevels.length - 1)]
    this.index = clamp(Math.floor(level), 1, gravityFlipLevels.length)
    this.level = def
    this.time = 0
    this.flips = 0
    this.locked = 0
    this.riding = null
    this.particles.clear()

    this.player = new PlatformerPlayer()
    this.player.reset(def.start.x, def.start.y)
    if (def.startDir) this.player.gravityDir = def.startDir

    this.solids = def.solids.map((s) => ({ ...s, curX: s.x, curY: s.y, prevX: s.x, prevY: s.y }))
    this.hazards = def.hazards.map((hz) => ({ ...hz, curX: hz.x, curY: hz.y }))
    this.switches = (def.switches ?? []).map((sw) => ({ def: sw, armed: true }))
    this.zones = (def.zones ?? []).map((z) => ({ def: z, inside: false, fired: false }))
    this.decoys = (def.decoys ?? []).map((d) => ({ ...d }))
    this.exit = { x: def.exit.x, y: def.exit.y, w: def.exit.w, h: def.exit.h }
    this.exitNeeds = def.exit.needs
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  private get p() {
    return this.player
  }

  private playerRect(): Rect {
    const p = this.player
    return { x: p.x, y: p.y, w: p.w, h: p.h }
  }

  private isCracked(s: GFSolid): boolean {
    return s.spikeAfterFlips !== undefined && this.flips >= s.spikeAfterFlips
  }

  private doFlip() {
    const p = this.player
    p.flip()
    this.flips++
    this.hooks.sound('flip')
    this.hooks.shake(0.12)
    if (!this.hooks.reducedMotion) {
      this.particles.emit(p.centerX, p.centerY, 14, {
        colors: [theme.accent2, theme.accent, theme.player],
        speed: 220,
        life: 0.42,
        size: 4,
        gravity: 120 * p.gravityDir,
        shape: 'circle',
      })
    }
  }

  private die(msg?: string) {
    if (!this.hooks.reducedMotion) {
      this.particles.emit(this.player.centerX, this.player.centerY, 18, {
        colors: [theme.hazard, theme.accent2, theme.player],
        speed: 240,
        life: 0.5,
        gravity: 400,
      })
    }
    this.hooks.death(msg)
  }

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  update(dt: number, input: InputState) {
    this.time += dt
    this.locked = Math.max(0, this.locked - dt)
    const p = this.player

    if (input.jumpPressed) this.doFlip()

    // --- move solids --------------------------------------------------------
    for (const s of this.solids) {
      s.prevX = s.curX
      s.prevY = s.curY
      let tx = s.x
      let ty = s.y
      if (s.move) {
        const ph = (this.time / s.move.period + (s.move.phase ?? 0)) * Math.PI * 2
        tx = s.x + Math.sin(ph) * s.move.dx
        ty = s.y + Math.sin(ph) * s.move.dy
        s.curX = tx
        s.curY = ty
      } else if (s.gravitySlide) {
        ty = p.gravityDir === 1 ? s.gravitySlide.yDown : s.gravitySlide.yUp
        const spd = s.gravitySlide.speed ?? 600
        s.curX = s.x
        s.curY = approachTo(s.curY, ty, spd * dt)
      }
    }

    // --- carry the player on a moving platform ------------------------------
    if (this.riding) {
      const dx = this.riding.curX - this.riding.prevX
      const dy = this.riding.curY - this.riding.prevY
      if (dx !== 0 || dy !== 0) {
        p.x += dx
        p.y += dy
      }
    }

    // --- build colliders (cracked tiles drop out, fakes are passable) -------
    const colliders: Solid[] = []
    const owners: (RTSolid | null)[] = []
    for (const s of this.solids) {
      if (s.kind === 'fake') continue
      if (this.isCracked(s)) continue
      colliders.push({ x: s.curX, y: s.curY, w: s.w, h: s.h, active: true, tag: s.id ?? '' })
      owners.push(s)
    }
    for (const hz of this.hazards) {
      hz.curX = hz.x
      hz.curY = hz.y
      if (hz.track) {
        const ty = p.gravityDir === 1 ? hz.track.yDown : hz.track.yUp
        hz.curY = approachTo(hz.curY, ty, (hz.track.speed ?? 220) * dt)
      } else if (hz.move) {
        const ph = (this.time / hz.move.period + (hz.move.phase ?? 0)) * Math.PI * 2
        hz.curX = hz.x + Math.sin(ph) * hz.move.dx
        hz.curY = hz.y + Math.sin(ph) * hz.move.dy
      }
    }

    const res = p.step(dt, input, colliders, { jumpEnabled: false })
    const gi = res.ground ? colliders.indexOf(res.ground) : -1
    this.riding = gi >= 0 ? owners[gi] : null

    // --- gravity switches ---------------------------------------------------
    const pr = this.playerRect()
    for (const sw of this.switches) {
      const r = sw.def
      const hit = rectsOverlap(pr, inset(r, 2))
      if (hit && sw.armed) {
        sw.armed = false
        this.doFlip()
      } else if (!hit) {
        sw.armed = true
      }
    }

    // --- gravity reversal zones --------------------------------------------
    for (const z of this.zones) {
      const inside = rectsOverlap(pr, z.def)
      if (inside && !z.inside && (!z.def.once || !z.fired)) {
        z.fired = true
        if (p.gravityDir !== z.def.dir) this.doFlip()
      }
      z.inside = inside
    }

    // --- cracked ground erupts ---------------------------------------------
    for (const s of this.solids) {
      if (!this.isCracked(s)) continue
      if (rectsOverlap(pr, inset(this.crackRect(s), 3))) {
        this.die('That ground was stable until you flipped.')
        return
      }
    }

    // --- hazards ------------------------------------------------------------
    for (const hz of this.hazards) {
      const active = hz.activeAfterFlips === undefined || this.flips >= hz.activeAfterFlips
      if (!active) continue
      const r = hz.kind === 'barrier' ? { x: hz.curX + 2, y: hz.curY + 2, w: hz.w - 4, h: hz.h - 4 } : inset({ x: hz.curX, y: hz.curY, w: hz.w, h: hz.h }, 4)
      if (rectsOverlap(pr, r)) {
        this.die(hz.kind === 'barrier' ? 'The sweeper found you.' : 'Spikes. In this economy.')
        return
      }
    }

    // --- fake ceilings ------------------------------------------------------
    for (const s of this.solids) {
      if (s.kind !== 'fake') continue
      if (rectsOverlap(pr, inset({ x: s.curX, y: s.curY, w: s.w, h: s.h }, 2))) {
        this.die('That ceiling was a grinder.')
        return
      }
    }

    // --- decoy doors --------------------------------------------------------
    for (const d of this.decoys) {
      if (rectsOverlap(pr, inset(d, 2))) {
        this.die('That was never the way out.')
        return
      }
    }

    // --- exit ---------------------------------------------------------------
    if (rectsOverlap(pr, this.exit)) {
      if (p.gravityDir === this.exitNeeds) {
        this.hooks.sound('win')
        this.hooks.complete()
        return
      } else if (this.locked <= 0) {
        this.locked = 0.8
        this.hooks.sound('blip')
        this.hooks.shake(0.08)
      }
    }

    // --- fell out of the world ---------------------------------------------
    if (p.y > DEATH_FALL) {
      this.die('Down is a direction, not a promise.')
      return
    }
    if (p.y < DEATH_RISE) {
      this.die('Up is a direction, not a promise.')
      return
    }

    this.particles.update(dt)
  }

  private crackRect(s: RTSolid): Rect {
    return s.y < 240
      ? { x: s.curX, y: s.curY + s.h, w: s.w, h: 24 }
      : { x: s.curX, y: s.curY - 24, w: s.w, h: 24 }
  }

  focus(): Vec {
    return { x: this.player.centerX, y: this.player.centerY }
  }

  // ---------------------------------------------------------------------------
  // render
  // ---------------------------------------------------------------------------

  render(g: CanvasRenderingContext2D, w: number, h: number) {
    g.fillStyle = theme.bg
    g.fillRect(0, 0, w, h)

    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(0,102,255,0.14)')
    grad.addColorStop(1, 'rgba(189,189,189,0.06)')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
    drawGrid(g, w, h, 48, 'rgba(255,255,255,0.03)')

    // stars twinkle in the direction of gravity for a subtle pull
    for (const st of this.stars) {
      const a = st.a * (0.6 + 0.4 * Math.sin(this.time * 2 + st.tw))
      g.globalAlpha = a
      g.fillStyle = '#ffffff'
      g.beginPath()
      g.arc(st.x, st.y, st.r, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1

    this.drawZones(g)
    this.drawSolids(g)
    this.drawSwitches(g)
    this.drawHazards(g)
    this.drawDecoys(g)
    this.drawExit(g)
    this.drawPlayer(g)
    this.particles.render(g)
    this.drawHud(g, w)
  }

  private drawZones(g: CanvasRenderingContext2D) {
    for (const z of this.zones) {
      const r = z.def
      const pulse = 0.10 + 0.06 * Math.sin(this.time * 3)
      g.fillStyle = `rgba(0,102,255,${pulse.toFixed(3)})`
      g.fillRect(r.x, r.y, r.w, r.h)
      strokeRoundRect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 3, 'rgba(189,189,189,0.5)', 1)
      // animated arrows pointing in the forced direction
      const step = 34
      const off = (this.time * 40) % step
      g.fillStyle = 'rgba(255,255,255,0.55)'
      for (let y = r.y + 20 + off; y < r.y + r.h - 8; y += step) {
        arrow(g, r.x + r.w / 2, y, r.dir, 7)
      }
      label(g, r.dir === 1 ? 'V' : '^', r.x + r.w / 2, r.y - 4, { size: 11, color: 'rgba(255,255,255,0.8)', align: 'center' })
    }
  }

  private drawSolids(g: CanvasRenderingContext2D) {
    for (const s of this.solids) {
      const x = s.curX
      const y = s.curY
      if (s.kind === 'fake') {
        // looks like a ceiling; only the missing standable stripe and the seam betray it
        fillRoundRect(g, x, y, s.w, s.h, 3, '#181818')
        g.setLineDash([5, 5])
        strokeRoundRect(g, x + 1, y + 1, s.w - 2, s.h - 2, 3, 'rgba(189,189,189,0.5)', 1)
        g.setLineDash([])
        g.strokeStyle = 'rgba(255,0,0,0.4)'
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(x + 6, y + s.h - 1)
        g.lineTo(x + s.w - 6, y + s.h - 1)
        g.stroke()
        continue
      }
      const cracked = this.isCracked(s)
      fillRoundRect(g, x, y, s.w, s.h, 3, cracked ? 'rgba(255,0,0,0.18)' : theme.solid)
      // highlight stripe on the "standable" face
      const ceilingSide = s.y < 240
      g.fillStyle = theme.solidTop
      if (ceilingSide) g.fillRect(x, y + s.h - 3, s.w, 3)
      else g.fillRect(x, y, s.w, 3)
      if (s.spikeAfterFlips !== undefined) {
        g.strokeStyle = cracked ? 'rgba(255,0,0,0.7)' : 'rgba(255,255,255,0.18)'
        g.lineWidth = 1
        g.beginPath()
        for (let i = 0; i < 5; i++) {
          const cx = x + 8 + ((s.w - 16) / 4) * i
          g.moveTo(cx, y + (ceilingSide ? s.h - 2 : 2))
          g.lineTo(cx - 6, y + (ceilingSide ? s.h - 14 : 14))
        }
        g.stroke()
      }
      if (cracked) {
        this.drawSpikeField(g, this.crackRect(s), ceilingSide ? 'ceiling' : 'floor')
      }
      if (s.gravitySlide) this.drawPivotMark(g, s)
    }
  }

  private drawPivotMark(g: CanvasRenderingContext2D, s: RTSolid) {
    g.strokeStyle = 'rgba(189,189,189,0.6)'
    g.lineWidth = 2
    const cx = s.curX + s.w / 2
    const cy = s.curY + s.h / 2
    const dir = this.player.gravityDir
    g.beginPath()
    g.moveTo(cx, cy - 6 * dir)
    g.lineTo(cx - 6, cy + 4 * dir)
    g.lineTo(cx + 6, cy + 4 * dir)
    g.closePath()
    g.stroke()
  }

  private drawSwitches(g: CanvasRenderingContext2D) {
    for (const sw of this.switches) {
      const r = sw.def
      fillRoundRect(g, r.x, r.y, r.w, r.h, 4, sw.armed ? theme.accent : theme.panel)
      strokeRoundRect(g, r.x, r.y, r.w, r.h, 4, 'rgba(255,255,255,0.5)', 1)
      // flip glyph: two triangles pointing apart (up + down)
      const cx = r.x + r.w / 2
      const cy = r.y + r.h / 2
      g.fillStyle = sw.armed ? '#ffffff' : 'rgba(255,255,255,0.4)'
      g.beginPath()
      g.moveTo(cx - 6, cy)
      g.lineTo(cx, cy - (r.face === 'ceiling' ? -5 : 5))
      g.lineTo(cx + 6, cy)
      g.closePath()
      g.fill()
      g.beginPath()
      g.moveTo(cx - 6, cy)
      g.lineTo(cx, cy + (r.face === 'ceiling' ? -5 : 5))
      g.lineTo(cx + 6, cy)
      g.closePath()
      g.fill()
    }
  }

  private drawHazards(g: CanvasRenderingContext2D) {
    for (const hz of this.hazards) {
      const active = hz.activeAfterFlips === undefined || this.flips >= hz.activeAfterFlips
      if (!active) continue
      if (hz.kind === 'barrier') {
        const r = { x: hz.curX, y: hz.curY, w: hz.w, h: hz.h }
        fillRoundRect(g, r.x, r.y, r.w, r.h, 5, 'rgba(255,0,0,0.16)')
        strokeRoundRect(g, r.x, r.y, r.w, r.h, 5, theme.hazard, 2)
        // serrated teeth on both long edges so it reads as a bar, not a spike
        g.fillStyle = theme.hazard
        for (let y = r.y + 6; y < r.y + r.h - 6; y += 16) {
          g.beginPath()
          g.moveTo(r.x + 2, y + 8)
          g.lineTo(r.x - 4, y)
          g.lineTo(r.x + 2, y - 8)
          g.closePath()
          g.fill()
          g.beginPath()
          g.moveTo(r.x + r.w - 2, y + 8)
          g.lineTo(r.x + r.w + 4, y)
          g.lineTo(r.x + r.w - 2, y - 8)
          g.closePath()
          g.fill()
        }
        // orientation pip
        g.fillStyle = 'rgba(255,255,255,0.75)'
        const mid = r.y + r.h / 2
        arrow(g, r.x + r.w / 2, mid, this.player.gravityDir, 6)
      } else {
        this.drawSpikeField(g, { x: hz.curX, y: hz.curY, w: hz.w, h: hz.h }, hz.face ?? 'floor')
      }
    }
  }

  private drawSpikeField(g: CanvasRenderingContext2D, r: Rect, face: 'floor' | 'ceiling') {
    const count = Math.max(1, Math.round(r.w / 22))
    const step = r.w / count
    g.fillStyle = theme.hazard
    for (let i = 0; i < count; i++) {
      const sx = r.x + step * i
      g.beginPath()
      if (face === 'floor') {
        g.moveTo(sx, r.y + r.h)
        g.lineTo(sx + step / 2, r.y)
        g.lineTo(sx + step, r.y + r.h)
      } else {
        g.moveTo(sx, r.y)
        g.lineTo(sx + step / 2, r.y + r.h)
        g.lineTo(sx + step, r.y)
      }
      g.closePath()
      g.fill()
    }
    g.strokeStyle = 'rgba(0,0,0,0.35)'
    g.lineWidth = 1
    g.beginPath()
    if (face === 'floor') {
      g.moveTo(r.x, r.y + r.h - 0.5)
      g.lineTo(r.x + r.w, r.y + r.h - 0.5)
    } else {
      g.moveTo(r.x, r.y + 0.5)
      g.lineTo(r.x + r.w, r.y + 0.5)
    }
    g.stroke()
  }

  private drawDecoys(g: CanvasRenderingContext2D) {
    for (const d of this.decoys) {
      g.save()
      g.shadowColor = 'rgba(255,0,0,0.45)'
      g.shadowBlur = 18
      fillRoundRect(g, d.x, d.y, d.w, d.h, 4, 'rgba(255,0,0,0.12)')
      g.restore()
      strokeRoundRect(g, d.x, d.y, d.w, d.h, 4, theme.hazard, 2)
      g.fillStyle = 'rgba(255,0,0,0.2)'
      g.fillRect(d.x + 5, d.y + 5, d.w - 10, d.h - 10)
      // cracked seam tells the truth
      g.strokeStyle = 'rgba(255,0,0,0.75)'
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(d.x + d.w * 0.5, d.y + 3)
      g.lineTo(d.x + d.w * 0.42, d.y + d.h * 0.5)
      g.lineTo(d.x + d.w * 0.56, d.y + d.h - 3)
      g.stroke()
    }
  }

  private drawExit(g: CanvasRenderingContext2D) {
    const r = this.exit
    const ready = this.player.gravityDir === this.exitNeeds
    const glow = this.locked > 0 ? 'rgba(255,0,0,0.7)' : ready ? 'rgba(0,168,59,0.6)' : 'rgba(0,102,255,0.45)'
    g.save()
    g.shadowColor = glow
    g.shadowBlur = 22 + Math.sin(this.time * 4) * 4
    fillRoundRect(g, r.x, r.y, r.w, r.h, 4, 'rgba(0,168,59,0.12)')
    g.restore()
    strokeRoundRect(g, r.x, r.y, r.w, r.h, 4, ready ? theme.exit : 'rgba(189,189,189,0.8)', 2)
    g.fillStyle = 'rgba(0,168,59,0.14)'
    g.fillRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10)
    // required-orientation arrow (down = stand on the floor, up = arrive on the ceiling)
    g.fillStyle = ready ? theme.exit : 'rgba(189,189,189,0.9)'
    arrow(g, r.x + r.w / 2, r.y + r.h / 2, this.exitNeeds, 9)
    if (this.locked > 0) {
      label(g, this.exitNeeds === 1 ? 'FROM BELOW' : 'FROM ABOVE', r.x + r.w / 2, r.y - 8, {
        size: 10,
        color: theme.hazard,
        align: 'center',
      })
    }
  }

  private drawPlayer(g: CanvasRenderingContext2D) {
    const p = this.player
    const dir = p.gravityDir
    const stretch = clamp(p.vy * dir / 1600, -0.25, 0.25)
    g.save()
    g.translate(p.centerX, p.centerY)
    g.scale(1, dir === 1 ? 1 : -1)
    g.scale(1 - stretch * 0.4, 1 + stretch * 0.4)
    const hw = p.w / 2
    const hh = p.h / 2
    fillRoundRect(g, -hw, -hh, p.w, p.h, 7, theme.player)
    strokeRoundRect(g, -hw, -hh, p.w, p.h, 7, 'rgba(0,102,255,0.8)', 1.5)
    // feet glow toward gravity (local +y)
    g.fillStyle = theme.accent2
    g.fillRect(-hw + 3, hh - 5, p.w - 6, 3)
    // visor
    g.fillStyle = '#181818'
    const eye = p.facing
    g.fillRect(-8 + eye * 2, -hh + 8, 5, 6)
    g.fillRect(-1 + eye * 2, -hh + 8, 5, 6)
    g.restore()
  }

  private drawHud(g: CanvasRenderingContext2D, w: number) {
    label(g, `LEVEL ${this.index}`, 16, 28, { size: 13, color: 'rgba(255,255,255,0.5)' })
    label(g, this.level.name, 16, 50, { size: 17, color: 'rgba(255,255,255,0.9)' })

    // gravity indicator, always visible
    const dir = this.player.gravityDir
    const bw = 210
    const bx = w - bw - 16
    const by = 14
    fillRoundRect(g, bx, by, bw, 46, 10, 'rgba(24,24,24,0.85)')
    strokeRoundRect(g, bx, by, bw, 46, 10, dir === 1 ? theme.accent : theme.accent2, 2)
    arrow(g, bx + 30, by + 23, dir, 12, dir === 1 ? theme.accent : theme.accent2)
    label(g, 'GRAVITY', bx + 56, by + 20, { size: 11, color: 'rgba(255,255,255,0.55)' })
    label(g, dir === 1 ? 'DOWN' : 'UP', bx + 56, by + 38, {
      size: 18,
      color: dir === 1 ? theme.accent : theme.accent2,
    })
    label(g, `${this.flips} FLIPS`, bx + bw - 12, by + 30, { size: 11, color: 'rgba(255,255,255,0.4)', align: 'right' })
  }
}

// -----------------------------------------------------------------------------
// small geometry helpers
// -----------------------------------------------------------------------------

function inset(r: Rect, n: number): Rect {
  return { x: r.x + n, y: r.y + n, w: Math.max(0, r.w - n * 2), h: Math.max(0, r.h - n * 2) }
}

function approachTo(current: number, target: number, delta: number): number {
  if (current < target) return Math.min(current + delta, target)
  if (current > target) return Math.max(current - delta, target)
  return target
}

function arrow(g: CanvasRenderingContext2D, cx: number, cy: number, dir: Dir, size: number, color = '#ffffff') {
  g.fillStyle = color
  const s = size
  g.beginPath()
  if (dir === 1) {
    g.moveTo(cx, cy + s)
    g.lineTo(cx - s * 0.8, cy - s * 0.4)
    g.lineTo(cx + s * 0.8, cy - s * 0.4)
  } else {
    g.moveTo(cx, cy - s)
    g.lineTo(cx - s * 0.8, cy + s * 0.4)
    g.lineTo(cx + s * 0.8, cy + s * 0.4)
  }
  g.closePath()
  g.fill()
}

export const game: GameModule = {
  slug: 'gravity-flip',
  title: 'Gravity Flip',
  tagline: 'Down is optional. Up is a weapon.',
  theme,
  controls: [
    { keys: 'A / D or ←/→', label: 'Move' },
    { keys: 'W / ↑ / Space', label: 'Flip gravity' },
    { keys: 'R', label: 'Restart' },
    { keys: 'Esc', label: 'Pause' },
  ],
  instructions: [
    'Reach the door. It only opens to the right gravity.',
    'Flip gravity — do not jump. You walk on floors and ceilings.',
    'Watch the GRAVITY arrow so you always know which way is down.',
    'Hazards have shapes: spikes are triangles, sweepers are serrated bars.',
    'Some ceilings lie, some ground cracks, and some flips are traps.',
  ],
  levels: gravityFlipLevels.length,
  view: VIEW,
  create: (hooks) => new GravityFlipRuntime(hooks),
}

export default game
