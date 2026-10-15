import type { LArrow, LButton, LDoor, LHazard, LLabel, LLevel, LSolid, LTrigger } from './types'

const GROUND = 480
const START_Y = GROUND - 32

const S = (x: number, y: number, w: number, h: number, extra: Partial<LSolid> = {}): LSolid => ({ x, y, w, h, ...extra })
const HZ = (x: number, y: number, w: number, h: number, extra: Partial<LHazard> = {}): LHazard => ({ x, y, w, h, ...extra })
const D = (id: string, x: number, y: number, w: number, h: number, real: boolean, extra: Partial<LDoor> = {}): LDoor => ({
  id,
  x,
  y,
  w,
  h,
  real,
  ...extra,
})
const TR = (x: number, y: number, w: number, h: number, effect: LTrigger['effect'], extra: Partial<LTrigger> = {}): LTrigger => ({
  x,
  y,
  w,
  h,
  effect,
  ...extra,
})
const B = (id: string, x: number, y: number, w: number, h: number, label: string, effect: LButton['effect'], extra: Partial<LButton> = {}): LButton => ({
  id,
  x,
  y,
  w,
  h,
  label,
  effect,
  ...extra,
})
const L = (x: number, y: number, text: string, extra: Partial<LLabel> = {}): LLabel => ({ x, y, text, ...extra })
const A = (x: number, y: number, dx: number, dy: number, extra: Partial<LArrow> = {}): LArrow => ({ x, y, dx, dy, ...extra })

const DOOR = (extra: Partial<LDoor> = {}) => (id: string, x: number, real: boolean) => D(id, x, 404, 40, 76, real, extra)

/**
 * Ten hand-built levels of in-world interface deception.
 * Every trap is deterministic; a second attempt can always outsmart it.
 * Essential controls (pause / restart / level select / mute) live in the shell
 * and are never spoofed here — this is all drawn on the canvas.
 */
export const liarLevels: LLevel[] = [
  // 1 -----------------------------------------------------------------------
  {
    name: 'Read The Signs',
    hint: 'Follow the signs. Signs never lie.',
    start: { x: 60, y: START_Y },
    solids: [S(0, GROUND, 400, 60), S(560, GROUND, 400, 60), S(160, 372, 180, 16, { kind: 'fake' })],
    hazards: [],
    doors: [DOOR()('exit', 900, true)],
    labels: [
      L(96, 438, 'BRIDGE OUT — TURN BACK', { color: '#ffb057', size: 13, box: true, w: 250 }),
      L(170, 352, '↑ SAFE ROUTE', { color: '#8ef0c0', size: 15 }),
      L(648, 438, 'DANGER: EXIT', { color: '#ff6b8a', size: 13, box: true, w: 160 }),
    ],
    arrows: [A(250, 366, 0, -1, { len: 40, color: '#8ef0c0' }), A(700, 350, 1, 0, { len: 46, color: '#ffb057' })],
    mapAccurate: true,
  },

  // 2 -----------------------------------------------------------------------
  {
    name: 'Exit Interview',
    hint: 'Two exits are better than one. Probably all three.',
    start: { x: 40, y: START_Y },
    solids: [S(0, GROUND, 960, 60), S(250, 440, 100, 40), S(550, 420, 100, 60)],
    hazards: [],
    doors: [DOOR()('real', 880, true), D('fake1', 280, 364, 40, 76, false), D('fake2', 580, 344, 40, 76, false)],
    labels: [
      L(258, 372, 'EXIT →', { color: '#8ef0c0', size: 15, box: true, w: 86 }),
      L(558, 352, 'EXIT →', { color: '#8ef0c0', size: 15, box: true, w: 86 }),
      L(792, 372, 'STAFF ONLY', { color: '#ffb057', size: 12, box: true, w: 150 }),
    ],
    arrows: [A(300, 340, 0, 1, { len: 34 }), A(600, 320, 0, 1, { len: 34 })],
    mapAccurate: true,
  },

  // 3 -----------------------------------------------------------------------
  {
    name: 'Catch Me If You Can',
    hint: 'The button wants to be pressed. Just walk up to it.',
    start: { x: 60, y: START_Y },
    solids: [S(0, GROUND, 960, 60)],
    hazards: [],
    doors: [DOOR({ hidden: true })('exit', 880, true)],
    buttons: [
      B('b1', 700, 448, 56, 32, 'GO', { show: ['exit'], sound: 'unlock', message: 'The button gave up. Door open.' }, {
        flee: { radius: 180, minX: 120, maxX: 812, speed: 300 },
      }),
    ],
    labels: [
      L(360, 300, 'Press GO to open the way', { color: '#c9b6ff', size: 15, box: true, w: 300 }),
      L(150, 438, 'holds still, we promise', { color: 'rgba(255,255,255,0.5)', size: 12 }),
    ],
    mapAccurate: true,
  },

  // 4 -----------------------------------------------------------------------
  {
    name: 'Follow The Arrows',
    hint: 'Arrows point to the exit. That is what arrows do.',
    start: { x: 460, y: START_Y },
    solids: [
      S(0, GROUND, 200, 60),
      S(320, GROUND, 640, 60),
      S(620, 400, 140, 20),
      S(720, 320, 120, 20),
      S(620, 240, 140, 20),
    ],
    hazards: [],
    doors: [DOOR()('real', 40, true), D('fake', 700, 164, 40, 76, false)],
    labels: [
      L(636, 388, 'EXIT →', { color: '#8ef0c0', size: 14, box: true, w: 80 }),
      L(736, 308, 'EXIT →', { color: '#8ef0c0', size: 14, box: true, w: 80 }),
      L(600, 226, 'ALMOST THERE ↑', { color: '#8ef0c0', size: 14, box: true, w: 170 }),
      L(16, 438, 'no exit this way', { color: 'rgba(255,255,255,0.45)', size: 12 }),
    ],
    arrows: [
      A(500, 430, 1, 0, { len: 60, color: '#8ef0c0' }),
      A(676, 360, 1, -1, { len: 44, color: '#8ef0c0' }),
      A(700, 280, -1, -1, { len: 44, color: '#8ef0c0' }),
      A(520, 430, 1, 0, { len: 90, label: 'THIS WAY' }),
    ],
    mapAccurate: true,
  },

  // 5 -----------------------------------------------------------------------
  {
    name: 'Swapsies',
    hint: 'Cross the scanner. Nothing will change.',
    start: { x: 40, y: START_Y },
    solids: [S(0, GROUND, 960, 60)],
    hazards: [],
    doors: [DOOR()('d1', 880, true), DOOR()('d2', 140, false)],
    triggers: [
      TR(460, 200, 36, 280, { swapDoors: ['d1', 'd2'], shake: 0.5, sound: 'flip', message: 'The doors traded. Trust the steady glow.' }, { once: true }),
    ],
    labels: [
      L(820, 372, 'EXIT', { color: '#8ef0c0', size: 14, box: true, w: 66 }),
      L(96, 372, 'not an exit', { color: 'rgba(255,255,255,0.45)', size: 12 }),
      L(392, 180, 'SCANNER', { color: '#9fd0ff', size: 12, box: true, w: 96 }),
    ],
    mapAccurate: true,
  },

  // 6 -----------------------------------------------------------------------
  {
    name: 'Unexpected Switch',
    hint: 'Press the big red switch. Red means go.',
    start: { x: 40, y: START_Y },
    solids: [S(0, GROUND, 400, 60), S(660, GROUND, 300, 60), S(400, 470, 260, 10, { kind: 'vanish', id: 'bridge', hidden: true })],
    hazards: [HZ(330, 424, 36, 36, { kind: 'saw', id: 'saw1', hidden: true, move: { dx: 70, dy: 0, period: 2.6 } })],
    doors: [DOOR({ hidden: true })('exit', 900, true)],
    buttons: [
      B('big', 90, 436, 130, 44, 'EXTEND BRIDGE', { show: ['saw1'], shake: 0.6, sound: 'hit', message: 'That extended... something else.' }, {
        color: '#7a1533',
      }),
      B('small', 320, 450, 74, 30, 'DO NOT PRESS', { show: ['bridge', 'exit'], sound: 'unlock', message: 'The forbidden button works. Suspicious.' }, {
        color: '#3b2f5a',
      }),
    ],
    labels: [L(520, 300, 'Pit ahead. Build the bridge.', { color: '#ffb057', size: 14, box: true, w: 260 })],
    mapAccurate: true,
  },

  // 7 -----------------------------------------------------------------------
  {
    name: 'Click Bait',
    hint: 'Platforms auto-align. You will not need to touch anything.',
    start: { x: 60, y: START_Y },
    solids: [
      S(0, GROUND, 260, 60),
      S(780, GROUND, 180, 60),
      S(290, 300, 90, 16, { id: 'p1', click: { x2: 290, y2: 430 }, label: 'USE' }),
      S(450, 300, 90, 16, { id: 'p2', click: { x2: 450, y2: 390 }, label: 'USE' }),
      S(610, 300, 90, 16, { id: 'p3', click: { x2: 610, y2: 430 }, label: 'USE' }),
    ],
    hazards: [],
    doors: [DOOR()('exit', 880, true)],
    labels: [
      L(300, 268, 'FIXTURE — PERMANENT', { color: '#c9b6ff', size: 12, box: true, w: 200 }),
      L(360, 210, 'tap or face + E to use', { color: 'rgba(255,255,255,0.5)', size: 12 }),
    ],
    mapAccurate: true,
  },

  // 8 -----------------------------------------------------------------------
  {
    name: 'Map Not Included',
    hint: 'Trust the minimap. It syncs live.',
    start: { x: 40, y: START_Y },
    solids: [S(0, GROUND, 320, 60), S(640, GROUND, 320, 60), S(380, 430, 200, 14, { id: 'bridge' })],
    hazards: [],
    doors: [DOOR()('exit', 880, true)],
    triggers: [
      TR(120, 200, 30, 280, { setMap: false, shake: 0.4, sound: 'blip', message: 'Map resynced. Do not ask where to.' }, { once: true }),
    ],
    labels: [L(700, 34, 'LIVE MAP — 100% ACCURATE', { color: '#9fd0ff', size: 11 })],
    arrows: [A(470, 300, 0, 1, { len: 40, color: '#9fd0ff' })],
    minimap: { x: 716, y: 46, w: 208, h: 132, title: 'NAV' },
    mapAccurate: true,
  },

  // 9 -----------------------------------------------------------------------
  {
    name: 'Nothing To See Here',
    hint: 'The green button disables the traps. It is very safe.',
    start: { x: 40, y: START_Y },
    solids: [S(0, GROUND, 960, 60)],
    hazards: [
      HZ(420, 440, 220, 40, { kind: 'spike', id: 'floorSpikes' }),
      HZ(420, 430, 36, 36, { kind: 'saw', id: 'saw1', hidden: true, move: { dx: 110, dy: 0, period: 2.2 } }),
    ],
    doors: [DOOR()('exit', 900, true)],
    buttons: [
      B('safe', 140, 436, 130, 44, 'CLEAR TRAPS', { hide: ['floorSpikes'], show: ['saw1'], shake: 0.5, sound: 'hit', message: 'Traps cleared. A new one added. Balance.' }, {
        color: '#14835a',
      }),
    ],
    labels: [
      L(430, 414, '▲ SPIKES ▲', { color: '#ff6b8a', size: 12, box: true, w: 140 }),
      L(150, 414, 'CLEAR TRAPS', { color: '#8ef0c0', size: 12 }),
    ],
    mapAccurate: true,
  },

  // 10 ----------------------------------------------------------------------
  {
    name: 'Question The Interface',
    hint: 'The EXIT door is the exit. Push the button to use it.',
    start: { x: 40, y: START_Y },
    solids: [S(0, GROUND, 380, 60), S(500, GROUND, 460, 60)],
    hazards: [],
    doors: [DOOR()('fake', 200, false), DOOR({ hidden: true })('real', 880, true)],
    triggers: [
      TR(760, 200, 30, 280, { swapDoors: ['real', 'fake'], shake: 0.5, sound: 'flip', message: 'Swapped. The steady glow never lies.' }, { once: true }),
    ],
    buttons: [
      B('push', 600, 436, 150, 44, 'PUSH TO EXIT', { death: true, message: 'That button was a goodbye, not an exit.' }, { color: '#7a1533' }),
      B('nope', 60, 450, 78, 30, 'DO NOT PRESS', { show: ['real'], sound: 'unlock', message: 'The forbidden button opened the real door. Rude of it.' }, {
        color: '#3b2f5a',
      }),
    ],
    labels: [
      L(176, 372, 'EXIT →', { color: '#8ef0c0', size: 14, box: true, w: 80 }),
      L(596, 404, 'PUSH FOR EXIT', { color: '#ff8fa3', size: 12 }),
      L(60, 438, 'tiny label. big consequences.', { color: 'rgba(255,255,255,0.45)', size: 11 }),
    ],
    arrows: [A(300, 350, 0, 1, { len: 34 }), A(470, 430, 1, 0, { len: 80, color: '#ff8fa3' })],
    minimap: { x: 716, y: 46, w: 208, h: 132, title: 'NAV' },
    mapAccurate: false,
  },
]
