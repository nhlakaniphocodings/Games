import type { LevelDef, PlatDef, SwitchDef } from './types'

// ---------------------------------------------------------------------------
// Small builders so the level grid stays readable.
//   SZ  — safe floating platform (h = 16)
//   HW  — hazard platform (h = 16 unless overridden)
//   G   — ground segment (y = 480, h = 60)
// ---------------------------------------------------------------------------

const SZ = (id: string, x: number, y: number, w: number, extra: Partial<PlatDef> = {}): PlatDef => ({
  id,
  x,
  y,
  w,
  h: 16,
  ...extra,
})

const HW = (id: string, x: number, y: number, w: number, extra: Partial<PlatDef> = {}): PlatDef => ({
  id,
  x,
  y,
  w,
  h: 16,
  kind: 'hazard',
  ...extra,
})

const G = (id: string, x: number, w: number, extra: Partial<PlatDef> = {}): PlatDef => ({
  id,
  x,
  y: 480,
  w,
  h: 60,
  floor: true,
  ...extra,
})

const SW = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<SwitchDef> = {},
): SwitchDef => ({ id, x, y, w, h, ...extra })

// Player height is 32, ground top is 480.
const START_Y = 480 - 32

/**
 * Ten hand-built memory gauntlets.
 * Every run is deterministic: platform positions, motion and switch states all
 * derive from a fixed clock, so a learned route always works.
 */
export const invisiblePathLevels: LevelDef[] = [
  // 1 -----------------------------------------------------------------------
  {
    name: 'First Light',
    hint: 'Watch the path appear, then walk it from memory.',
    start: { x: 40, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    preview: 2.6,
    flashes: 4,
    platforms: [
      G('g0', 0, 240),
      SZ('a', 320, 440, 90),
      SZ('b', 500, 400, 90),
      SZ('c', 680, 430, 90),
      G('g1', 790, 170),
    ],
    route: [
      { x: 60, y: 448 },
      { x: 365, y: 440 },
      { x: 545, y: 400 },
      { x: 725, y: 430 },
      { x: 920, y: 448 },
    ],
  },

  // 2 -----------------------------------------------------------------------
  {
    name: 'Blink',
    hint: 'One slab is jagged. Jagged means death.',
    start: { x: 40, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    preview: 2.4,
    flashes: 3,
    platforms: [
      G('g0', 0, 200),
      SZ('a', 280, 440, 80),
      HW('x', 400, 440, 80),
      SZ('b', 520, 440, 80),
      SZ('c', 650, 390, 90),
      G('g1', 790, 170),
    ],
    route: [
      { x: 60, y: 448 },
      { x: 320, y: 440 },
      { x: 440, y: 350 },
      { x: 560, y: 440 },
      { x: 695, y: 390 },
      { x: 920, y: 448 },
    ],
  },

  // 3 -----------------------------------------------------------------------
  {
    name: 'Echoes',
    hint: 'A longer chain, and a safe stone to fall back to.',
    start: { x: 40, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    preview: 2.2,
    flashes: 4,
    platforms: [
      G('g0', 0, 180),
      SZ('a', 260, 450, 80),
      SZ('b', 400, 400, 80),
      SZ('c', 540, 420, 80, { checkpoint: true }),
      SZ('d', 680, 370, 80),
      SZ('e', 800, 420, 80),
      G('g1', 880, 80),
    ],
    route: [
      { x: 60, y: 448 },
      { x: 300, y: 450 },
      { x: 440, y: 400 },
      { x: 580, y: 420 },
      { x: 720, y: 370 },
      { x: 840, y: 420 },
      { x: 920, y: 448 },
    ],
  },

  // 4 -----------------------------------------------------------------------
  {
    name: 'Pivot',
    hint: 'The far side is a lie. Something here can open a way.',
    start: { x: 40, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    preview: 2.4,
    flashes: 3,
    platforms: [
      G('g0', 0, 240),
      SZ('a', 330, 430, 80),
      SZ('b', 470, 430, 80),
      SZ('c', 610, 370, 80, { hidden: true }),
      SZ('d', 750, 310, 80, { hidden: true }),
      G('g1', 860, 100),
    ],
    switches: [
      SW('sw1', 485, 398, 50, 34, {
        reveal: ['c', 'd'],
        hint: 'PRESS E',
      }),
    ],
    route: [
      { x: 60, y: 448 },
      { x: 370, y: 430 },
      { x: 510, y: 430 },
      { x: 650, y: 370 },
      { x: 790, y: 310 },
      { x: 920, y: 448 },
    ],
  },

  // 5 -----------------------------------------------------------------------
  {
    name: 'Sleight',
    hint: 'Two stones drift. Read the rhythm before you leap.',
    start: { x: 40, y: START_Y },
    exit: { x: 890, y: 404, w: 40, h: 76 },
    preview: 2.5,
    flashes: 3,
    platforms: [
      G('g0', 0, 200),
      SZ('m1', 300, 430, 100, { move: { dx: 70, dy: 0, period: 2.6 }, ghost: true }),
      SZ('m2', 520, 390, 100, { move: { dx: 0, dy: 45, period: 2.2, phase: 0.5 }, ghost: true }),
      HW('x', 470, 470, 80),
      SZ('s1', 700, 420, 90, { checkpoint: true }),
      G('g1', 840, 120),
    ],
    route: [
      { x: 60, y: 448 },
      { x: 300, y: 430 },
      { x: 560, y: 390 },
      { x: 745, y: 420 },
      { x: 920, y: 448 },
    ],
  },

  // 6 -----------------------------------------------------------------------
  {
    name: 'Afterimage',
    hint: 'Two blades sweep the gaps. They never change their tune.',
    start: { x: 40, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    preview: 2.4,
    flashes: 4,
    platforms: [
      G('g0', 0, 200),
      SZ('a', 280, 430, 90),
      SZ('b', 440, 430, 90),
      SZ('c', 600, 430, 90, { checkpoint: true }),
      SZ('d', 760, 430, 90),
      HW('h1', 395, 360, 26, { h: 26, ghost: true, move: { dx: 0, dy: 130, period: 1.8 } }),
      HW('h2', 712, 360, 26, { h: 26, ghost: true, move: { dx: 0, dy: 130, period: 1.6, phase: 0.4 } }),
      G('g1', 890, 70),
    ],
    route: [
      { x: 60, y: 448 },
      { x: 325, y: 430 },
      { x: 485, y: 430 },
      { x: 645, y: 430 },
      { x: 805, y: 430 },
      { x: 920, y: 448 },
    ],
  },

  // 7 -----------------------------------------------------------------------
  {
    name: 'Vanishing Act',
    hint: 'These stones only hold weight half the time. Keep the beat.',
    start: { x: 40, y: START_Y },
    exit: { x: 880, y: 404, w: 40, h: 76 },
    preview: 2.6,
    flashes: 3,
    platforms: [
      G('g0', 0, 220),
      SZ('b1', 300, 430, 100, { blink: { period: 2.0, duty: 0.6 }, ghost: true }),
      SZ('b2', 470, 400, 100, { blink: { period: 2.0, duty: 0.6, phase: 0.35 }, ghost: true }),
      HW('x', 470, 470, 100),
      SZ('b3', 640, 430, 100, { blink: { period: 2.0, duty: 0.6, phase: 0.7 }, ghost: true }),
      G('g1', 800, 160),
    ],
    route: [
      { x: 60, y: 448 },
      { x: 350, y: 430 },
      { x: 520, y: 400 },
      { x: 690, y: 430 },
      { x: 920, y: 448 },
    ],
  },

  // 8 -----------------------------------------------------------------------
  {
    name: 'Split Second',
    hint: 'Half-time stones and a sweeping blade. Do not rush the beat.',
    start: { x: 40, y: START_Y },
    exit: { x: 880, y: 404, w: 40, h: 76 },
    preview: 2.3,
    flashes: 3,
    platforms: [
      G('g0', 0, 200),
      SZ('b1', 280, 440, 90, { blink: { period: 1.8, duty: 0.55 }, ghost: true }),
      SZ('b2', 440, 410, 90, { blink: { period: 1.8, duty: 0.55, phase: 0.3 }, ghost: true }),
      SZ('b3', 600, 440, 90, { blink: { period: 1.8, duty: 0.55, phase: 0.6 }, ghost: true }),
      HW('h1', 370, 380, 26, { h: 26, ghost: true, move: { dx: 0, dy: 120, period: 1.7 } }),
      HW('h2', 532, 380, 26, { h: 26, ghost: true, move: { dx: 0, dy: 120, period: 1.7, phase: 0.5 } }),
      G('g1', 760, 200, { checkpoint: true }),
    ],
    route: [
      { x: 60, y: 448 },
      { x: 325, y: 440 },
      { x: 485, y: 410 },
      { x: 645, y: 440 },
      { x: 920, y: 448 },
    ],
  },

  // 9 -----------------------------------------------------------------------
  {
    name: 'Long Dark',
    hint: 'Two anchors to save you. The pit is deeper than it looks.',
    start: { x: 40, y: START_Y },
    exit: { x: 890, y: 404, w: 40, h: 76 },
    preview: 2.8,
    flashes: 5,
    platforms: [
      G('g0', 0, 170),
      SZ('p1', 250, 440, 80, { checkpoint: true }),
      HW('x1', 380, 440, 80),
      SZ('p2', 490, 400, 80),
      SZ('p3', 650, 440, 80, { checkpoint: true }),
      HW('x2', 742, 440, 48),
      HW('h1', 590, 340, 26, { h: 26, ghost: true, move: { dx: 0, dy: 110, period: 1.7 } }),
      G('g1', 800, 160),
    ],
    route: [
      { x: 60, y: 448 },
      { x: 290, y: 440 },
      { x: 420, y: 350 },
      { x: 530, y: 400 },
      { x: 690, y: 440 },
      { x: 920, y: 448 },
    ],
  },

  // 10 ----------------------------------------------------------------------
  {
    name: 'Remember Me',
    hint: 'Everything you have learned, in the dark, in order.',
    start: { x: 40, y: START_Y },
    exit: { x: 895, y: 224, w: 40, h: 76 },
    preview: 3.0,
    flashes: 5,
    platforms: [
      G('g0', 0, 180),
      SZ('p1', 260, 440, 80, { checkpoint: true }),
      SZ('bp', 410, 420, 80, { blink: { period: 1.9, duty: 0.58 }, ghost: true }),
      SZ('p2', 560, 420, 80),
      SZ('p3', 700, 360, 80, { hidden: true }),
      SZ('p4', 860, 300, 80, { hidden: true, checkpoint: true }),
      HW('h1', 520, 380, 26, { h: 26, ghost: true, move: { dx: 0, dy: 110, period: 1.7 } }),
      HW('h2', 690, 300, 28, { h: 28, ghost: true, move: { dx: 150, dy: 0, period: 2.4 } }),
    ],
    switches: [
      SW('sw1', 575, 390, 50, 34, { reveal: ['p3', 'p4'], hint: 'PRESS E' }),
    ],
    route: [
      { x: 60, y: 448 },
      { x: 300, y: 440 },
      { x: 450, y: 420 },
      { x: 600, y: 420 },
      { x: 740, y: 360 },
      { x: 900, y: 262 },
    ],
  },
]
