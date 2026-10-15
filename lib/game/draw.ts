import type { Rect } from './types'

export function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  g.beginPath()
  g.moveTo(x + rr, y)
  g.arcTo(x + w, y, x + w, y + h, rr)
  g.arcTo(x + w, y + h, x, y + h, rr)
  g.arcTo(x, y + h, x, y, rr)
  g.arcTo(x, y, x + w, y, rr)
  g.closePath()
}

export function fillRoundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
) {
  g.fillStyle = color
  roundRect(g, x, y, w, h, r)
  g.fill()
}

export function strokeRoundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
  width = 2,
) {
  g.strokeStyle = color
  g.lineWidth = width
  roundRect(g, x, y, w, h, r)
  g.stroke()
}

export function fillRect(g: CanvasRenderingContext2D, r: Rect, color: string) {
  g.fillStyle = color
  g.fillRect(r.x, r.y, r.w, r.h)
}

/** Text helper with optional glow. */
export function label(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; color?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; weight?: string; glow?: string } = {},
) {
  g.font = `${opts.weight ?? '700'} ${opts.size ?? 16}px "Arial Black", Arial, sans-serif`
  g.textAlign = opts.align ?? 'left'
  g.textBaseline = opts.baseline ?? 'alphabetic'
  if (opts.glow) {
    g.shadowColor = opts.glow
    g.shadowBlur = 18
  }
  g.fillStyle = opts.color ?? '#fff'
  g.fillText(text, x, y)
  g.shadowBlur = 0
}

/** Simple deterministic star/particle field for backgrounds. */
export function drawGrid(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  step: number,
  color: string,
  offsetX = 0,
  offsetY = 0,
) {
  g.strokeStyle = color
  g.lineWidth = 1
  g.beginPath()
  const ox = ((offsetX % step) + step) % step
  const oy = ((offsetY % step) + step) % step
  for (let x = -ox; x <= w; x += step) {
    g.moveTo(x, 0)
    g.lineTo(x, h)
  }
  for (let y = -oy; y <= h; y += step) {
    g.moveTo(0, y)
    g.lineTo(w, y)
  }
  g.stroke()
}
