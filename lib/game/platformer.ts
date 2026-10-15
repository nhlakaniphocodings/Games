import { clamp } from './math'
import type { InputState } from './types'

export interface Solid {
  x: number
  y: number
  w: number
  h: number
  /** Optional tag so games can identify special surfaces (hazard, bouncy, etc.). */
  tag?: string
  /** When false the solid is ignored for collision AND treated as passable. */
  active?: boolean
}

export interface CollisionResult {
  hitX: boolean
  hitY: boolean
  onGround: boolean
  onCeiling: boolean
  ground: Solid | null
}

/**
 * Move an AABB by (dx, dy) and resolve collisions against a list of solids,
 * axis by axis. Mutates `body`. Rects with `active === false` are skipped.
 */
export function moveAndCollide(
  body: { x: number; y: number; w: number; h: number; vx: number; vy: number },
  dx: number,
  dy: number,
  solids: Solid[],
): CollisionResult {
  const res: CollisionResult = { hitX: false, hitY: false, onGround: false, onCeiling: false, ground: null }

  body.x += dx
  for (const s of solids) {
    if (s.active === false) continue
    if (overlap(body, s)) {
      if (dx > 0) body.x = s.x - body.w
      else if (dx < 0) body.x = s.x + s.w
      if (dx !== 0) {
        body.vx = 0
        res.hitX = true
      }
    }
  }

  body.y += dy
  for (const s of solids) {
    if (s.active === false) continue
    if (overlap(body, s)) {
      if (dy > 0) {
        body.y = s.y - body.h
        res.onGround = true
        res.ground = s
      } else if (dy < 0) {
        body.y = s.y + s.h
        res.onCeiling = true
      }
      if (dy !== 0) {
        body.vy = 0
        res.hitY = true
      }
    }
  }

  return res
}

function overlap(a: { x: number; y: number; w: number; h: number }, b: Solid) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export interface PlayerConfig {
  gravity: number
  moveSpeed: number
  jumpVelocity: number
  maxFallSpeed: number
  groundAccel: number
  airAccel: number
  friction: number
  coyoteTime: number
  jumpBufferTime: number
  width: number
  height: number
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  gravity: 2100,
  moveSpeed: 300,
  jumpVelocity: -720,
  maxFallSpeed: 1100,
  groundAccel: 2600,
  airAccel: 1500,
  friction: 2400,
  coyoteTime: 0.09,
  jumpBufferTime: 0.12,
  width: 24,
  height: 32,
}

/**
 * Responsive platformer body with coyote time, jump buffering and optional
 * gravity direction (for Gravity Flip and the finale).
 */
export class PlatformerPlayer {
  x = 0
  y = 0
  w: number
  h: number
  vx = 0
  vy = 0
  onGround = false
  onCeiling = false
  facing: 1 | -1 = 1
  gravityDir: 1 | -1 = 1
  cfg: PlayerConfig

  private coyote = 0
  private jumpBuffer = 0
  private jumpHeld = false
  private wasJump = false
  /** Set false to disable jumping for a frame (e.g. control modes). */
  canJump = true

  constructor(cfg: Partial<PlayerConfig> = {}) {
    this.cfg = { ...DEFAULT_PLAYER_CONFIG, ...cfg }
    this.w = this.cfg.width
    this.h = this.cfg.height
  }

  get centerX() {
    return this.x + this.w / 2
  }
  get centerY() {
    return this.y + this.h / 2
  }

  reset(x: number, y: number) {
    this.x = x
    this.y = y
    this.vx = 0
    this.vy = 0
    this.onGround = false
    this.onCeiling = false
    this.coyote = 0
    this.jumpBuffer = 0
    this.jumpHeld = false
    this.wasJump = false
    this.gravityDir = 1
  }

  /**
   * Standard controller. Returns collision result.
   * `horizMul` / `jumpInvert` let Control Chaos remap inputs without touching physics.
   */
  step(
    dt: number,
    input: InputState,
    solids: Solid[],
    opts: { horizMul?: number; jumpInvert?: boolean; jumpEnabled?: boolean } = {},
  ): CollisionResult {
    const c = this.cfg
    const horizMul = opts.horizMul ?? 1
    const jumpEnabled = opts.jumpEnabled ?? true

    const rawDir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    const dir = rawDir * horizMul
    if (dir !== 0) this.facing = dir > 0 ? 1 : -1

    const accel = this.onGround ? c.groundAccel : c.airAccel
    if (dir !== 0) {
      this.vx += dir * accel * dt
      this.vx = clamp(this.vx, -c.moveSpeed, c.moveSpeed)
    } else {
      const fric = this.onGround ? c.friction : c.airAccel * 0.35
      if (this.vx > 0) this.vx = Math.max(0, this.vx - fric * dt)
      else if (this.vx < 0) this.vx = Math.min(0, this.vx + fric * dt)
    }

    // jump buffering + coyote
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt)
    if (input.jumpPressed && jumpEnabled) this.jumpBuffer = c.jumpBufferTime
    this.coyote = this.onGround ? c.coyoteTime : Math.max(0, this.coyote - dt)

    const jumpDown = jumpEnabled && input.jump
    const jumpJustPressed = jumpEnabled && input.jumpPressed
    const upDir = opts.jumpInvert ? -1 : 1
    // grounded "surface" depends on flipped gravity
    const grounded = this.gravityDir === 1 ? this.onGround : this.onCeiling

    if (this.jumpBuffer > 0 && (grounded || this.coyote > 0)) {
      const vel = c.jumpVelocity * upDir * this.gravityDir
      this.vy = vel
      this.jumpBuffer = 0
      this.coyote = 0
      this.onGround = false
      this.onCeiling = false
    }

    // variable jump height
    if (this.wasJump && !jumpDown) {
      if (this.gravityDir === 1 && this.vy < 0) this.vy *= 0.5
      if (this.gravityDir === -1 && this.vy > 0) this.vy *= 0.5
    }
    this.wasJump = jumpDown
    void jumpJustPressed
    this.jumpHeld = jumpDown

    this.vy += c.gravity * this.gravityDir * dt
    const maxFall = c.maxFallSpeed
    this.vy = clamp(this.vy, -maxFall, maxFall)

    const res = moveAndCollide(this, this.vx * dt, this.vy * dt, solids)
    this.onGround = res.onGround
    this.onCeiling = res.onCeiling
    return res
  }

  /** Flip gravity (Gravity Flip game). */
  flip() {
    this.gravityDir = this.gravityDir === 1 ? -1 : 1
    this.onGround = false
    this.onCeiling = false
    this.coyote = 0
  }

  get jumping() {
    return this.jumpHeld
  }
}
