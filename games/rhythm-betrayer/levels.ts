import type { RBHazard, RBLevel, RBMove, RBSolid, RBSweep, RBWindow } from './types'

const GROUND = 480
const START_Y = GROUND - 32

const S = (x: number, y: number, w: number, h: number, extra: Partial<RBSolid> = {}): RBSolid => ({ x, y, w, h, ...extra })
const H = (x: number, y: number, w: number, h: number, extra: Partial<RBHazard> = {}): RBHazard => ({ x, y, w, h, ...extra })
const G = (x: number, w: number): RBSolid => S(x, GROUND, w, 60)
const W = (period: number, on: number, phase = 0): RBWindow => ({ period, on, phase })
const M = (dx: number, dy: number, period: number, phase = 0, mode: 'sine' | 'pulse' = 'sine'): RBMove => ({ dx, dy, period, phase, mode })
const SW = (axis: 'x' | 'y', range: number, period: number, phase = 0): RBSweep => ({ axis, range, period, phase })

/** A vertical blade: lethal only while its window is on. */
const BLADE = (x: number, period: number, on: number, phase: number, extra: Partial<RBHazard> = {}): RBHazard =>
  H(x, 300, 24, 180, { window: W(period, on, phase), ...extra })
/** A vertical gate: a solid wall only while its window is on (you wait it out). */
const GATE = (x: number, period: number, on: number, phase = 0): RBSolid =>
  S(x, 300, 24, 180, { window: W(period, on, phase) })
/** Floor teeth you must jump. */
const TEETH = (x: number, w: number, extra: Partial<RBHazard> = {}): RBHazard => H(x, 458, w, 22, extra)
/** A boundary trip: arms on `line`, blade 120px ahead fires `delay` beats later. */
const TRIP = (x: number, line: number, extra: Partial<RBHazard> = {}): RBHazard =>
  H(x, 300, 24, 180, { trip: { at: line, delay: 0.5, on: 1.4 }, ...extra })

/**
 * Ten hand-designed rhythm levels. Every hazard is deterministic and every
 * timing window is learnable from the beat rail. Level 1 already demands a
 * jump within ~3 seconds and two beats of sequencing; holding right never wins.
 *
 * Trap vocabulary:
 *  - GATE / BLADE  : a wall and a blade held out of phase — don't rush through
 *  - TRIP          : arms on the drawn sensor line, then fires a beat later
 *  - unstable      : a ledge that drops `warn` beats after you land on it
 *  - exitWindow    : the door only opens on part of the beat
 */
export const rbLevels: RBLevel[] = [
  // 1 — jump the teeth, wait out the gate but don't rush the blade, then pause at the sensor.
  {
    name: 'First Contact',
    hint: 'Jump the teeth. Do NOT cross a blade the instant its gate opens.',
    start: { x: 60, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    bpm: 120,
    solids: [G(0, 960), GATE(430, 1, 0.5, 0)],
    hazards: [
      TEETH(250, 70, { deathMsg: 'The floor bites on your first step.' }),
      BLADE(640, 1, 0.5, 0.5, { deathMsg: 'You crossed the second blade the moment its gate opened.' }),
      TRIP(860, 740, { deathMsg: 'The sensor armed a blade the moment you reached it.' }),
    ],
  },

  // 2 — blink platforms over a pit with a blade inside the gap.
  {
    name: 'Metronome Steps',
    hint: 'The steps blink out. Cross each one while it is lit.',
    start: { x: 60, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    bpm: 132,
    solids: [
      G(0, 170),
      S(230, 430, 110, 18, { window: W(4, 3, 0) }),
      S(400, 430, 110, 18, { window: W(4, 3, 1) }),
      G(560, 400),
      GATE(770, 1, 0.5, 0),
    ],
    hazards: [
      H(170, 500, 390, 40, { deathMsg: 'The pit keeps no time at all.' }),
      BLADE(360, 2, 0.5, 0, { deathMsg: 'The blade between the steps.' }),
      TEETH(650, 70, { deathMsg: 'Teeth before the door.' }),
    ],
  },

  // 3 — a ground sprint: teeth, an out-of-phase gate, a lying blade and a floor crusher.
  {
    name: 'Off the Rails',
    hint: 'A dashed ≠ blade lies about its beat. Read the shape, not the glow.',
    start: { x: 60, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    bpm: 140,
    solids: [G(0, 960), GATE(430, 1, 0.5, 0)],
    hazards: [
      TEETH(210, 80),
      H(520, 190, 50, 60, { move: M(0, 200, 2, 0, 'pulse'), deathMsg: 'The crusher kept perfect time.' }),
      BLADE(640, 1, 0.5, 0.5, { fake: true, deathMsg: 'That blade bites on the off-beat.' }),
      TEETH(760, 70, { deathMsg: 'Teeth after the wall.' }),
    ],
  },

  // 4 — windowed door, a slow blade, and a sensor-trip guarding the approach.
  {
    name: 'Doors of Time',
    hint: 'The door opens for two beats in every four. Blades do not wait for you.',
    start: { x: 60, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    bpm: 144,
    solids: [G(0, 960)],
    hazards: [
      TEETH(280, 150),
      BLADE(560, 2, 1, 0),
      TRIP(820, 700, { deathMsg: 'The blade armed when you crossed the line.' }),
    ],
    exitWindow: W(4, 2, 0),
  },

  // 5 — first announced tempo change, a crusher over a blink bridge, a gate, teeth.
  {
    name: 'Tempo Shift',
    hint: 'A warning flashes before the tempo jumps. Do not be mid-step when it lands.',
    start: { x: 60, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    bpm: 150,
    tempo: [{ at: 16, bpm: 200 }],
    solids: [
      G(0, 220),
      S(280, 430, 110, 18, { window: W(4, 3, 0) }),
      S(450, 430, 110, 18, { window: W(4, 3, 2) }),
      G(620, 340),
      GATE(840, 1, 0.5, 0),
    ],
    hazards: [
      H(220, 500, 400, 40, { deathMsg: 'The pit keeps no time.' }),
      H(520, 200, 60, 70, { move: M(0, 210, 2, 0, 'pulse'), deathMsg: 'The crusher does not care about the tempo.' }),
      TEETH(660, 70, { deathMsg: 'Teeth between the bridge and the door.' }),
    ],
  },

  // 6 — a corridor of out-of-phase gates and blades with two liars woven in.
  {
    name: "The Liar's Beat",
    hint: 'Gates alternate. Two blades lie about which half of the beat is safe.',
    start: { x: 60, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    bpm: 156,
    solids: [G(0, 960), GATE(320, 1, 0.5, 0), GATE(660, 1, 0.5, 0)],
    hazards: [
      TEETH(190, 80),
      BLADE(480, 1, 0.5, 0.5, { fake: true, deathMsg: 'It lied about which half was safe.' }),
      BLADE(550, 1, 0.5, 0.5),
      BLADE(790, 1, 0.5, 0.5, { fake: true, deathMsg: 'This one rotates against the rail.' }),
      TRIP(860, 740, { deathMsg: 'The line you crossed armed a blade.' }),
    ],
  },

  // 7 — beat-locked ferries over a pit, tempo rises mid-level.
  {
    name: 'Crescendo',
    hint: 'Ride the ferries. They speed up when the music does.',
    start: { x: 60, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    bpm: 150,
    tempo: [{ at: 20, bpm: 190 }],
    solids: [
      G(0, 220),
      S(300, 430, 110, 18, { move: M(0, 50, 3, 0) }),
      S(470, 420, 100, 20),
      S(680, 430, 110, 18, { move: M(110, 0, 3, 0) }),
      G(850, 110),
    ],
    hazards: [
      H(220, 500, 630, 40, { deathMsg: 'The pit below keeps no time.' }),
      BLADE(600, 1, 0.5, 0.5, { deathMsg: 'The blade on the far side of the ferry.' }),
    ],
  },

  // 8 — three-count gates against a four-count rail, a floor saw, then a trip line.
  {
    name: 'Syncopation',
    hint: 'These gates count in threes, not fours. Then a line arms a blade.',
    start: { x: 60, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    bpm: 160,
    solids: [G(0, 960)],
    hazards: [
      H(180, 452, 44, 28, { kind: 'saw', sweep: SW('x', 170, 3, 0), deathMsg: 'The floor saw rolled into your jump.' }),
      BLADE(430, 3, 1, 0),
      BLADE(560, 3, 1, 1),
      BLADE(700, 3, 1, 2, { fake: true, deathMsg: 'This one rotates against the others.' }),
      TRIP(860, 740, { deathMsg: 'The line you crossed armed a blade.' }),
    ],
  },

  // 9 — blink bridge, three tempo shifts, a crusher, then a lying trip line.
  {
    name: 'Broken Metronome',
    hint: 'Two tempo shifts, each announced. The crusher ignores both of them.',
    start: { x: 60, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    bpm: 168,
    tempo: [
      { at: 12, bpm: 128 },
      { at: 28, bpm: 200 },
    ],
    solids: [
      G(0, 220),
      S(270, 430, 110, 18, { window: W(4, 3, 0) }),
      S(440, 430, 110, 18, { window: W(4, 3, 1) }),
      S(610, 430, 110, 18, { window: W(4, 3, 2) }),
      G(760, 200),
    ],
    hazards: [
      H(220, 500, 540, 40, { deathMsg: 'The pit swallows the miscount.' }),
      H(330, 170, 64, 70, { move: M(0, 210, 2, 0, 'pulse'), deathMsg: 'The crusher does not care about the tempo.' }),
      TRIP(870, 750, { fake: true, deathMsg: 'The last line was lying too.' }),
    ],
  },

  // 10 — everything: unstable ledge, ferry, liar, teeth, tempo shift, fake exit, windowed door.
  {
    name: 'Betrayal',
    hint: 'Trust the rail, not the glow. The door you can see is not the door.',
    start: { x: 60, y: START_Y },
    exit: { x: 900, y: 404, w: 40, h: 76 },
    bpm: 160,
    tempo: [{ at: 24, bpm: 200 }],
    solids: [
      G(0, 200),
      S(260, 430, 110, 18, { unstable: { warn: 1.6 } }),
      S(430, 430, 100, 20, { move: M(90, 0, 3, 0) }),
      G(620, 340),
      GATE(650, 1, 0.5, 0),
    ],
    hazards: [
      H(200, 500, 420, 40, { deathMsg: 'The pit waits beneath the broken floor.' }),
      BLADE(570, 1, 0.5, 0.5, { fake: true, deathMsg: 'The liar gets the last word.' }),
      TEETH(730, 70, { deathMsg: 'Teeth before the doors.' }),
    ],
    decoy: { x: 860, y: 404, w: 34, h: 76 },
    exitWindow: W(4, 2, 0),
  },
]
