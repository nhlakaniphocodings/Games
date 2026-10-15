import type { SWLevel } from './types'

/**
 * Ten hand-built levels about a world that keeps taking itself away.
 * Every retraction, blink and collapse is deterministic and telegraphed, so
 * each death is a lesson rather than a dice roll. Taught one at a time, then
 * combined from level seven onward.
 */
export const shrinkingLevels: SWLevel[] = [
  // 1 — teach: a platform physically shrinks away under a countdown.
  {
    name: 'First Squeeze',
    hint: 'The gantry retracts. Cross before the far edge is gone.',
    start: { x: 60, y: 448 },
    exit: { x: 892, y: 404, w: 40, h: 76 },
    platforms: [
      { x: 0, y: 480, w: 280, h: 60, tag: 'metal' },
      {
        x: 340,
        y: 440,
        w: 520,
        h: 20,
        id: 'gantry',
        mode: 'shrink',
        tag: 'grate',
        morph: { auto: 0.7, warn: 1.4, time: 3.6, toW: 90, anchor: 'left' },
      },
      { x: 860, y: 480, w: 100, h: 60, tag: 'metal' },
    ],
  },

  // 2 — teach: floor plates drop once you pass their right edge.
  {
    name: 'Eviction Notice',
    hint: 'Every plate you leave behind drops away. No going back.',
    start: { x: 50, y: 448 },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    platforms: [
      { x: 0, y: 480, w: 220, h: 60, mode: 'fade' },
      { x: 220, y: 480, w: 180, h: 60, mode: 'fade' },
      { x: 400, y: 480, w: 160, h: 60, mode: 'fade' },
      { x: 660, y: 480, w: 180, h: 60, mode: 'fade' },
      { x: 840, y: 480, w: 120, h: 60, mode: 'fade' },
    ],
  },

  // 3 — teach: a global closing wall and its pressure indicator.
  {
    name: 'Closing Time',
    hint: 'The wall keeps coming. Keep right, jump the spikes.',
    start: { x: 40, y: 448 },
    exit: { x: 892, y: 404, w: 40, h: 76 },
    platforms: [{ x: 0, y: 480, w: 960, h: 60, tag: 'metal' }],
    hazards: [
      { x: 420, y: 452, w: 120, h: 28, kind: 'spike' },
      { x: 680, y: 452, w: 90, h: 28, kind: 'spike' },
    ],
    pressure: { kind: 'walls', edges: ['left'], delay: 1.4, time: 11, reach: { left: 850 } },
  },

  // 4 — teach: temporary platforms with a visible countdown.
  {
    name: 'Blink and Miss',
    hint: 'Those plates are only solid for a moment. Watch the bars.',
    start: { x: 50, y: 448 },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    platforms: [
      { x: 0, y: 480, w: 240, h: 60, tag: 'metal' },
      { x: 300, y: 440, w: 120, h: 18, id: 'b1', mode: 'blink', blink: { on: 2.4, off: 1.5, phase: 0 } },
      { x: 500, y: 440, w: 120, h: 18, id: 'b2', mode: 'blink', blink: { on: 2.2, off: 1.7, phase: 0.9 } },
      { x: 700, y: 440, w: 120, h: 18, id: 'b3', mode: 'blink', blink: { on: 2.6, off: 1.4, phase: 1.8 } },
      { x: 880, y: 480, w: 80, h: 60, tag: 'metal' },
    ],
    hazards: [{ x: 240, y: 500, w: 640, h: 40, kind: 'spike' }],
  },

  // 5 — teach: rising danger; climb a zig-zag tower before the basin fills.
  {
    name: 'Rise',
    hint: 'The basin is filling. Climb before it reaches you.',
    start: { x: 60, y: 448 },
    exit: { x: 320, y: 84, w: 40, h: 76 },
    platforms: [
      { x: 0, y: 480, w: 960, h: 60, tag: 'metal' },
      { x: 300, y: 400, w: 120, h: 18, tag: 'grate' },
      { x: 480, y: 340, w: 120, h: 18, tag: 'grate' },
      { x: 300, y: 280, w: 120, h: 18, tag: 'grate' },
      { x: 480, y: 220, w: 120, h: 18, tag: 'grate' },
      { x: 280, y: 160, w: 140, h: 18, tag: 'grate' },
    ],
    pressure: { kind: 'rise', delay: 2, speed: 20, from: 560, cap: 168 },
  },

  // 6 — teach: a gate that seals the way back, plus a step-armed lift.
  {
    name: 'Shutter',
    hint: 'The door shuts behind you. The lift drops the moment you touch it.',
    start: { x: 40, y: 448 },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    platforms: [
      { x: 0, y: 480, w: 460, h: 60, id: 'startFloor', mode: 'fade', tag: 'metal' },
      {
        x: 460,
        y: 480,
        w: 180,
        h: 18,
        id: 'lift',
        mode: 'retract',
        tag: 'grate',
        morph: { armOnStep: true, warn: 0.5, time: 0.9, axis: 'y', travel: 260, cycle: true, hold: 0.7 },
      },
      { x: 640, y: 480, w: 320, h: 60, tag: 'metal' },
      { x: 380, y: 300, w: 24, h: 180, id: 'g1', mode: 'gate', hidden: true, tag: 'panic' },
    ],
    hazards: [
      { x: 460, y: 500, w: 180, h: 40, kind: 'spike' },
      { x: 780, y: 452, w: 90, h: 28, kind: 'spike' },
    ],
    triggers: [
      { x: 520, y: 300, w: 60, h: 180, once: true, arm: ['g1'], shake: 0.5, sound: 'hit' },
    ],
  },

  // 7 — combine: shrinking bridge plus walls closing from both sides.
  {
    name: 'Compactor',
    hint: 'The jaws close from both sides. The bridge will not wait.',
    start: { x: 50, y: 448 },
    exit: { x: 880, y: 404, w: 40, h: 76 },
    platforms: [
      { x: 0, y: 480, w: 300, h: 60, tag: 'metal' },
      {
        x: 300,
        y: 440,
        w: 360,
        h: 18,
        id: 'bridge',
        mode: 'shrink',
        tag: 'grate',
        morph: { auto: 1, warn: 1.2, time: 4.5, toW: 100, anchor: 'left' },
      },
      { x: 660, y: 480, w: 300, h: 60, tag: 'metal' },
    ],
    hazards: [{ x: 300, y: 500, w: 360, h: 40, kind: 'spike' }],
    pressure: { kind: 'walls', edges: ['left', 'right'], delay: 1.2, time: 12, reach: { left: 120, right: 930 } },
  },

  // 8 — combine: vanishing line + moving saws you must read and time.
  {
    name: 'Assembly Line',
    hint: 'The line drops behind you and the saws never stop. Keep right.',
    start: { x: 40, y: 448 },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    platforms: [
      { x: 0, y: 480, w: 200, h: 60, mode: 'fade' },
      { x: 200, y: 480, w: 200, h: 60, mode: 'fade' },
      { x: 400, y: 480, w: 200, h: 60, mode: 'fade' },
      { x: 600, y: 480, w: 200, h: 60, mode: 'fade' },
      { x: 800, y: 480, w: 160, h: 60, mode: 'fade' },
    ],
    hazards: [
      { x: 220, y: 448, w: 32, h: 32, kind: 'saw', move: { dx: 120, dy: 0, period: 1.8, phase: 0 } },
      { x: 420, y: 448, w: 32, h: 32, kind: 'saw', move: { dx: 140, dy: 0, period: 1.8, phase: 0.9 } },
      { x: 700, y: 360, w: 32, h: 32, kind: 'saw', move: { dx: 0, dy: 90, period: 1.4, phase: 0.3 } },
    ],
  },

  // 9 — combine: shrinking route plus a deceptive exit and a hidden real door.
  {
    name: 'Bait',
    hint: 'The glowing door is a lie. Flip the switch, then take the quiet exit.',
    start: { x: 40, y: 448 },
    exit: { x: 880, y: 404, w: 40, h: 76 },
    exitHidden: true,
    platforms: [
      { x: 0, y: 480, w: 340, h: 60, tag: 'metal' },
      {
        x: 420,
        y: 430,
        w: 140,
        h: 18,
        id: 'sp',
        mode: 'shrink',
        tag: 'grate',
        morph: { auto: 0.6, warn: 1, time: 3.5, toW: 60, anchor: 'right' },
      },
      { x: 640, y: 480, w: 320, h: 60, tag: 'metal' },
      { x: 660, y: 400, w: 120, h: 18, tag: 'panic' },
    ],
    hazards: [{ x: 340, y: 500, w: 300, h: 40, kind: 'spike' }],
    decoys: [{ x: 700, y: 324, w: 40, h: 76 }],
    triggers: [
      { x: 820, y: 300, w: 60, h: 180, once: true, revealExit: true, sound: 'unlock', shake: 0.4 },
    ],
  },

  // 10 — finale: committed floors, blinking route, gate, crusher, hidden exit.
  {
    name: 'Containment Breach',
    hint: 'Everything is closing. Time the plates, outrun the jaws, find the exit.',
    start: { x: 40, y: 448 },
    exit: { x: 880, y: 404, w: 40, h: 76 },
    exitHidden: true,
    platforms: [
      { x: 0, y: 480, w: 280, h: 60, mode: 'fade', tag: 'metal' },
      { x: 360, y: 440, w: 110, h: 18, id: 'c1', mode: 'blink', blink: { on: 2.2, off: 1.4, phase: 0 } },
      { x: 540, y: 400, w: 110, h: 18, id: 'c2', mode: 'blink', blink: { on: 2, off: 1.6, phase: 0.8 } },
      { x: 720, y: 440, w: 110, h: 18, id: 'c3', mode: 'blink', blink: { on: 2.4, off: 1.3, phase: 1.7 } },
      { x: 860, y: 480, w: 100, h: 60, tag: 'metal' },
      { x: 280, y: 300, w: 24, h: 180, id: 'g1', mode: 'gate', hidden: true, tag: 'panic' },
    ],
    hazards: [
      { x: 280, y: 520, w: 580, h: 40, kind: 'spike' },
      { x: 600, y: 200, w: 44, h: 44, kind: 'crusher', move: { dx: 0, dy: 150, period: 1.6, phase: 0 } },
    ],
    triggers: [
      { x: 360, y: 300, w: 60, h: 180, once: true, arm: ['g1'], shake: 0.5, sound: 'hit' },
      { x: 800, y: 280, w: 60, h: 200, once: true, revealExit: true, sound: 'unlock', shake: 0.4 },
    ],
    pressure: { kind: 'walls', edges: ['left', 'right'], delay: 1.5, time: 16, reach: { left: 120, right: 930 } },
  },
]
