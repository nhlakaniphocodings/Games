import type { XDHazard, XDLevel, XDSolid, XDTrigger } from './types'

const S = (x: number, y: number, w: number, h: number, extra: Partial<XDSolid> = {}): XDSolid => ({ x, y, w, h, ...extra })
const H = (x: number, y: number, w: number, h: number, extra: Partial<XDHazard> = {}): XDHazard => ({ x, y, w, h, ...extra })
const T = (x: number, y: number, w: number, h: number, extra: Partial<XDTrigger> = {}): XDTrigger => ({ x, y, w, h, ...extra })

const GROUND = 480
const START_Y = GROUND - 32

/**
 * Ten hand-built levels of layered, learnable deception.
 *
 * Design rules (V2 — extreme):
 *  - Level 1 is already lethal. Holding right walks into a trapdoor within the
 *    first half-second; the obvious jump is punished; a "safe" landing collapses
 *    under you; and the floor in front of the door disappears on approach.
 *  - Every trap is deterministic so deaths are learnable, never random.
 *  - Every level has at least one valid winning route (see xtest/solve.mjs and
 *    the design notes in each level).
 *
 * Movement reference (see lib/game/platformer.ts): max jump height ≈ 123px,
 * max running-jump distance ≈ 205px. Keep required gaps < 190px and rises
 * < 110px so a skilled player can always make them.
 */
export const xDevilLevels: XDLevel[] = [
  // ---------------------------------------------------------------------------
  // 1 — the trapdoor, the punished jump, the false safe landing, the exit lie
  // ---------------------------------------------------------------------------
  {
    name: 'Nothing Personal',
    hint: 'The floor is fine. Walk forward. Trust me.',
    start: { x: 40, y: START_Y },
    exit: { x: 900, y: 404, w: 44, h: 76 },
    solids: [
      S(0, GROUND, 220, 60), // starting ledge — the trap fires just as you commit
      S(220, GROUND, 160, 60, { id: 't1', kind: 'vanish' }), // trapdoor
      S(380, GROUND, 120, 60, { id: 't2', kind: 'fall', delay: 0.5 }), // "safe" landing that gives way
      S(540, 400, 100, 20), // raised stone
      S(740, 400, 100, 20), // far ledge (saw patrols the gap)
      S(840, GROUND, 60, 60), // last honest ground
      S(900, GROUND, 60, 60, { id: 't3', kind: 'vanish' }), // floor in front of the door
    ],
    hazards: [
      H(220, 500, 160, 40, { id: 'sp1', hidden: true, kind: 'spike' }),
      H(900, 500, 60, 40, { id: 'sp3', hidden: true, kind: 'spike' }),
      H(660, 318, 40, 40, { kind: 'saw', move: { dx: 40, dy: 0, period: 1.6 } }), // sweeps the mid gap
    ],
    triggers: [
      T(110, 400, 22, 80, { once: true, hide: ['t1'], show: ['sp1'], shake: 0.5 }),
      T(846, 400, 16, 80, { once: true, hide: ['t3'], show: ['sp3'], shake: 0.6 }),
    ],
  },

  // ---------------------------------------------------------------------------
  // 2 — collapsing chain over a spike bed + a ceiling that punishes big jumps
  // ---------------------------------------------------------------------------
  {
    name: 'Disappearing Act',
    hint: 'Some floors have commitment issues. So does the ceiling.',
    start: { x: 40, y: START_Y },
    exit: { x: 900, y: 404, w: 44, h: 76 },
    solids: [
      S(0, GROUND, 150, 60),
      S(220, 440, 90, 20, { kind: 'fall', delay: 0.28 }),
      S(370, 405, 90, 20, { kind: 'fall', delay: 0.28 }),
      S(520, 440, 90, 20, { kind: 'fall', delay: 0.28 }),
      S(670, 405, 90, 20, { kind: 'fall', delay: 0.28 }),
      S(840, GROUND, 120, 60),
    ],
    hazards: [
      H(150, 500, 690, 40, { kind: 'spike' }), // spike bed under the whole pit
      H(300, 292, 320, 30, { id: 'c2', hidden: true, kind: 'spike' }), // ceiling teeth, revealed on the first leap
    ],
    triggers: [
      T(150, 392, 30, 52, { once: true, show: ['c2'], shake: 0.35 }),
    ],
  },

  // ---------------------------------------------------------------------------
  // 3 — fake platforms; the real route is hidden until you jump to reveal it
  // ---------------------------------------------------------------------------
  {
    name: 'Trust Issues',
    hint: 'The short way is a lie. The long way hurts.',
    start: { x: 40, y: START_Y },
    exit: { x: 900, y: 404, w: 44, h: 76 },
    solids: [
      S(0, GROUND, 170, 60),
      S(250, 430, 70, 20, { kind: 'fake' }), // tempting, hollow
      S(320, 400, 80, 20), // the honest step, further and higher
      S(460, 370, 80, 20),
      S(600, 400, 80, 20),
      S(740, 430, 80, 20, { kind: 'fall', delay: 0.3 }),
      S(850, GROUND, 110, 60),
    ],
    hazards: [
      H(170, 500, 680, 40, { kind: 'spike' }),
      H(480, 250, 240, 30, { kind: 'spike' }), // low ceiling over the high path — time the jumps
    ],
  },

  // ---------------------------------------------------------------------------
  // 4 — trapdoor + moving saw + a ceiling triggered by crossing a line
  // ---------------------------------------------------------------------------
  {
    name: 'The Grey Zone',
    hint: 'Mind the moving parts. And the stationary ones.',
    start: { x: 40, y: START_Y },
    exit: { x: 892, y: 404, w: 44, h: 76 },
    solids: [
      S(0, GROUND, 220, 60),
      S(380, 430, 80, 20, { kind: 'fall', delay: 0.28 }),
      S(520, 400, 80, 20, { kind: 'fall', delay: 0.28 }),
      S(660, 430, 80, 20, { kind: 'fall', delay: 0.28 }),
      S(800, GROUND, 160, 60, { id: 'g4', kind: 'vanish' }),
    ],
    hazards: [
      H(220, 500, 580, 40, { kind: 'spike' }),
      H(240, 250, 420, 30, { id: 'c4', hidden: true, kind: 'spike' }),
      H(400, 320, 40, 40, { kind: 'saw', move: { dx: 0, dy: 90, period: 1.5 } }),
      H(700, 500, 100, 40, { id: 's4', hidden: true, kind: 'spike' }),
    ],
    triggers: [
      T(210, 396, 26, 56, { once: true, show: ['c4'], shake: 0.35 }),
      T(740, 400, 26, 80, { once: true, hide: ['g4'], show: ['s4'], shake: 0.55 }),
    ],
  },

  // ---------------------------------------------------------------------------
  // 5 — the door relocates, then leaves a decoy behind
  // ---------------------------------------------------------------------------
  {
    name: 'The Door Moves',
    hint: 'The door is right there. Obviously. Reach it before it rethinks.',
    start: { x: 40, y: START_Y },
    exit: { x: 860, y: 404, w: 44, h: 76 },
    solids: [
      S(0, GROUND, 200, 60),
      S(280, 440, 80, 20, { kind: 'fall', delay: 0.26 }),
      S(420, 410, 80, 20, { kind: 'fall', delay: 0.26 }),
      S(560, 440, 80, 20),
      S(700, GROUND, 260, 60),
    ],
    hazards: [
      H(200, 500, 500, 40, { kind: 'spike' }),
      H(330, 300, 40, 40, { kind: 'saw', move: { dx: 300, dy: 0, period: 2.2 } }),
      H(860, 500, 60, 40, { id: 's5', hidden: true, kind: 'spike' }),
      H(520, 500, 80, 40, { id: 's5b', hidden: true, kind: 'spike' }),
    ],
    triggers: [
      T(748, 336, 60, 164, { once: true, moveExit: { dx: -360, dy: 0 }, show: ['d5', 's5'], shake: 0.65 }),
      T(470, 336, 50, 140, { once: true, show: ['s5b'] }),
    ],
    decoys: [{ id: 'd5', x: 860, y: 404, w: 44, h: 76, hidden: true }],
  },

  // ---------------------------------------------------------------------------
  // 6 — vertical saws, delayed collapses, one honest route
  // ---------------------------------------------------------------------------
  {
    name: 'Sharp Descent',
    hint: 'Both saws are timed. The floors are not on your side.',
    start: { x: 40, y: START_Y },
    exit: { x: 896, y: 404, w: 44, h: 76 },
    solids: [
      S(0, GROUND, 190, 60),
      S(280, 430, 90, 20, { kind: 'fall', delay: 0.3 }),
      S(430, 390, 90, 20, { kind: 'fall', delay: 0.3 }),
      S(580, 430, 90, 20, { kind: 'fall', delay: 0.3 }),
      S(730, 390, 80, 20),
      S(840, GROUND, 120, 60),
    ],
    hazards: [
      H(190, 500, 650, 40, { kind: 'spike' }),
      H(360, 250, 40, 40, { kind: 'saw', move: { dx: 0, dy: 150, period: 1.7 } }),
      H(660, 250, 40, 40, { kind: 'saw', move: { dx: 0, dy: 150, period: 1.7, phase: 0.5 } }),
      H(560, 440, 90, 20, { id: 's6', hidden: true, kind: 'spike' }),
    ],
    triggers: [T(520, 300, 40, 160, { once: true, show: ['s6'], shake: 0.4 })],
  },

  // ---------------------------------------------------------------------------
  // 7 — the floor vanishes *behind* you, and a saw sweeps in from the right
  // ---------------------------------------------------------------------------
  {
    name: 'Behind You',
    hint: 'Do not look back. Actually, do - it is already gone.',
    start: { x: 40, y: START_Y },
    exit: { x: 896, y: 404, w: 44, h: 76 },
    solids: [
      S(0, GROUND, 340, 60),
      S(340, GROUND, 140, 60, { id: 'b7', kind: 'vanish' }),
      S(480, 420, 70, 20), // reachable stepping stone across the vanished floor
      S(500, 340, 110, 20, { id: 'r7', hidden: true }),
      S(680, 380, 100, 20),
      S(830, GROUND, 130, 60, { id: 'g7', kind: 'fall', delay: 0.32 }),
    ],
    hazards: [
      H(340, 500, 140, 40, { id: 's7', hidden: true, kind: 'spike' }),
      H(0, 430, 44, 34, { id: 'ch7', hidden: true, kind: 'spike', chase: { speed: 118, min: -20, max: 560 } }),
      H(200, 440, 40, 40, { kind: 'saw', move: { dx: 520, dy: 0, period: 2.4 } }),
      H(720, 300, 40, 40, { kind: 'saw', move: { dx: 120, dy: 0, period: 1.6, phase: 0.2 } }),
    ],
    triggers: [
      T(120, 360, 26, 120, { once: true, show: ['ch7'], shake: 0.35 }),
      T(300, 360, 30, 120, { once: true, hide: ['b7'], show: ['s7', 'r7'], shake: 0.55 }),
    ],
  },

  // ---------------------------------------------------------------------------
  // 8 — two fakes, a double trap (jump → ceiling, land → collapse)
  // ---------------------------------------------------------------------------
  {
    name: 'Two Lies',
    hint: 'Neither platform is helping you. The ceiling is not either.',
    start: { x: 40, y: START_Y },
    exit: { x: 892, y: 404, w: 44, h: 76 },
    solids: [
      S(0, GROUND, 180, 60),
      S(280, 420, 80, 20),
      S(400, 380, 80, 20, { kind: 'fake' }),
      S(530, 380, 90, 20),
      S(680, 410, 80, 20, { kind: 'fall', delay: 0.26 }),
      S(830, GROUND, 130, 60),
    ],
    hazards: [
      H(180, 500, 650, 40, { kind: 'spike' }),
      H(300, 250, 380, 28, { id: 'c8', hidden: true, kind: 'spike' }),
      H(760, 500, 70, 40, { id: 's8', hidden: true, kind: 'spike' }),
    ],
    triggers: [
      T(230, 392, 26, 56, { once: true, show: ['c8'], shake: 0.4 }),
      T(790, 340, 26, 120, { once: true, show: ['s8'], shake: 0.5 }),
    ],
  },

  // ---------------------------------------------------------------------------
  // 9 — the gauntlet: collapse, saw, hidden spikes, vanishing exit floor
  // ---------------------------------------------------------------------------
  {
    name: 'The Gauntlet',
    hint: 'Everything you have learned, in order, without mercy.',
    start: { x: 40, y: START_Y },
    exit: { x: 896, y: 404, w: 44, h: 76 },
    solids: [
      S(0, GROUND, 170, 60),
      S(250, 430, 80, 20, { kind: 'fall', delay: 0.26 }),
      S(390, 400, 80, 20, { kind: 'fall', delay: 0.26 }),
      S(530, 430, 80, 20, { kind: 'fall', delay: 0.26 }),
      S(670, 400, 80, 20, { kind: 'fall', delay: 0.26 }),
      S(810, GROUND, 54, 60),
      S(864, GROUND, 96, 60, { id: 'g9', kind: 'vanish' }),
    ],
    hazards: [
      H(170, 500, 640, 40, { kind: 'spike' }),
      H(300, 240, 40, 40, { kind: 'saw', move: { dx: 460, dy: 0, period: 2.6 } }),
      H(864, 500, 96, 40, { id: 's9', hidden: true, kind: 'spike' }),
      H(240, 320, 380, 30, { id: 'c9', hidden: true, kind: 'spike' }),
    ],
    triggers: [
      T(200, 392, 26, 56, { once: true, show: ['c9'], shake: 0.4 }),
      T(790, 340, 26, 140, { once: true, hide: ['g9'], show: ['s9'], shake: 0.6 }),
    ],
  },

  // ---------------------------------------------------------------------------
  // 10 — finale: moving door, decoy, chained collapses, ceiling, exit lie
  // ---------------------------------------------------------------------------
  {
    name: "Devil's Due",
    hint: 'It is all here. The door is a rumor. Good luck.',
    start: { x: 40, y: START_Y },
    exit: { x: 880, y: 404, w: 44, h: 76 },
    solids: [
      S(0, GROUND, 160, 60),
      S(240, 430, 80, 20, { kind: 'fall', delay: 0.24 }),
      S(370, 400, 80, 20, { kind: 'fall', delay: 0.24 }),
      S(500, 430, 80, 20, { kind: 'fall', delay: 0.24 }),
      S(610, 430, 70, 20),
      S(740, 400, 70, 20, { kind: 'fall', delay: 0.26 }),
      S(850, GROUND, 110, 60, { id: 'g10', kind: 'vanish' }),
    ],
    hazards: [
      H(160, 500, 690, 40, { kind: 'spike' }),
      H(300, 230, 40, 40, { kind: 'saw', move: { dx: 0, dy: 170, period: 1.9, phase: 0.1 } }),
      H(560, 230, 40, 40, { kind: 'saw', move: { dx: 0, dy: 170, period: 1.9, phase: 0.6 } }),
      H(240, 310, 400, 28, { id: 'c10', hidden: true, kind: 'spike' }),
      H(850, 500, 110, 40, { id: 's10', hidden: true, kind: 'spike' }),
    ],
    triggers: [
      T(200, 392, 26, 56, { once: true, show: ['c10'], shake: 0.4 }),
      T(770, 336, 50, 160, { once: true, moveExit: { dx: -60, dy: 0 }, show: ['d10', 's10'], shake: 0.5 }),
    ],
    decoys: [{ id: 'd10', x: 880, y: 404, w: 44, h: 76, hidden: true }],
  },
]
