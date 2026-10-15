import type { CCLevel, CCSolid, CCZone, CCHazard, ControlMode } from './types'

const GROUND = 480

const S = (x: number, y: number, w: number, h: number): CCSolid => ({ x, y, w, h })
/** Static spike field. */
const H = (x: number, y: number, w: number, h: number): CCHazard => ({ x, y, w, h })
/** Dynamic hazard with optional looping motion / blink / ambush behaviour. */
const HZ = (x: number, y: number, w: number, h: number, extra: Partial<CCHazard> = {}): CCHazard => ({
  x,
  y,
  w,
  h,
  ...extra,
})

interface ZoneOpts {
  mode?: ControlMode
  lockTime?: number
  warnPad?: number
  approach?: CCZone['approach']
  bandFull?: boolean
  label?: string
}

const ZONE = (x: number, y: number, w: number, h: number, label: string, warnPad: number, opts: ZoneOpts = {}): CCZone => ({
  x,
  y,
  w,
  h,
  kind: opts.mode ? 'zone' : opts.lockTime ? 'lock' : 'switch',
  mode: opts.mode,
  lockTime: opts.lockTime,
  warnPad,
  approach: opts.approach ?? 'left',
  bandFull: opts.bandFull,
  label,
})

const SWITCH = (x: number, w: number, mode: ControlMode, label: string, warnPad: number): CCZone => ({
  x,
  y: GROUND - 24,
  w,
  h: 24,
  kind: 'switch',
  mode,
  warnPad,
  approach: 'left',
  label,
})

/** A vertical timing blade: sits high, slams down on a fixed clock. */
const BLADE = (x: number, opts: { h?: number; up?: number; dy?: number; period: number; phase?: number } ) =>
  HZ(x, opts.up ?? 340, 26, opts.h ?? 100, { move: { dy: opts.dy ?? 60, period: opts.period, phase: opts.phase }, label: 'BLADE' })

/**
 * Ten gauntlets redesigned for real difficulty. Geometry stays inside a safe
 * envelope (gaps <= 150px < 190px running-jump reach, no rise above 110px <
 * 123px jump height) so every level keeps a true winning route, yet no level is
 * clearable by holding right. Every mapping change is telegraphed by a >=0.85s
 * warning band and mirrored live in the HUD; blades, timed spikes and ambushes
 * run on fixed clocks, so a learned route always works.
 */
export const ccLevels: CCLevel[] = [
  // 1 ── pit in the first second, then a mirrored corridor with a timing blade.
  {
    name: 'Signal Check',
    hint: 'Mind the first pit. Past the sign the corridor is REVERSED — read the HUD.',
    start: { x: 40, y: GROUND - 32 },
    exit: { x: 905, y: 404, w: 44, h: 76 },
    base: {},
    solids: [S(0, GROUND, 300, 60), S(430, GROUND, 270, 60), S(830, GROUND, 130, 60)],
    hazards: [H(300, 510, 130, 90), BLADE(560, { period: 1.6 }), H(700, 510, 130, 90)],
    zones: [ZONE(470, 300, 230, 180, 'REVERSED', 200, { mode: { rev: true } })],
  },

  // 2 ── jump is duck/slide all level: crawl under bars, wait out the blades.
  {
    name: 'Duck & Cover',
    hint: 'Jump is DUCK here. Hold it to crawl; the blades drop on a beat.',
    start: { x: 40, y: GROUND - 32 },
    exit: { x: 905, y: 404, w: 44, h: 76 },
    base: { jump: 'crouch' },
    solids: [S(0, GROUND, 960, 60)],
    hazards: [
      H(170, 440, 130, 22),
      HZ(360, 370, 26, 80, { move: { dy: 65, period: 1.7 }, label: 'BLADE' }),
      H(470, 440, 130, 22),
      HZ(650, 370, 26, 80, { move: { dy: 65, period: 1.9, phase: 0.5 }, label: 'BLADE' }),
      H(760, 440, 120, 22),
    ],
    zones: [ZONE(540, 300, 220, 180, 'REVERSED', 160, { mode: { rev: true } })],
  },

  // 3 ── two pits, a mirrored span with a blade, then out.
  {
    name: 'Mirror Hall',
    hint: 'Clear the first pit straight, then everything under the sign is REVERSED.',
    start: { x: 40, y: GROUND - 32 },
    exit: { x: 905, y: 404, w: 44, h: 76 },
    base: {},
    solids: [S(0, GROUND, 280, 60), S(400, GROUND, 300, 60), S(840, GROUND, 120, 60)],
    hazards: [H(280, 510, 120, 90), BLADE(560, { period: 1.5 }), H(700, 510, 140, 90)],
    zones: [ZONE(440, 300, 260, 180, 'REVERSED', 200, { mode: { rev: true } })],
  },

  // 4 ── pressure plates latch the mapping; you carry it across every hazard.
  {
    name: 'Pressure Plates',
    hint: 'Plates LATCH. Reversed from the first, normal again only at the last.',
    start: { x: 50, y: GROUND - 32 },
    exit: { x: 905, y: 404, w: 44, h: 76 },
    base: {},
    solids: [S(0, GROUND, 240, 60), S(360, GROUND, 260, 60), S(740, GROUND, 220, 60)],
    hazards: [H(240, 510, 120, 90), BLADE(480, { period: 1.4 }), H(620, 510, 120, 90)],
    zones: [
      SWITCH(160, 90, { rev: true }, 'PLATE: REVERSED', 180),
      SWITCH(800, 90, { rev: false }, 'PLATE: NORMAL', 180),
    ],
  },

  // 5 ── a lock sits over each pit: jump BEFORE it or momentum carries you down.
  {
    name: 'Momentum Lock',
    hint: 'The lock kills your buttons over the void. Commit to the jump first.',
    start: { x: 40, y: GROUND - 32 },
    exit: { x: 905, y: 404, w: 44, h: 76 },
    base: {},
    solids: [S(0, GROUND, 300, 60), S(430, GROUND, 270, 60), S(830, GROUND, 130, 60)],
    hazards: [H(300, 510, 130, 90), H(700, 510, 130, 90)],
    zones: [
      ZONE(340, 280, 100, 220, 'CONTROL LOCK', 240, { lockTime: 0.8 }),
      ZONE(740, 280, 100, 220, 'CONTROL LOCK', 200, { lockTime: 0.7 }),
    ],
  },

  // 6 ── full inverter: mirrored AND jump becomes duck, with bars to crawl under.
  {
    name: 'Full Invert',
    hint: 'Inside the inverter you are MIRRORED and jump becomes DUCK. Crawl, do not hop.',
    start: { x: 40, y: GROUND - 32 },
    exit: { x: 905, y: 404, w: 44, h: 76 },
    base: {},
    solids: [S(0, GROUND, 240, 60), S(360, GROUND, 340, 60), S(760, GROUND, 200, 60)],
    hazards: [
      H(240, 510, 120, 90),
      H(430, 440, 100, 22),
      HZ(510, 370, 24, 80, { move: { dy: 60, period: 1.6 }, label: 'BLADE' }),
      H(580, 440, 80, 22),
      H(700, 510, 60, 90),
    ],
    zones: [ZONE(390, 240, 240, 240, 'INVERTED', 180, { mode: { rev: true, jump: 'crouch' } })],
  },

  // 7 ── layered: mirrored blade, then a lock over the second pit, then a blade.
  {
    name: 'Crossed Wires',
    hint: 'Mirror the first span, then lock your jump over the void, then time the last blade.',
    start: { x: 20, y: GROUND - 32 },
    exit: { x: 905, y: 404, w: 44, h: 76 },
    base: {},
    solids: [S(0, GROUND, 280, 60), S(400, GROUND, 300, 60), S(830, GROUND, 130, 60)],
    hazards: [H(280, 510, 120, 90), BLADE(540, { period: 1.5 }), H(700, 510, 130, 90), BLADE(660, { period: 1.3, phase: 0.4 })],
    zones: [
      ZONE(430, 300, 200, 180, 'REVERSED', 180, { mode: { rev: true } }),
      ZONE(740, 280, 90, 220, 'CONTROL LOCK', 180, { lockTime: 0.6 }),
    ],
  },

  // 8 ── fork: reversed high rail over the spikes, or the plain-but-spiked low lane.
  {
    name: 'Twin Signals',
    hint: 'Two roads, two signs — high is MIRRORED and airy, low is plain but spiked.',
    start: { x: 40, y: GROUND - 32 },
    exit: { x: 905, y: 404, w: 44, h: 76 },
    base: {},
    solids: [
      S(0, GROUND, 240, 60),
      S(300, GROUND, 400, 60),
      S(340, 380, 110, 16),
      S(520, 340, 140, 16),
      S(680, 380, 120, 16),
      S(760, GROUND, 200, 60),
    ],
    hazards: [H(360, 460, 60, 20), H(500, 460, 60, 20), BLADE(620, { period: 1.4 }), H(700, 510, 60, 90)],
    zones: [ZONE(340, 320, 460, 70, 'HIGH: REVERSED', 160, { mode: { rev: true }, bandFull: false })],
  },

  // 9 ── the ratchet: reverse, lock, then duck — it stacks and never unwinds.
  {
    name: 'Ratchet',
    hint: 'Reverse, lock, duck — every plate sticks. Watch the bar and the timed spikes.',
    start: { x: 40, y: GROUND - 32 },
    exit: { x: 905, y: 404, w: 44, h: 76 },
    base: {},
    solids: [S(0, GROUND, 280, 60), S(400, GROUND, 560, 60)],
    hazards: [
      H(280, 510, 120, 90),
      H(560, 440, 120, 22),
      HZ(650, 462, 60, 18, { blink: { period: 1.7, on: 0.85 }, label: 'TIMED' }),
      H(720, 440, 110, 22),
    ],
    zones: [
      SWITCH(180, 90, { rev: true }, 'PLATE: REVERSED', 180),
      ZONE(310, 280, 90, 220, 'CONTROL LOCK', 200, { lockTime: 0.65 }),
      SWITCH(500, 90, { jump: 'crouch' }, 'PLATE: DUCK/SLIDE', 160),
      SWITCH(810, 90, { jump: 'jump' }, 'PLATE: JUMP BACK', 160),
    ],
  },

  // 10 ── finale: mirrored span, a blade, a pop-up ambush, then a lying door.
  {
    name: 'Total Chaos',
    hint: 'Every signal at once. The first door is a lie — only the green one wins.',
    start: { x: 20, y: GROUND - 32 },
    exit: { x: 896, y: 324, w: 44, h: 76 },
    decoys: [{ x: 840, y: 404, w: 44, h: 76 }],
    base: {},
    solids: [S(0, GROUND, 300, 60), S(430, GROUND, 530, 60), S(880, 400, 80, 16)],
    hazards: [
      H(300, 510, 130, 90),
      HZ(580, 340, 26, 100, { move: { dy: 60, period: 1.5 }, label: 'BLADE' }),
      HZ(740, 462, 60, 18, { armAtX: 680, warn: 0.35, label: 'AMBUSH' }),
    ],
    zones: [
      ZONE(330, 280, 100, 220, 'CONTROL LOCK', 200, { lockTime: 0.6 }),
      ZONE(450, 300, 230, 180, 'REVERSED', 160, { mode: { rev: true } }),
    ],
  },
]
