import type { DecorDef, HazardDef, LevelDef, SolidDef } from './types'

const GROUND = 480
const START_Y = GROUND - 32
const EXIT_Y = 404

const S = (x: number, y: number, w: number, h: number, extra: Partial<SolidDef> = {}): SolidDef => ({ x, y, w, h, ...extra })
const H = (x: number, y: number, w: number, h: number, extra: Partial<HazardDef> = {}): HazardDef => ({ x, y, w, h, ...extra })

/** Full-width floor slab (top at y=480). */
const F = (x: number, w: number): SolidDef => S(x, GROUND, w, 60)
/** Full-width ceiling slab (bottom at y=60). */
const C = (x: number, w: number): SolidDef => S(x, 0, w, 60)
/** Thin platform (16px tall) at an arbitrary height. */
const P = (x: number, y: number, w: number, extra: Partial<SolidDef> = {}): SolidDef => S(x, y, w, 16, extra)
/** Spikes growing up from the floor. */
const SF = (x: number, w: number): HazardDef => H(x, 458, w, 22, { face: 'floor' })
/** Spikes resting at the bottom of a pit. */
const SP = (x: number, w: number, extra: Partial<HazardDef> = {}): HazardDef =>
  H(x, 516, w, 24, { face: 'floor', ...extra })
/** Spikes hanging down from the ceiling. */
const SC = (x: number, w: number): HazardDef => H(x, 64, w, 22, { face: 'ceiling' })
/** A vertical rhythm gate from the floor up to `y`. */
const BEAM = (x: number, y: number, w: number, win: HazardDef['window']): HazardDef =>
  H(x, y, w, GROUND - y, { kind: 'beam', window: win })
/** A head-height horizontal rhythm gate. */
const HBEAM = (x: number, w: number, y: number, win: HazardDef['window']): HazardDef =>
  H(x, y, w, 22, { kind: 'beam', window: win })
const SAW = (x: number, y: number, s: number, sweep: HazardDef['sweep']): HazardDef => H(x, y, s, s, { kind: 'saw', sweep })

const label = (x: number, y: number, text: string, color: string, size = 15): DecorDef => ({ kind: 'label', x, y, text, color, size })
const sign = (x: number, y: number, text: string, color: string): DecorDef => ({ kind: 'label', x, y, text, color, size: 14, box: true })
const arrow = (x: number, y: number, dx: number, dy: number, text: string, color: string): DecorDef => ({ kind: 'arrow', x, y, dx, dy, text, color, len: 54 })
const button = (x: number, y: number, w: number, h: number, text: string, color: string): DecorDef => ({ kind: 'button', x, y, w, h, text, color })

const WHITE = '#ffffff'
const GRAY = '#bdbdbd'
const BLUE = '#0066ff'
const RED = '#ff0000'

/**
 * Ten hand-built levels. This is the boss rush: it opens at the difficulty the
 * other games ended at and only ever climbs. Every trap is deterministic and
 * every level keeps at least one honest, reachable route.
 */
export const finaleLevels: LevelDef[] = [
  // 1 ── combined from the first attempt: a rhythm gate guarding a pit that
  //      refuses a lazy jump, then a falling floor and a door that times you.
  {
    name: 'No Warm-Up',
    hint: 'Nothing here is a tutorial. Read the beam, ride the falling floor, never sprint blind.',
    start: { x: 40, y: START_Y },
    exit: { x: 906, y: EXIT_Y, w: 40, h: 76 },
    bpm: 120,
    showBeat: true,
    exitWindow: { period: 4, on: 2, phase: 0 },
    solids: [
      F(0, 680),
      P(750, 440, 100, { kind: 'fall', delay: 0.5 }),
      F(880, 80),
    ],
    hazards: [
      SP(680, 200, { deathMsg: 'The pit kept the print of your feet.' }),
      BEAM(680, 200, 26, { period: 4, on: 2.4, phase: 0 }),
    ],
    decor: [
      arrow(300, 300, 1, 0, 'GO', WHITE),
      sign(680, 170, 'GATE', RED),
      label(884, 402, 'THE DOOR REMEMBERS', GRAY, 11),
    ],
  },

  // 2 ── gravity is the only jump: flip to cross, but each surface hides its
  //      own spikes and the arc drags you sideways the whole way.
  {
    name: 'Downside Up',
    hint: 'Space flips gravity. The floor is a suggestion; the ceiling has teeth.',
    start: { x: 40, y: START_Y },
    exit: { x: 912, y: 16, w: 40, h: 64 },
    jumpMode: 'flip',
    bpm: 120,
    gravityStart: 1,
    solids: [C(0, 960), F(0, 300), F(460, 500)],
    hazards: [SC(520, 200), SF(720, 160)],
    decor: [
      arrow(120, 360, 1, 0, 'FLIP', WHITE),
      label(500, 120, 'STAY LOW', GRAY, 11),
      label(700, 110, 'STAY HIGH', GRAY, 11),
    ],
  },

  // 3 ── the signs lie: a painted bridge over a spike pit, a painted exit in
  //      mid-air, and the real route only exists half of every bar.
  {
    name: 'Trust The Signs',
    hint: 'Every sign is painted by the room. The room is the only thing that cannot lie.',
    start: { x: 40, y: START_Y },
    exit: { x: 900, y: EXIT_Y, w: 40, h: 76 },
    bpm: 120,
    showBeat: true,
    solids: [
      F(0, 420),
      S(440, 430, 300, 18, { kind: 'fake' }),
      P(560, 420, 90, { kind: 'blink', window: { period: 4, on: 2.6, phase: 0 } }),
      P(680, 430, 80, { kind: 'fall', delay: 0.5 }),
      F(760, 200),
    ],
    hazards: [
      SP(420, 340, { deathMsg: 'The bridge was a painting.' }),
      SAW(800, 436, 44, { axis: 'x', range: 60, period: 2, phase: 0 }),
    ],
    decoys: [{ id: 'd3', x: 852, y: 300, w: 40, h: 76 }],
    decor: [
      arrow(120, 300, -1, 0, 'EXIT ←', WHITE),
      sign(520, 392, 'SOLID BRIDGE', GRAY),
      label(852, 286, 'REAL EXIT', WHITE, 12),
    ],
  },

  // 4 ── the mirroring from Control Chaos: a pit crossed while reversed, and
  //      bands that hand control back exactly when you expect them not to.
  {
    name: 'Wrong Way',
    hint: 'A warning band mirrors you. Read it before you move, or sprint into what you fled.',
    start: { x: 40, y: START_Y },
    exit: { x: 906, y: EXIT_Y, w: 40, h: 76 },
    bpm: 120,
    solids: [F(0, 400), F(540, 420)],
    hazards: [
      SP(400, 140),
      SF(640, 120),
      BEAM(800, 200, 26, { period: 3, on: 1.6, phase: 0 }),
      SAW(300, 440, 40, { axis: 'x', range: 80, period: 2, phase: 0 }),
    ],
    controlZones: [
      { x: 200, y: 0, w: 240, h: 540, reverse: true, warnPad: 70, label: 'MIRRORED' },
      { x: 470, y: 0, w: 210, h: 540, reverse: false, warnPad: 70, label: 'NORMAL' },
    ],
    decor: [label(160, 440, 'HOLD LEFT', GRAY, 11)],
  },

  // 5 ── the invisible path: memorise the blinking steps, then cross the open
  //      half of the bar while a saw rewrites the gap.
  {
    name: 'Now You See It',
    hint: 'Memorise the steps while they burn. Cross before the dark takes them back.',
    start: { x: 40, y: START_Y },
    exit: { x: 880, y: EXIT_Y, w: 40, h: 76 },
    memorize: 3,
    bpm: 100,
    showBeat: true,
    solids: [
      F(0, 220),
      P(280, 440, 110, { kind: 'blink', window: { period: 6, on: 4.2, phase: 0 } }),
      P(470, 430, 110, { kind: 'blink', window: { period: 6, on: 4.2, phase: 0 } }),
      P(660, 440, 110, { kind: 'blink', window: { period: 6, on: 4.2, phase: 0 } }),
      F(840, 120),
    ],
    hazards: [
      SP(220, 620, { deathMsg: 'The dark took the step back.' }),
      SAW(430, 388, 40, { axis: 'x', range: 170, period: 3, phase: 0 }),
    ],
    decor: [sign(330, 410, 'SAFE', GRAY)],
  },

  // 6 ── the beat: off-count gates, a long saw and a door that only listens on
  //      the dark half of the bar.
  {
    name: 'On The Beat',
    hint: 'The beams keep a count you cannot hear. Cross on the dark half, every time.',
    start: { x: 40, y: START_Y },
    exit: { x: 900, y: EXIT_Y, w: 40, h: 76 },
    bpm: 128,
    showBeat: true,
    exitWindow: { period: 4, on: 2, phase: 0 },
    solids: [F(0, 960)],
    hazards: [
      SF(300, 130),
      BEAM(460, 300, 26, { period: 1, on: 0.5, phase: 0 }),
      BEAM(640, 300, 26, { period: 1, on: 0.5, phase: 0.5 }),
      SAW(500, 336, 36, { axis: 'x', range: 150, period: 3, phase: 0 }),
      SF(800, 110),
    ],
  },

  // 7 ── the twins: one set of keys, two mirrored bodies, both doors or none.
  {
    name: 'Twin Twist',
    hint: 'One set of keys, two bodies, mirrored. Both doors, or neither counts.',
    start: { x: 40, y: START_Y },
    exit: { x: 820, y: EXIT_Y, w: 40, h: 76 },
    twin: { start2: { x: 920, y: START_Y }, exit2: { x: 100, y: EXIT_Y, w: 40, h: 76 }, axis: 480 },
    bpm: 120,
    showBeat: true,
    solids: [
      F(0, 300),
      F(420, 120),
      F(660, 300),
      P(320, 440, 80, { kind: 'fall', delay: 0.5 }),
      P(560, 440, 80, { kind: 'fall', delay: 0.5 }),
    ],
    hazards: [
      SP(300, 120),
      SP(540, 120),
      BEAM(458, 260, 28, { period: 3, on: 1.5, phase: 0 }),
      SAW(440, 430, 40, { axis: 'x', range: 60, period: 2, phase: 0 }),
      SAW(490, 430, 40, { axis: 'x', range: 60, period: 2, phase: 0.5 }),
    ],
  },

  // 8 ── the gauntlet: survive a layered pattern before the door unlocks.
  {
    name: 'Hold The Line',
    hint: 'No door yet. Survive the pattern until the room exhausts itself.',
    start: { x: 220, y: START_Y },
    exit: { x: 740, y: EXIT_Y, w: 40, h: 76 },
    survival: 10,
    bpm: 120,
    showBeat: true,
    solids: [S(160, GROUND, 640, 60), S(420, 360, 120, 18, { kind: 'fake' })],
    hazards: [
      H(200, 458, 180, 22, { window: { period: 3, on: 1.3, phase: 0 } }),
      H(400, 458, 200, 22, { window: { period: 3, on: 1.3, phase: 1 } }),
      H(600, 458, 200, 22, { window: { period: 3, on: 1.3, phase: 2 } }),
      SAW(240, 420, 44, { axis: 'x', range: 460, period: 2.6, phase: 0 }),
      HBEAM(360, 120, 240, { period: 3, on: 1.4, phase: 0.5 }),
    ],
    decor: [sign(470, 350, 'SAFE ZONE', RED)],
  },

  // 9 ── the collapse: floor that forgets you, a bridge that leaves when you
  //      trust it, and a second door armed just before the real one.
  {
    name: 'Collapse',
    hint: 'The floor forgets you the moment you leave it. The bridge betrays you when you trust it.',
    start: { x: 30, y: START_Y },
    exit: { x: 900, y: EXIT_Y, w: 40, h: 76 },
    bpm: 120,
    showBeat: true,
    solids: [
      S(0, GROUND, 90, 60, { vanishAt: 160 }),
      S(90, GROUND, 90, 60, { vanishAt: 250 }),
      S(180, GROUND, 90, 60, { vanishAt: 340 }),
      S(270, GROUND, 90, 60, { vanishAt: 430 }),
      S(360, GROUND, 90, 60, { vanishAt: 520 }),
      P(470, 445, 90, { kind: 'fall', delay: 0.45 }),
      S(580, 440, 150, 18, { id: 'bridge', kind: 'retract', retract: { onStand: true, dx: 280, dy: 0, speed: 200 } }),
      F(860, 100),
    ],
    hazards: [SP(540, 320), SAW(700, 430, 40, { axis: 'x', range: 90, period: 2, phase: 0 })],
    decoys: [{ id: 'd9', x: 820, y: 300, w: 40, h: 76, hidden: true }],
    triggers: [
      { x: 150, y: 0, w: 140, h: 540, once: true, message: 'THE FLOOR IS RUNNING OUT', shake: 0.25 },
      { x: 720, y: 0, w: 150, h: 540, once: true, armDecoy: 'd9', sound: 'hit', shake: 0.3 },
    ],
    decor: [label(600, 420, 'RETRACTING', RED, 11)],
  },

  // 10 ── the finale: everything at once, a crown that is a lie, and a phase 2
  //       that rewrites the room. The last door is genuinely the last door.
  {
    name: 'The Finale',
    hint: 'Everything you survived, in one room. The exit is real. Probably.',
    start: { x: 40, y: START_Y },
    exit: { x: 896, y: EXIT_Y, w: 40, h: 76 },
    bpm: 120,
    showBeat: true,
    exitWindow: { period: 4, on: 2, phase: 0 },
    solids: [
      F(0, 260),
      P(320, 440, 90, { kind: 'blink', window: { period: 6, on: 4, phase: 0 } }),
      P(470, 430, 90, { kind: 'blink', window: { period: 6, on: 4, phase: 0 } }),
      S(600, 466, 70, 14, { kind: 'fake' }),
      P(620, 430, 80, { kind: 'fall', delay: 0.45 }),
      F(760, 200),
    ],
    hazards: [
      SP(260, 480, { deathMsg: 'The last room opens its throat.' }),
      SAW(400, 300, 40, { axis: 'x', range: 150, period: 3, phase: 0 }),
      SF(700, 60),
      BEAM(800, 220, 26, { period: 3, on: 1.6, phase: 0 }),
    ],
    controlZones: [{ x: 120, y: 0, w: 150, h: 540, reverse: true, warnPad: 60, label: 'MIRRORED' }],
    decor: [label(80, 430, 'THE END', GRAY, 12)],
    fakeStats: {
      time: '01:03.77',
      deaths: '0',
      score: '999,999',
      quip: 'THE DEVIL IS SLAIN',
    },
    phase2: {
      name: 'The Finale — Phase 2',
      hint: 'It was never the door. Cross the void on the smallest promise.',
      start: { x: 40, y: 408 },
      exit: { x: 860, y: 110, w: 40, h: 48 },
      bpm: 120,
      showBeat: true,
      jumpMode: 'jump',
      solids: [
        S(40, 440, 120, 18),
        P(220, 420, 90, { kind: 'blink', window: { period: 6, on: 3.6, phase: 0 } }),
        S(400, 400, 100, 18, { kind: 'fall', delay: 0.4 }),
        S(560, 0, 400, 120),
      ],
      hazards: [
        BEAM(540, 220, 26, { period: 5, on: 2.5, phase: 0 }),
        SAW(300, 300, 40, { axis: 'x', range: 120, period: 3, phase: 0 }),
      ],
      gravityZones: [{ x: 560, y: 0, w: 120, h: 540, dir: -1 }],
      controlZones: [{ x: 700, y: 0, w: 130, h: 540, reverse: true, warnPad: 55, label: 'MIRRORED' }],
      decor: [label(700, 300, 'DO NOT LOOK DOWN', GRAY, 12), button(430, 470, 150, 40, 'NO BUTTON', GRAY)],
    },
  },
]
