// Solvability search for X Devil (the game with the most intricate traps).
//
// Randomised macro-action search: a "player" chooses a mode (idle / right /
// right+jump / jump / left / left+jump) that it holds for a few frames at a
// time, then re-chooses. Over many restarts this finds human-reachable routes
// if they exist. It is evidence a winning route exists — not proof of
// difficulty.
//
// Env knobs: ONLY_LEVEL=<n> to run one level, LEFT_BIAS=0..1 to encourage
// backtracking (needed for levels whose door relocates), SHOW_TRACE=1 to dump
// the winning input script.
//
//   node --experimental-strip-types --loader ./xtest/loader.mjs xtest/search.mjs [episodes] [frames]
import { game } from '../games/x-devil/index.ts'

const gradient = { addColorStop() {} }
function makeCtx() {
  const target = {
    canvas: {},
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    measureText: () => ({ width: 12 }),
    setLineDash() {},
    save() {},
    restore() {},
  }
  return new Proxy(target, {
    get(t, p) {
      return p in t ? t[p] : () => {}
    },
    set() {
      return true
    },
  })
}
const ctx = makeCtx()

function mulberry(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MODES = [
  { right: true }, // 0 hold right
  { right: true, jump: true }, // 1 run-jump
  { jump: true }, // 2 hop in place
  { left: true }, // 3 back
  { left: true, jump: true }, // 4 back-jump
  {}, // 5 wait
]

function tryEpisode(level, seed, maxFrames, leftBias = 0) {
  const rnd = mulberry(seed)
  let tick = 0
  let mode = 1
  let hold = 0
  let completed = false
  const trace = []
  const hooks = {
    death: () => {},
    complete: () => {
      completed = true
    },
    sound: () => {},
    shake: () => {},
    reducedMotion: false,
  }
  const rt = game.create(hooks)
  rt.load(level)
  for (let i = 0; i < maxFrames && !completed; i++) {
    if (hold <= 0) {
      const goingLeft = rnd() < leftBias
      if (goingLeft) {
        const leftModes = [3, 4, 3, 5, 2]
        mode = leftModes[Math.floor(rnd() * leftModes.length)]
      } else {
        mode = rnd() < 0.62 ? (rnd() < 0.55 ? 1 : 0) : Math.floor(rnd() * MODES.length)
      }
      hold = 2 + Math.floor(rnd() * (goingLeft ? 14 : 6))
      trace.push(`${i}:${mode}`)
    }
    hold--
    const m = MODES[mode]
    const jump = !!m.jump
    const input = {
      left: !!m.left,
      right: !!m.right,
      up: jump,
      down: false,
      jump,
      jumpPressed: jump && tick === 0,
      action: false,
      actionPressed: false,
      pointer: { x: 480, y: 270, down: false, pressed: false },
    }
    tick = (tick + 1) % 8
    rt.update(1 / 60, input)
  }
  return { completed, trace }
}

const EPISODES = Number(process.argv[2] ?? 4000)
const MAX_FRAMES = Number(process.argv[3] ?? 720)
const ONLY = process.env.ONLY_LEVEL ? Number(process.env.ONLY_LEVEL) : 0
const LEFT_BIAS = Number(process.env.LEFT_BIAS ?? 0)

for (let level = 1; level <= game.levels; level++) {
  if (ONLY && level !== ONLY) continue
  let solved = false
  let best = null
  for (let e = 0; e < EPISODES; e++) {
    const r = tryEpisode(level, (level * 100000 + e * 7919) >>> 0, MAX_FRAMES, LEFT_BIAS)
    if (r.completed) {
      solved = true
      best = r
      break
    }
  }
  console.log(`${solved ? 'SOLVABLE' : 'not-found'}  L${level}` + (solved ? `  (trace ${best.trace.length} steps)` : ''))
  if (solved && process.env.SHOW_TRACE) console.log('   ', best.trace.join(' '))
}
