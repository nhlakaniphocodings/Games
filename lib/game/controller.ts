'use client'

import { audio } from './audio'
import { awardCosmetics, type Cosmetic } from './cosmetics'
import { clamp } from './math'
import { narrate, levelIntro, finalWords } from './narrator'
import { ParticleSystem } from './particles'
import { progress, type Settings } from './storage'
import {
  emptyInput,
  type GameHooks,
  type GameModule,
  type GameRuntime,
  type GameStatus,
  type InputState,
  type SoundName,
} from './types'

const DYING_TIME = 0.4
const SHAKE_DECAY = 3.4

export interface UiState {
  status: GameStatus
  level: number
  levelCount: number
  /** deaths during the current level attempt session */
  deaths: number
  /** cumulative deaths for this level across all sessions */
  levelDeaths: number
  totalDeaths: number
  elapsedMs: number
  bestMs: number | null
  narrator: { text: string; id: number }
  flashId: number
  toast: Cosmetic | null
  reducedMotion: boolean
}

export interface ControllerOptions {
  canvas: HTMLCanvasElement
  module: GameModule
  onUi: (ui: UiState) => void
}

type TouchControl = 'left' | 'right' | 'jump' | 'action' | 'up' | 'down'

export class GameController {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null
  private module: GameModule
  private runtime: GameRuntime
  private onUi: (ui: UiState) => void
  private hooks: GameHooks

  private status: GameStatus = 'intro'
  private level = 1
  private levelDeaths = 0
  private elapsedMs = 0
  private deathTimer = 0

  private particles = new ParticleSystem()
  private shakeAmt = 0
  private flashId = 0
  private narratorText = ''
  private narratorId = 0
  private toast: Cosmetic | null = null
  private toastId = 0

  private pendingDeath = false
  private pendingDeathMsg: string | undefined
  private pendingComplete = false

  private raf = 0
  private last = 0
  private uiTimer = 0
  private destroyed = false
  private started = false

  private input: InputState = emptyInput()
  private raw = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    action: false,
    pointerDown: false,
    pointerX: 0,
    pointerY: 0,
  }
  private prev = { jump: false, action: false, pointer: false }

  private settings: Settings
  private dpr = 1

  constructor(opts: ControllerOptions) {
    this.canvas = opts.canvas
    this.module = opts.module
    this.onUi = opts.onUi
    this.ctx = opts.canvas.getContext('2d', { alpha: false })
    this.settings = progress.getSnapshot().settings
    this.dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    this.resizeCanvas()

    this.hooks = {
      death: (message) => {
        if (this.pendingDeath || this.status !== 'playing') return
        this.pendingDeath = true
        this.pendingDeathMsg = message
      },
      complete: () => {
        if (this.pendingComplete || this.status !== 'playing') return
        this.pendingComplete = true
      },
      sound: (name: SoundName) => audio.play(name),
      shake: (amount: number) => {
        if (!this.settings.reducedMotion) this.shakeAmt = Math.min(1.4, this.shakeAmt + amount)
      },
      reducedMotion: this.settings.reducedMotion,
    }
    this.runtime = this.module.create(this.hooks)
  }

  // -------------------------------------------------------------------------
  // lifecycle
  // -------------------------------------------------------------------------

  private resizeCanvas() {
    const { w, h } = this.module.view
    this.canvas.width = Math.round(w * this.dpr)
    this.canvas.height = Math.round(h * this.dpr)
    this.canvas.style.aspectRatio = `${w} / ${h}`
  }

  begin(level?: number) {
    const target = level ?? progress.getUnlocked(this.module.slug)
    this.loadLevel(clamp(Math.floor(target), 1, this.module.levels))
    this.started = true
    this.narrate('start')
  }

  private loadLevel(level: number) {
    this.level = clamp(Math.floor(level), 1, this.module.levels)
    this.levelDeaths = 0
    this.elapsedMs = 0
    this.deathTimer = 0
    this.pendingDeath = false
    this.pendingComplete = false
    this.particles.clear()
    this.shakeAmt = 0
    this.runtime.load(this.level)
    this.status = 'playing'
    this.emitUi(true)
    const intro = levelIntro(this.level)
    if (intro) this.narrateText(intro)
  }

  restart() {
    if (this.status === 'playing' || this.status === 'dying' || this.status === 'paused') {
      this.loadLevel(this.level)
    }
  }

  nextLevel() {
    if (this.level < this.module.levels) this.loadLevel(this.level + 1)
  }

  selectLevel(level: number) {
    this.loadLevel(level)
  }

  pause() {
    if (this.status === 'playing') {
      this.status = 'paused'
      audio.setMusic(false)
      this.emitUi(true)
    }
  }

  resume() {
    if (this.status === 'paused') {
      this.status = 'playing'
      this.last = performance.now()
      this.emitUi(true)
    }
  }

  togglePause() {
    if (this.status === 'playing') this.pause()
    else if (this.status === 'paused') this.resume()
  }

  setSettings(settings: Settings) {
    this.settings = settings
    this.hooks.reducedMotion = settings.reducedMotion
    audio.configure(settings.muted, settings.volume)
  }

  // -------------------------------------------------------------------------
  // input
  // -------------------------------------------------------------------------

  setTouch(control: TouchControl, down: boolean) {
    if (control === 'jump') this.raw.jump = down
    else if (control === 'action') this.raw.action = down
    else this.raw[control] = down
  }

  handleKey(code: string, down: boolean): boolean {
    switch (code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.raw.left = down
        return true
      case 'ArrowRight':
      case 'KeyD':
        this.raw.right = down
        return true
      case 'ArrowUp':
      case 'KeyW':
        this.raw.up = down
        this.raw.jump = down
        return true
      case 'ArrowDown':
      case 'KeyS':
        this.raw.down = down
        return true
      case 'Space':
        this.raw.jump = down
        this.raw.action = down
        return true
      case 'KeyE':
      case 'Enter':
      case 'KeyJ':
        this.raw.action = down
        return true
      default:
        return false
    }
  }

  pointerToWorld(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect()
    const { w, h } = this.module.view
    const x = ((clientX - rect.left) / rect.width) * w
    const y = ((clientY - rect.top) / rect.height) * h
    return { x, y }
  }

  setPointer(clientX: number, clientY: number, down: boolean) {
    const p = this.pointerToWorld(clientX, clientY)
    this.raw.pointerX = p.x
    this.raw.pointerY = p.y
    this.raw.pointerDown = down
  }

  private buildInput() {
    const i = this.input
    i.left = this.raw.left
    i.right = this.raw.right
    i.up = this.raw.up
    i.down = this.raw.down
    i.jump = this.raw.jump
    i.action = this.raw.action
    i.jumpPressed = this.raw.jump && !this.prev.jump
    i.actionPressed = this.raw.action && !this.prev.action
    i.pointer.x = this.raw.pointerX
    i.pointer.y = this.raw.pointerY
    i.pointer.down = this.raw.pointerDown
    i.pointer.pressed = this.raw.pointerDown && !this.prev.pointer
    this.prev.jump = this.raw.jump
    this.prev.action = this.raw.action
    this.prev.pointer = this.raw.pointerDown
  }

  // -------------------------------------------------------------------------
  // loop
  // -------------------------------------------------------------------------

  run() {
    if (this.raf) return
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  private loop = (t: number) => {
    if (this.destroyed) return
    this.raf = requestAnimationFrame(this.loop)
    const dt = clamp((t - this.last) / 1000, 0, 1 / 30)
    this.last = t

    if (this.status === 'playing') {
      this.buildInput()
      this.elapsedMs += dt * 1000
      try {
        this.runtime.update(dt, this.input)
      } catch (err) {
        console.error('[xgames] update error', err)
        this.status = 'paused'
      }
      if (this.pendingDeath) this.beginDeath()
      else if (this.pendingComplete) this.beginComplete()
    } else if (this.status === 'dying') {
      this.deathTimer += dt
      if (this.deathTimer >= DYING_TIME) this.loadLevel(this.level)
    }

    if (this.status !== 'paused') {
      this.particles.update(dt)
      if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - SHAKE_DECAY * dt)
    }

    this.render(dt)

    this.uiTimer += dt
    if (this.uiTimer >= 0.1) {
      this.uiTimer = 0
      this.emitUi()
    }
  }

  private render(dt: number) {
    const ctx = this.ctx
    if (!ctx) return
    const { w, h } = this.module.view
    void dt
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.save()
    if (this.shakeAmt > 0.001 && !this.settings.reducedMotion) {
      const s = this.shakeAmt * 10
      ctx.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s)
    }
    if (this.started) {
      try {
        this.runtime.render(ctx, w, h)
      } catch (err) {
        console.error('[xgames] render error', err)
      }
    } else {
      // Before a level is loaded the runtime has no world state (e.g. exit
      // rects are undefined), so paint the module background instead of
      // asking a game to render. The shell's intro overlay sits on top of this.
      ctx.fillStyle = this.module.theme.background
      ctx.fillRect(0, 0, w, h)
    }
    this.particles.render(ctx)
    ctx.restore()
  }

  // -------------------------------------------------------------------------
  // events
  // -------------------------------------------------------------------------

  private beginDeath() {
    this.pendingDeath = false
    this.status = 'dying'
    this.deathTimer = 0
    this.levelDeaths += 1
    progress.recordDeath(this.module.slug, this.level)
    audio.play('death')
    this.flashId += 1
    if (!this.settings.reducedMotion) this.shakeAmt = Math.max(this.shakeAmt, 0.9)

    const focus = this.safeFocus()
    if (focus && !this.settings.reducedMotion) {
      this.particles.emit(focus.x, focus.y, 26, {
        colors: ['#ff0000', '#bdbdbd', '#0066ff', '#ffffff'],
        speed: 260,
        life: 0.7,
        size: 5,
        gravity: 700,
      })
    }

    const total = progress.getLevel(this.module.slug, this.level).deaths ?? this.levelDeaths
    this.narrateText(this.pendingDeathMsg ?? narrate({ event: 'death', deaths: total, level: this.level }))
    this.pendingDeathMsg = undefined
    this.emitUi(true)
  }

  private beginComplete() {
    this.pendingComplete = false
    const timeMs = this.elapsedMs
    progress.recordComplete(this.module.slug, this.level, timeMs, this.levelDeaths)
    audio.play('win')
    this.narrateText(narrate({ event: 'complete', deaths: this.levelDeaths, level: this.level }))
    const isLast = this.level >= this.module.levels
    this.status = isLast ? 'game-complete' : 'level-complete'
    if (isLast) this.narrateText(finalWords(progress.getGame(this.module.slug).totalDeaths))
    audio.setMusic(false)
    const newly = awardCosmetics(this.module.levels)
    if (newly.length) {
      audio.play('unlock')
      this.toast = newly[0]
      this.toastId += 1
    }
    this.emitUi(true)
  }

  private safeFocus() {
    try {
      return this.runtime.focus?.() ?? null
    } catch {
      return null
    }
  }

  private narrate(event: 'start' | 'death' | 'complete' | 'hazard' | 'near') {
    const total = progress.getLevel(this.module.slug, this.level).deaths ?? 0
    this.narrateText(narrate({ event, deaths: total, level: this.level }))
  }

  private narrateText(text: string) {
    if (!text) return
    this.narratorText = text
    this.narratorId += 1
    this.emitUi(true)
  }

  private emitUi(force = false) {
    void force
    this.onUi({
      status: this.status,
      level: this.level,
      levelCount: this.module.levels,
      deaths: this.levelDeaths,
      levelDeaths: progress.getLevel(this.module.slug, this.level).deaths ?? this.levelDeaths,
      totalDeaths: progress.getGame(this.module.slug).totalDeaths,
      elapsedMs: this.elapsedMs,
      bestMs: progress.getLevel(this.module.slug, this.level).bestMs ?? null,
      narrator: { text: this.narratorText, id: this.narratorId },
      flashId: this.flashId,
      toast: this.toast,
      reducedMotion: this.settings.reducedMotion,
    })
  }

  destroy() {
    this.destroyed = true
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    audio.setMusic(false)
    try {
      this.runtime.destroy?.()
    } catch {
      /* ignore */
    }
  }

  get hasStarted() {
    return this.started
  }
}
