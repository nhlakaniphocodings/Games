import { ParticleSystem } from '@/lib/game/particles'
import { PlatformerPlayer } from '@/lib/game/platformer'
import { fillRoundRect, label, roundRect } from '@/lib/game/draw'
import { clamp, rectsOverlap } from '@/lib/game/math'
import type { GameHooks, GameModule, GameRuntime, GameTheme, InputState, Rect, Vec } from '@/lib/game/types'

/*
 * REFERENCE MODULE — not imported anywhere.
 * Copy this shape when building a new game under games/<slug>/index.ts.
 * Every module exports `export const game: GameModule` (and a default export).
 *
 * Rules:
 *  - work in the module's internal `view` resolution (e.g. 960x540)
 *  - call hooks.death() / hooks.complete() / hooks.sound() / hooks.shake()
 *  - reset ALL level state inside load() so restart is deterministic
 *  - never touch the DOM, localStorage, or window directly (except markers if needed)
 *  - keep update() pure logic and render() pure drawing
 */

const VIEW = { w: 960, h: 540 }

const theme: GameTheme = {
  background: '#0c0a12',
  bg: '#120d1c',
  panel: '#1c1428',
  solid: '#2a1e3d',
  solidTop: '#4a3568',
  hazard: '#ff4d5e',
  accent: '#b31b62',
  accent2: '#92278f',
  player: '#f3e5ff',
  exit: '#3ce6a0',
  text: '#ffffff',
}

const GROUND = 480

interface Level {
  start: Vec
  exit: Rect
  solids: Rect[]
  spikes: Rect[]
}

const LEVELS: Level[] = [
  { start: { x: 40, y: GROUND - 32 }, exit: { x: 900, y: 404, w: 40, h: 76 }, solids: [{ x: 0, y: GROUND, w: 960, h: 60 }], spikes: [] },
  // ... define 10 total
]

class Runtime implements GameRuntime {
  private player = new PlatformerPlayer()
  private particles = new ParticleSystem()
  private hooks: GameHooks
  private level!: Level

  constructor(hooks: GameHooks) {
    this.hooks = hooks
  }

  load(level: number) {
    this.level = LEVELS[clamp(level - 1, 0, LEVELS.length - 1)]
    this.player = new PlatformerPlayer()
    this.player.reset(this.level.start.x, this.level.start.y)
    this.particles.clear()
  }

  update(dt: number, input: InputState) {
    const solids = this.level.solids.map((s) => ({ ...s, active: true }))
    this.player.step(dt, input, solids)
    const pr = { x: this.player.x, y: this.player.y, w: this.player.w, h: this.player.h }
    for (const s of this.level.spikes) {
      if (rectsOverlap(pr, s)) {
        this.hooks.death()
        return
      }
    }
    if (rectsOverlap(pr, this.level.exit)) this.hooks.complete()
    if (this.player.y > 640) this.hooks.death()
    this.particles.update(dt)
  }

  render(g: CanvasRenderingContext2D, w: number, h: number) {
    g.fillStyle = theme.bg
    g.fillRect(0, 0, w, h)
    for (const s of this.level.solids) fillRoundRect(g, s.x, s.y, s.w, s.h, 3, theme.solid)
    for (const s of this.level.spikes) {
      g.fillStyle = theme.hazard
      g.fillRect(s.x, s.y, s.w, s.h)
    }
    fillRoundRect(g, this.level.exit.x, this.level.exit.y, this.level.exit.w, this.level.exit.h, 4, theme.exit)
    const p = this.player
    g.save()
    g.translate(p.centerX, p.y + p.h)
    fillRoundRect(g, -p.w / 2, -p.h, p.w, p.h, 6, theme.player)
    g.restore()
    this.particles.render(g)
    label(g, 'REFERENCE', 16, 28, { size: 12, color: 'rgba(255,255,255,0.4)' })
    roundRect(g, 0, 0, 0, 0, 0)
  }

  focus(): Vec {
    return { x: this.player.centerX, y: this.player.centerY }
  }
}

export const game: GameModule = {
  slug: 'reference',
  title: 'Reference',
  tagline: 'A template, not a game.',
  theme,
  controls: [
    { keys: 'A / D', label: 'Move' },
    { keys: 'W / Space', label: 'Jump' },
  ],
  instructions: ['Copy this file.', 'Do not ship it as a real game.'],
  levels: LEVELS.length,
  view: VIEW,
  create: (hooks) => new Runtime(hooks),
}

export default game
