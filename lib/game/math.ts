import type { Rect } from './types'

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const sign = (v: number) => (v < 0 ? -1 : v > 0 ? 1 : 0)

/** Approach `target` from `current`, never overshooting. */
export const approach = (current: number, target: number, delta: number) => {
  if (current < target) return Math.min(current + delta, target)
  if (current > target) return Math.max(current - delta, target)
  return target
}

export interface AABB {
  x: number
  y: number
  w: number
  h: number
}

export function rectsOverlap(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function pointInRect(px: number, py: number, r: AABB): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
}

/** Circle vs axis-aligned rect collision test. */
export function circleRect(cx: number, cy: number, r: number, rect: AABB): boolean {
  const nx = clamp(cx, rect.x, rect.x + rect.w)
  const ny = clamp(cy, rect.y, rect.y + rect.h)
  const dx = cx - nx
  const dy = cy - ny
  return dx * dx + dy * dy <= r * r
}

export function rectCenter(r: AABB): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return Math.sqrt(dx * dx + dy * dy)
}

/** Deterministic seeded RNG (mulberry32). */
export function makeRng(seed: number) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomRange(rng: () => number, lo: number, hi: number) {
  return lo + rng() * (hi - lo)
}

export function formatTime(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '--:--'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  const centis = Math.floor((ms % 1000) / 10)
  return `${m}:${s.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`
}

export function rectFrom(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h }
}
