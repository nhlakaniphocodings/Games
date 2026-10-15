import { makeRng } from './math'

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
  gravity: number
  shape: 'square' | 'circle'
}

export class ParticleSystem {
  particles: Particle[] = []
  private rng = makeRng(1337)

  clear() {
    this.particles.length = 0
  }

  emit(
    x: number,
    y: number,
    count: number,
    opts: {
      colors: string[]
      speed?: number
      spread?: number
      dir?: number
      life?: number
      size?: number
      gravity?: number
      shape?: 'square' | 'circle'
    },
  ) {
    const speed = opts.speed ?? 160
    const spread = opts.spread ?? Math.PI * 2
    const dir = opts.dir ?? 0
    const life = opts.life ?? 0.6
    const size = opts.size ?? 4
    const gravity = opts.gravity ?? 600
    for (let i = 0; i < count; i++) {
      const a = dir - spread / 2 + this.rng() * spread
      const s = speed * (0.4 + this.rng() * 0.8)
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.6 + this.rng() * 0.6),
        maxLife: life,
        size: size * (0.6 + this.rng() * 0.8),
        color: opts.colors[Math.floor(this.rng() * opts.colors.length)],
        gravity,
        shape: opts.shape ?? 'square',
      })
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600)
  }

  update(dt: number) {
    const ps = this.particles
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]
      p.vy += p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      if (p.life <= 0) ps.splice(i, 1)
    }
  }

  render(g: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const a = Math.max(0, Math.min(1, p.life / p.maxLife))
      g.globalAlpha = a
      g.fillStyle = p.color
      if (p.shape === 'circle') {
        g.beginPath()
        g.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2)
        g.fill()
      } else {
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      }
    }
    g.globalAlpha = 1
  }
}
