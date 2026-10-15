import type { Dir, GFHazard, GFLevel, GFSolid } from './types'
import { START_Y } from './types'

const s = (x: number, y: number, w: number, h: number, extra: Partial<GFSolid> = {}): GFSolid => ({ x, y, w, h, ...extra })
const h = (x: number, y: number, w: number, hh: number, extra: Partial<GFHazard> = {}): GFHazard => ({ x, y, w, h: hh, ...extra })

/** Floor slab (safe to stand on from above). */
const F = (x: number, w: number): GFSolid => s(x, 480, w, 60)
/** Ceiling slab (safe to stand under). */
const C = (x: number, w: number): GFSolid => s(x, 0, w, 60)
/** Spike field growing up from the floor. */
const SF = (x: number, w: number): GFHazard => h(x, 456, w, 24, { kind: 'spike', face: 'floor' })
/** Spike field hanging down from the ceiling. */
const SC = (x: number, w: number): GFHazard => h(x, 60, w, 24, { kind: 'spike', face: 'ceiling' })
/** Spike field resting at the bottom of a pit. */
const SP = (x: number, w: number): GFHazard => h(x, 516, w, 24, { kind: 'spike', face: 'floor' })
/** A barrier that slides toward a lane based on the player's gravity. */
const BAR = (x: number, yDown: number, yUp: number, speed: number): GFHazard =>
  h(x, yDown, 28, 150, { kind: 'barrier', track: { yDown, yUp, speed } })

const exitF = (x: number) => ({ x, y: 404, w: 40, h: 76, needs: 1 as Dir })
const exitC = (x: number) => ({ x, y: 60, w: 40, h: 76, needs: -1 as Dir })

/**
 * Ten hand-built gravity puzzles, tuned brutal.
 *
 * The whole game is two lanes — the floor and the ceiling. You never jump, you
 * only flip. A floor spike field forces you to the ceiling; a ceiling spike
 * field forces you to the floor; a pit forces the ceiling; a hole in the ceiling
 * forces the floor. Because a flip carries you ~180px sideways, every field has
 * a timing window, not just a position. Nothing is random: every trap here is a
 * fixed schedule you can learn and beat on the next attempt.
 */
export const gravityFlipLevels: GFLevel[] = [
  // 1 -----------------------------------------------------------------------
  {
    name: 'Cold Open',
    hint: 'Floor and ceiling both bite. Flip before the spikes — and flip back before the next field.',
    start: { x: 40, y: START_Y },
    exit: exitF(896),
    solids: [F(0, 960), C(0, 960)],
    hazards: [SF(200, 100), SC(420, 120), SF(620, 100), SC(800, 120)],
  },

  // 2 -----------------------------------------------------------------------
  {
    name: 'Both Sides',
    hint: 'Ceiling spikes mean floor. Floor spikes mean ceiling. The sweeper means hurry.',
    start: { x: 40, y: START_Y },
    exit: exitC(896),
    solids: [F(0, 960), C(0, 960)],
    hazards: [SC(200, 140), SF(430, 140), BAR(700, 340, 60, 190)],
  },

  // 3 -----------------------------------------------------------------------
  {
    name: 'Reversal',
    hint: 'The low band drags you up. Drop past it, or it will fling you into the ceiling teeth.',
    start: { x: 40, y: START_Y },
    exit: exitF(896),
    solids: [F(0, 960), C(0, 960)],
    hazards: [SF(180, 120), SC(500, 130), SF(720, 120)],
    zones: [{ x: 400, y: 300, w: 70, h: 240, dir: -1 }],
  },

  // 4 -----------------------------------------------------------------------
  {
    name: 'Brittle',
    hint: 'The cracked slab survives exactly one flip. Never be standing on it when you take it.',
    start: { x: 40, y: START_Y },
    exit: exitF(896),
    solids: [F(0, 260), s(260, 480, 340, 60, { spikeAfterFlips: 1, id: 'b4' }), F(600, 360), C(0, 960)],
    hazards: [SF(720, 120)],
    decoys: [{ x: 380, y: 60, w: 40, h: 76 }],
  },

  // 5 -----------------------------------------------------------------------
  {
    name: 'Pivot Junction',
    hint: 'The pads flip you without asking. Cross them in the air, or land in the teeth.',
    start: { x: 40, y: START_Y },
    exit: exitC(896),
    solids: [F(0, 960), C(0, 960)],
    hazards: [SC(170, 120), SF(400, 140), SC(660, 120), SF(840, 120)],
    switches: [
      { x: 300, y: 464, w: 40, h: 16, face: 'floor' },
      { x: 560, y: 60, w: 40, h: 16, face: 'ceiling' },
    ],
  },

  // 6 -----------------------------------------------------------------------
  {
    name: 'Auto-Flip',
    hint: 'The pads are not helpers. Every one of them is aimed at a spike field.',
    start: { x: 40, y: START_Y },
    exit: exitF(896),
    solids: [F(0, 300), s(300, 480, 360, 60, { spikeAfterFlips: 1, id: 'b6' }), F(660, 300), C(0, 960)],
    hazards: [SC(160, 120), SF(420, 120), SC(700, 120), SF(840, 120)],
    switches: [
      { x: 240, y: 464, w: 40, h: 16, face: 'floor' },
      { x: 560, y: 60, w: 40, h: 16, face: 'ceiling' },
    ],
    decoys: [{ x: 780, y: 60, w: 40, h: 76 }],
  },

  // 7 -----------------------------------------------------------------------
  {
    name: 'Mirage',
    hint: 'The middle stretch of ceiling is a grinder. Thread the spikes without touching it.',
    start: { x: 40, y: START_Y },
    exit: exitC(896),
    solids: [F(0, 960), C(0, 300), s(300, 0, 360, 60, { kind: 'fake' }), C(660, 300)],
    hazards: [SF(360, 200), SC(820, 120)],
  },

  // 8 -----------------------------------------------------------------------
  {
    name: 'Sweeper',
    hint: 'Two sweepers, opposite patience. Commit to a lane and pass before it turns.',
    start: { x: 40, y: START_Y },
    exit: exitC(896),
    solids: [F(0, 960), C(0, 960)],
    hazards: [BAR(300, 340, 60, 250), SF(500, 140), BAR(720, 340, 60, 250), SC(860, 100)],
  },

  // 9 -----------------------------------------------------------------------
  {
    name: 'Metronome',
    hint: 'The blade appears only after you flip. Count your flips like a heartbeat.',
    start: { x: 40, y: START_Y },
    exit: exitC(896),
    solids: [F(0, 960), C(0, 960)],
    hazards: [
      SF(200, 120),
      h(430, 456, 60, 24, { kind: 'spike', face: 'floor', move: { dx: 150, dy: 0, period: 2.2 } }),
      h(620, 60, 60, 24, { kind: 'spike', face: 'ceiling', move: { dx: 150, dy: 0, period: 2.2, phase: 0.5 } }),
      h(820, 60, 100, 24, { kind: 'spike', face: 'ceiling', activeAfterFlips: 3 }),
    ],
    decoys: [{ x: 900, y: 60, w: 40, h: 76 }],
  },

  // 10 ----------------------------------------------------------------------
  {
    name: 'Total Eclipse',
    hint: 'Everything the void taught you, stacked into one fall. The exit is mounted on the floor.',
    start: { x: 40, y: START_Y },
    exit: exitF(896),
    solids: [
      F(0, 320),
      F(620, 340),
      s(320, 480, 300, 60, { spikeAfterFlips: 1, id: 'b10' }),
      C(0, 360),
      s(360, 0, 300, 60, { kind: 'fake' }),
      C(660, 300),
    ],
    hazards: [
      SF(380, 160),
      BAR(540, 340, 60, 240),
      SC(700, 120),
      SF(820, 120),
    ],
    switches: [{ x: 260, y: 464, w: 40, h: 16, face: 'floor' }],
    zones: [{ x: 660, y: 60, w: 50, h: 340, dir: 1 }],
    decoys: [
      { x: 500, y: 60, w: 40, h: 76 },
      { x: 900, y: 60, w: 40, h: 76 },
    ],
  },
]
