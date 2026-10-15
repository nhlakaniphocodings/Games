import { clamp, rectsOverlap } from '@/lib/game/math'
import { ParticleSystem } from '@/lib/game/particles'
import { PlatformerPlayer, type Solid } from '@/lib/game/platformer'
import { drawGrid, fillRoundRect, label, strokeRoundRect } from '@/lib/game/draw'
import type { GameHooks, GameModule, GameRuntime, GameTheme, InputState, Rect, Vec } from '@/lib/game/types'
import { ccLevels } from './levels'
import type { CCLevel, CCZone, ControlMode, JumpMode } from './types'

/*
 * CONTROL CHAOS — a reflex platformer where the control mapping changes.
 * The mapping is remapped by hand BEFORE PlatformerPlayer.step(): a reversed
 * zone swaps left/right in a cloned InputState, crouch turns jump into a
 * duck/slide, and a lock field zeroes the input while momentum carries you.
 * Every change is deterministic and telegraphed by a >=0.8s warning band.
 */

const VIEW = { w: 960, h: 540 }
const WARN_TIME = 0.85
const PLAYER_H = 32
const DUCK_H = 18
const WALK_SPEED = 300
const DUCK_SPEED = 170
const SLIDE_SPEED = 520
const SLIDE_TIME = 0.7

const theme: GameTheme = {
  background: '#05060a',
  bg: '#0a0812',
  panel: '#141024',
  solid: '#241a3a',
  solidTop: '#4b3a7a',
  hazard: '#ff3d81',
  accent: '#22e0ff',
  accent2: '#ff2fd0',
  player: '#f2f7ff',
  exit: '#59ffa8',
  text: '#ffffff',
}

interface ZoneState {
  warnTimer: number
  armed: boolean
  triggered: boolean
  inside: boolean
  near: boolean
}

interface Banner {
  text: string
  color: string
  progress: number
}

class ControlChaosRuntime implements GameRuntime {
  private hooks: GameHooks
  private player = new PlatformerPlayer()
  private particles = new ParticleSystem()
  private index = 1
  private level: CCLevel = ccLevels[0]
  private time = 0
  private sticky: Required<ControlMode> = { rev: false, jump: 'jump' }
  private effective: Required<ControlMode> = { rev: false, jump: 'jump' }
  private zoneStates: ZoneState[] = []
  private banner: Banner | null = null

  private lockTimer = 0
  private lockTotal = 1
  private lockDir: -1 | 0 | 1 = 0

  private sliding = false
  private slideTimer = 0
  private slideDir: 1 | -1 = 1
  private ducking = false

  private flash = 0
  private flashText = ''
  private prevKey = '--jump'

  constructor(hooks: GameHooks) {
    this.hooks = hooks
  }

  // ------------------------------------------------------------------ load

  load(level: number) {
    this.index = clamp(level, 1, ccLevels.length)
    this.level = ccLevels[this.index - 1]
    this.time = 0
    this.sticky = { rev: false, jump: 'jump', ...this.level.base }
    this.effective = { ...this.sticky }
    this.zoneStates = this.level.zones.map(() => ({ warnTimer: 0, armed: false, triggered: false, inside: false, near: false }))
    this.banner = null
    this.lockTimer = 0
    this.lockTotal = 1
    this.lockDir = 0
    this.sliding = false
    this.slideTimer = 0
    this.ducking = false
    this.flash = 0
    this.flashText = ''
    this.prevKey = `--${this.effective.jump}`
    this.particles.clear()
    this.player = new PlatformerPlayer()
    this.player.reset(this.level.start.x, this.level.start.y)
  }

  // ---------------------------------------------------------------- update

  update(dt: number, input: InputState) {
    this.time += dt
    const p = this.player
    const solids: Solid[] = this.level.solids.map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h, active: true }))
    const pr = this.playerRect()
    const wasGround = p.onGround

    let transRev: boolean | undefined
    let transJump: JumpMode | undefined
    let banner: Banner | null = null

    for (let i = 0; i < this.level.zones.length; i++) {
      const z = this.level.zones[i]
      const st = this.zoneStates[i]
      const wr = this.warnRect(z)
      const near = wr.w > 0 && rectsOverlap(pr, wr)
      const inside = rectsOverlap(pr, z)
      st.near = near
      st.inside = inside
      if (near || inside) {
        st.warnTimer += dt
        if (!st.armed && st.warnTimer >= WARN_TIME) {
          st.armed = true
          this.hooks.sound('blip')
        }
      } else if (st.warnTimer > 0 || st.armed || st.triggered) {
        st.warnTimer = 0
        st.armed = false
        st.triggered = false
      }

      if (z.kind === 'zone' && inside && st.armed && z.mode) {
        if (z.mode.rev !== undefined) transRev = z.mode.rev
        if (z.mode.jump !== undefined) transJump = z.mode.jump
      }
      if (z.kind === 'switch' && inside && !st.triggered && z.mode) {
        st.triggered = true
        this.sticky = { ...this.sticky, ...z.mode }
        this.hooks.sound('unlock')
        this.hooks.shake(0.22)
        this.particles.emit(pr.x + pr.w / 2, pr.y + pr.h, 10, { colors: [theme.accent, theme.accent2], speed: 170, life: 0.4, gravity: 300 })
      }
      if (z.kind === 'lock' && inside && !st.triggered) {
        st.triggered = true
        this.startLock(z.lockTime ?? 0.8)
      }

      if (!banner) {
        const approachingZone = z.kind === 'zone' && !inside && near
        const pendingSwitch = (z.kind === 'switch' || z.kind === 'lock') && !st.triggered && (near || inside)
        const unarmedZone = z.kind === 'zone' && inside && !st.armed
        if (approachingZone || pendingSwitch || unarmedZone) {
          banner = { text: z.label ?? 'CONTROL CHANGE', color: this.zoneColor(z), progress: clamp(st.warnTimer / WARN_TIME, 0, 1) }
        }
      }
    }

    const eff: Required<ControlMode> = { rev: this.sticky.rev ?? false, jump: this.sticky.jump ?? 'jump' }
    if (transRev !== undefined) eff.rev = transRev
    if (transJump !== undefined) eff.jump = transJump
    this.effective = eff
    this.banner = banner

    // ---- input remap (gameplay only; shell keys pause/restart untouched) ----
    const tin = this.cloneInput(input)
    const locked = this.lockTimer > 0
    const jumpMode: JumpMode = locked ? 'none' : eff.jump

    if (eff.rev) {
      const l = tin.left
      tin.left = tin.right
      tin.right = l
    }

    let wantDuck = false
    if (!locked && jumpMode === 'crouch') {
      if (tin.jumpPressed) this.startSlide()
      wantDuck = tin.jump || tin.down || this.sliding
    } else {
      this.sliding = false
    }

    if (!locked && this.sliding) {
      const d = this.slideDir
      tin.left = d < 0
      tin.right = d > 0
      p.vx = d * SLIDE_SPEED
    }

    if (locked) {
      tin.left = false
      tin.right = false
      tin.up = false
      tin.down = false
      tin.jumpPressed = false
      tin.action = false
      tin.actionPressed = false
      // Keep `tin.jump` as held. Freezing it would trip the platformer's
      // variable-jump cut and truncate a jump started BEFORE the lock — the
      // exact move this hazard is meant to reward.
      if (this.lockDir !== 0) {
        if (this.lockDir > 0) tin.right = true
        else tin.left = true
      }
      wantDuck = false
      this.sliding = false
    }

    const key = `${locked ? 'L' : ''}${eff.rev ? 'R' : '-'}${jumpMode}`
    if (key !== this.prevKey) {
      this.prevKey = key
      this.flash = 0.85
      this.flashText = locked ? 'CONTROLS LOCKED' : this.mappingLabel(eff)
      if (!locked) this.hooks.sound('flip')
    }

    // ---- stance + movement ----
    this.ducking = wantDuck
    this.applyStance(wantDuck, solids)
    p.cfg.moveSpeed = this.sliding ? SLIDE_SPEED : wantDuck ? DUCK_SPEED : WALK_SPEED

    // `eff.jump` (not the locked HUD mode) so an in-flight jump survives a lock;
    // new jumps are already blocked by zeroing `jumpPressed` above.
    const jumpEnabled = eff.jump === 'jump'
    const res = p.step(dt, tin, solids, { jumpEnabled })
    if (res.hitX && this.sliding) this.sliding = false

    if (jumpEnabled && tin.jumpPressed && wasGround && this.time > 0.05) this.hooks.sound('jump')
    if (!wasGround && p.onGround && this.time > 0.05) {
      this.hooks.sound('land')
      if (!this.hooks.reducedMotion) this.particles.emit(p.centerX, p.y + p.h, 4, { colors: [theme.solidTop], speed: 90, life: 0.25, gravity: 700 })
    }

    // ---- world collisions ----
    const pr2 = this.playerRect()
    for (const hz of this.level.hazards) {
      if (rectsOverlap(pr2, hz)) {
        this.hooks.death('Skewered by the spikes.')
        return
      }
    }
    if (rectsOverlap(pr2, this.level.exit)) {
      this.hooks.sound('win')
      this.hooks.complete()
      return
    }
    if (p.y > 620) {
      this.hooks.death('Dropped out of the frame.')
      return
    }

    if (this.lockTimer > 0) this.lockTimer = Math.max(0, this.lockTimer - dt)
    if (this.sliding) {
      this.slideTimer -= dt
      if (this.slideTimer <= 0) this.sliding = false
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt)

    this.particles.update(dt)
  }

  // --------------------------------------------------------------- helpers

  private cloneInput(i: InputState): InputState {
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

  private startSlide() {
    const p = this.player
    this.sliding = true
    this.slideTimer = SLIDE_TIME
    this.slideDir = p.facing
    p.vx = this.slideDir * SLIDE_SPEED
    this.hooks.sound('flip')
    this.particles.emit(p.centerX, p.y + p.h, 8, {
      colors: [theme.accent, theme.solidTop],
      speed: 150,
      spread: Math.PI,
      dir: this.slideDir > 0 ? Math.PI : 0,
      life: 0.35,
      gravity: 200,
    })
  }

  private startLock(dur: number) {
    this.lockTimer = dur
    this.lockTotal = Math.max(dur, 0.0001)
    const vx = this.player.vx
    this.lockDir = Math.abs(vx) > 20 ? (vx > 0 ? 1 : -1) : 0
    if (this.lockDir !== 0) this.player.vx = this.lockDir * WALK_SPEED
    this.sliding = false
    this.hooks.sound('hit')
    this.hooks.shake(0.35)
    this.particles.emit(this.player.centerX, this.player.centerY, 12, { colors: [theme.accent2, theme.hazard], speed: 220, life: 0.45, gravity: 200 })
  }

  private applyStance(low: boolean, solids: Solid[]) {
    const p = this.player
    const feet = p.y + p.h
    if (low) {
      if (p.h !== DUCK_H) {
        p.h = DUCK_H
        p.y = feet - DUCK_H
      }
    } else if (p.h !== PLAYER_H) {
      const ny = feet - PLAYER_H
      if (!this.overlapsAny({ x: p.x, y: ny, w: p.w, h: PLAYER_H }, solids)) {
        p.h = PLAYER_H
        p.y = ny
      }
    }
  }

  private overlapsAny(b: Rect, solids: Solid[]) {
    for (const s of solids) {
      if (s.active !== false && rectsOverlap(b, s)) return true
    }
    return false
  }

  private playerRect(): Rect {
    const p = this.player
    return { x: p.x, y: p.y, w: p.w, h: p.h }
  }

  private warnRect(z: CCZone): Rect {
    const pad = z.warnPad ?? 0
    const a = z.approach ?? 'left'
    const y = z.bandFull === false ? z.y : 0
    const h = z.bandFull === false ? z.h : VIEW.h
    if (a === 'right') return { x: z.x + z.w, y, w: pad, h }
    if (a === 'both') return { x: z.x - pad, y, w: z.w + pad * 2, h }
    return { x: z.x - pad, y, w: pad, h }
  }

  private zoneColor(z: CCZone): string {
    if (z.kind === 'lock') return theme.hazard
    if (z.kind === 'switch') return '#ffd23f'
    if (z.mode?.rev && z.mode?.jump === 'crouch') return '#b98cff'
    if (z.mode?.jump === 'crouch') return theme.accent2
    return theme.accent
  }

  private mappingLabel(m: ControlMode): string {
    const parts: string[] = []
    if (m.rev) parts.push('MIRRORED')
    if (m.jump === 'crouch') parts.push('JUMP → DUCK/SLIDE')
    else if (m.jump === 'none') parts.push('JUMP DISABLED')
    if (!parts.length) parts.push('NORMAL')
    return parts.join('  ·  ')
  }

  focus(): Vec {
    return { x: this.player.centerX, y: this.player.centerY }
  }

  destroy() {
    this.particles.clear()
  }

  // ---------------------------------------------------------------- render

  render(g: CanvasRenderingContext2D, w: number, h: number) {
    g.fillStyle = theme.bg
    g.fillRect(0, 0, w, h)
    drawGrid(g, w, h, 40, 'rgba(255,255,255,0.035)', 0, (this.time * 12) % 40)

    const glow = g.createRadialGradient(w * 0.5, h * 0.12, 20, w * 0.5, h * 0.12, w * 0.72)
    glow.addColorStop(0, 'rgba(34,224,255,0.10)')
    glow.addColorStop(0.5, 'rgba(255,47,208,0.07)')
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = glow
    g.fillRect(0, 0, w, h)

    // glitch bars
    if (!this.hooks.reducedMotion) {
      for (let i = 0; i < 3; i++) {
        const gy = (Math.sin(this.time * 1.7 + i * 2.3) * 0.5 + 0.5) * h
        g.globalAlpha = 0.05
        g.fillStyle = i % 2 ? theme.accent : theme.accent2
        g.fillRect(Math.sin(this.time * 7 + i) * 14, gy, w, 2 + (i % 2) * 3)
      }
      g.globalAlpha = 1
    }

    this.drawZones(g)

    for (const s of this.level.solids) {
      fillRoundRect(g, s.x, s.y, s.w, s.h, 3, theme.solid)
      g.fillStyle = theme.solidTop
      g.fillRect(s.x, s.y, s.w, 3)
    }

    for (const hz of this.level.hazards) {
      const count = Math.max(1, Math.floor(hz.w / 20))
      g.fillStyle = theme.hazard
      for (let i = 0; i < count; i++) {
        const sx = hz.x + (hz.w / count) * i
        const sw = hz.w / count
        g.beginPath()
        g.moveTo(sx, hz.y + hz.h)
        g.lineTo(sx + sw / 2, hz.y)
        g.lineTo(sx + sw, hz.y + hz.h)
        g.closePath()
        g.fill()
      }
    }

    this.drawDoor(g, this.level.exit)
    this.drawPlayer(g)
    this.particles.render(g)

    label(g, `LEVEL ${this.index} — ${this.level.name}`, 16, 28, { size: 13, color: 'rgba(255,255,255,0.55)', weight: '800' })
    label(g, this.level.hint, 16, 50, { size: 14, color: 'rgba(255,255,255,0.85)' })

    this.drawHud(g, w, h)
    this.drawBanner(g, w)
    this.drawFlash(g, w, h)
  }

  private drawZones(g: CanvasRenderingContext2D) {
    for (let i = 0; i < this.level.zones.length; i++) {
      const z = this.level.zones[i]
      const st = this.zoneStates[i]
      if (!st) continue
      const color = this.zoneColor(z)
      const wr = this.warnRect(z)

      if (wr.w > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 8)
        g.save()
        g.globalAlpha = st.armed ? 0.1 : 0.05 + 0.06 * pulse
        g.fillStyle = color
        g.fillRect(wr.x, wr.y, wr.w, wr.h)
        g.globalAlpha = 0.22
        g.strokeStyle = color
        g.lineWidth = 2
        g.beginPath()
        for (let x = wr.x - wr.h; x < wr.x + wr.w; x += 18) {
          g.moveTo(x, wr.y + wr.h)
          g.lineTo(x + wr.h, wr.y)
        }
        g.stroke()
        g.restore()
      }

      g.save()
      g.globalAlpha = st.inside ? 0.16 : 0.08
      g.fillStyle = color
      g.fillRect(z.x, z.y, z.w, z.h)
      g.restore()
      g.save()
      g.setLineDash([9, 6])
      g.strokeStyle = color
      g.lineWidth = 2
      g.strokeRect(z.x + 1, z.y + 1, z.w - 2, z.h - 2)
      g.setLineDash([])
      g.restore()

      const icon = z.kind === 'lock' ? '⊘' : z.kind === 'switch' ? '⏻' : z.mode?.rev && z.mode?.jump === 'crouch' ? '⇄' : z.mode?.rev ? '⇄' : '⤓'
      label(g, `${icon} ${z.label ?? ''}`, z.x + 8, z.y + 22, { size: 13, color, weight: '800', glow: color })
      if (z.kind === 'switch') {
        // control plate pad sitting on the floor
        fillRoundRect(g, z.x + 6, z.y + z.h - 12, z.w - 12, 10, 3, 'rgba(255,210,63,0.22)')
        strokeRoundRect(g, z.x + 6, z.y + z.h - 12, z.w - 12, 10, 3, '#ffd23f', 1)
        if (st.triggered) {
          g.fillStyle = '#ffd23f'
          g.beginPath()
          g.moveTo(z.x + z.w / 2, z.y + z.h - 10)
          g.lineTo(z.x + z.w / 2 + 6, z.y + z.h - 5)
          g.lineTo(z.x + z.w / 2, z.y + z.h - 1)
          g.closePath()
          g.fill()
        }
      }
      if (!st.armed && (st.near || st.inside)) {
        const prog = clamp(st.warnTimer / WARN_TIME, 0, 1)
        fillRoundRect(g, z.x + 8, z.y + 28, 96, 5, 2, 'rgba(255,255,255,0.2)')
        fillRoundRect(g, z.x + 8, z.y + 28, 96 * prog, 5, 2, color)
      }
    }
  }

  private drawDoor(g: CanvasRenderingContext2D, r: Rect) {
    g.save()
    g.shadowColor = 'rgba(89,255,168,0.5)'
    g.shadowBlur = 22
    fillRoundRect(g, r.x, r.y, r.w, r.h, 4, '#123a2c')
    g.restore()
    strokeRoundRect(g, r.x, r.y, r.w, r.h, 4, theme.exit, 2)
    g.fillStyle = 'rgba(89,255,168,0.16)'
    g.fillRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10)
    g.fillStyle = theme.exit
    g.beginPath()
    g.moveTo(r.x + r.w * 0.36, r.y + r.h * 0.34)
    g.lineTo(r.x + r.w * 0.64, r.y + r.h * 0.5)
    g.lineTo(r.x + r.w * 0.36, r.y + r.h * 0.66)
    g.closePath()
    g.fill()
  }

  private drawPlayer(g: CanvasRenderingContext2D) {
    const p = this.player
    const stretch = clamp(p.vy / 1400, -0.3, 0.3)
    const sx = 1 - stretch
    const sy = 1 + stretch
    const low = this.ducking || this.sliding
    g.save()
    g.translate(p.centerX, p.y + p.h)
    if (this.sliding) g.rotate(p.facing * 0.18)
    g.scale(sx, sy)
    fillRoundRect(g, -p.w / 2, -p.h, p.w, p.h, low ? 7 : 6, theme.player)
    g.fillStyle = '#241a33'
    const eyeDir = p.facing
    g.fillRect(-4 + eyeDir * 2, -p.h + (low ? 5 : 10), 3, 5)
    g.fillRect(2 + eyeDir * 2, -p.h + (low ? 5 : 10), 3, 5)
    g.restore()

    if (this.sliding) {
      g.strokeStyle = 'rgba(255,255,255,0.4)'
      g.lineWidth = 2
      g.beginPath()
      for (let i = 1; i <= 3; i++) {
        const y = p.y + 8 + i * 6
        g.moveTo(p.centerX - p.facing * (18 + i * 9), y)
        g.lineTo(p.centerX - p.facing * (34 + i * 9), y)
      }
      g.stroke()
    }
  }

  private drawHud(g: CanvasRenderingContext2D, w: number, h: number) {
    void h
    const locked = this.lockTimer > 0
    const eff = this.effective
    const pw = 268
    const ph = 100
    const x = w - pw - 14
    const y = 14
    fillRoundRect(g, x, y, pw, ph, 8, 'rgba(8,7,16,0.74)')
    strokeRoundRect(g, x, y, pw, ph, 8, locked ? theme.hazard : 'rgba(255,255,255,0.18)', 2)
    label(g, 'CONTROL MAPPING', x + 12, y + 20, { size: 11, color: 'rgba(255,255,255,0.55)', weight: '800' })

    const rev = eff.rev
    const leftKeys = rev ? 'D  •  →' : 'A  •  ←'
    const rightKeys = rev ? 'A  •  ←' : 'D  •  →'
    const jumpText = locked ? 'FROZEN' : eff.jump === 'jump' ? 'JUMP' : eff.jump === 'crouch' ? 'DUCK · SLIDE' : 'DISABLED'
    const cMove = rev ? theme.accent2 : theme.text
    const cJump = locked ? theme.hazard : eff.jump === 'crouch' ? theme.accent2 : eff.jump === 'none' ? theme.hazard : theme.accent

    label(g, '◀ LEFT', x + 12, y + 46, { size: 12, color: 'rgba(255,255,255,0.6)' })
    label(g, leftKeys, x + 100, y + 46, { size: 14, color: cMove, weight: '800' })
    label(g, '▶ RIGHT', x + 12, y + 68, { size: 12, color: 'rgba(255,255,255,0.6)' })
    label(g, rightKeys, x + 100, y + 68, { size: 14, color: cMove, weight: '800' })
    label(g, 'JUMP', x + 12, y + 90, { size: 12, color: 'rgba(255,255,255,0.6)' })
    label(g, jumpText, x + 100, y + 90, { size: 14, color: cJump, weight: '800' })
    if (rev) label(g, 'MIRROR', x + pw - 12, y + 20, { size: 11, color: theme.accent2, align: 'right', weight: '800' })

    if (locked) {
      const prog = 1 - this.lockTimer / this.lockTotal
      fillRoundRect(g, x, y + ph + 8, pw, 10, 5, 'rgba(255,255,255,0.12)')
      fillRoundRect(g, x, y + ph + 8, pw * clamp(prog, 0, 1), 10, 5, theme.hazard)
      label(g, `LOCKED ${this.lockTimer.toFixed(1)}s`, x + pw / 2, y + ph + 32, { size: 11, color: theme.hazard, align: 'center', weight: '800' })
    }
  }

  private drawBanner(g: CanvasRenderingContext2D, w: number) {
    const b = this.banner
    if (!b) return
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 10)
    g.save()
    g.globalAlpha = pulse
    fillRoundRect(g, w / 2 - 196, 74, 392, 48, 10, 'rgba(10,8,20,0.85)')
    strokeRoundRect(g, w / 2 - 196, 74, 392, 48, 10, b.color, 2)
    label(g, `⚠  ${b.text}  INCOMING`, w / 2, 105, { size: 17, color: b.color, align: 'center', weight: '800', glow: b.color })
    g.restore()
    fillRoundRect(g, w / 2 - 160, 128, 320, 6, 3, 'rgba(255,255,255,0.15)')
    fillRoundRect(g, w / 2 - 160, 128, 320 * clamp(b.progress, 0, 1), 6, 3, b.color)
  }

  private drawFlash(g: CanvasRenderingContext2D, w: number, h: number) {
    if (this.flash <= 0) return
    const a = this.flash / 0.85
    g.save()
    g.globalAlpha = 0.16 * a
    g.fillStyle = theme.accent2
    g.fillRect(0, 0, w, h)
    g.restore()
    label(g, this.flashText, w / 2, h / 2 - 36, { size: 30, color: '#ffffff', align: 'center', weight: '900', glow: theme.accent2 })
  }
}

export const game: GameModule = {
  slug: 'control-chaos',
  title: 'Control Chaos',
  tagline: 'The rules keep changing. The signals never lie.',
  theme,
  controls: [
    { keys: 'A / D or ←/→', label: 'Move (sometimes mirrored)' },
    { keys: 'W / ↑ / Space', label: 'Jump — or Duck / Slide' },
    { keys: 'S / ↓', label: 'Duck (in crouch mode)' },
    { keys: 'R', label: 'Restart' },
    { keys: 'Esc', label: 'Pause' },
  ],
  instructions: [
    'Reach the glowing door. The control mapping can change — the HUD always shows the live mapping.',
    'A warning band and a countdown flash before most changes. Read them, then commit.',
    'MIRRORED swaps ◀ and ▶. INVERTED also turns Jump into Duck/Slide.',
    'Hold Jump to duck low; tap it to slide fast (no jump in crouch mode).',
    'A control lock freezes your buttons — momentum keeps carrying you, so plan ahead.',
  ],
  levels: ccLevels.length,
  view: VIEW,
  create: (hooks) => new ControlChaosRuntime(hooks),
}

export default game
