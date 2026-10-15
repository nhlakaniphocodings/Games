// Difficulty audit.
//
// Runs a set of deterministic "dumb player" policies against every level of
// every game and reports which levels a naive strategy can complete. The point
// of the extreme-difficulty overhaul is that these policies should almost never
// win — in particular `hold-right` must not clear level 1.
//
// It also checks deterministic reset: the same level + policy must produce the
// identical event trace on a fresh load, so deaths stay learnable.
//
// This is a *heuristic* audit, not proof of difficulty. Human play-testing is
// still required for feel. It fails (exit 1) only when a level throws or when a
// game's level 1 is cleared by the trivial `hold-right` policy.

import { gameModules } from '../lib/game/registry.ts'

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

const FRAMES = 900

// policy(frame) -> {right,left,jump,action}
const policies = [
  { name: 'hold-right', f: () => ({ right: true }) },
  { name: 'right+jump20', f: (i) => ({ right: true, jump: i % 20 < 6 }) },
  { name: 'right+jump30', f: (i) => ({ right: true, jump: i % 30 < 8 }) },
  { name: 'right+jump45', f: (i) => ({ right: true, jump: i % 45 < 10 }) },
  { name: 'right+jump70', f: (i) => ({ right: true, jump: i % 70 < 12 }) },
  { name: 'right+hop', f: (i) => ({ right: true, jump: i % 26 < 5 }) },
  { name: 'right+act', f: (i) => ({ right: true, jump: i % 33 < 9, action: i % 40 < 4 }) },
  { name: 'mash', f: (i) => ({ right: i % 90 < 70, left: i % 90 >= 70, jump: i % 11 < 4, action: i % 7 < 2 }) },
]

function makeInput(b, i) {
  const jump = !!b.jump
  const action = !!b.action
  return {
    left: !!b.left,
    right: !!b.right,
    up: jump,
    down: false,
    jump,
    jumpPressed: jump && i % 2 === 0,
    action,
    actionPressed: action && i % 3 === 0,
    pointer: { x: 480, y: 270, down: action, pressed: action },
  }
}

function run(mod, level, policy, frames = FRAMES) {
  const trace = []
  let completed = false
  const hooks = {
    death: () => trace.push('d'),
    complete: () => {
      trace.push('c')
      completed = true
    },
    sound: () => {},
    shake: () => {},
    reducedMotion: false,
  }
  const rt = mod.create(hooks)
  rt.load(level)
  for (let i = 0; i < frames && !completed; i++) {
    rt.update(1 / 60, makeInput(policy.f(i), i))
  }
  return { completed, trace: trace.join('') }
}

let hardFailures = 0
let trivialLevel1 = []

for (const [slug, mod] of Object.entries(gameModules)) {
  const clearedBy = {}
  const clearedLevels = new Set()
  let crashed = false

  for (let level = 1; level <= mod.levels; level++) {
    for (const p of policies) {
      let r
      try {
        r = run(mod, level, p)
      } catch (e) {
        console.log(`ERROR ${slug} L${level} policy=${p.name}: ${e && e.message}`)
        hardFailures++
        crashed = true
        break
      }
      if (r.completed) {
        clearedLevels.add(level)
        ;(clearedBy[level] ??= []).push(p.name)
      }
    }
    if (crashed) break
  }

  // Deterministic reset check: same level + policy => identical trace twice.
  let determinism = 'ok'
  if (!crashed) {
    const a = run(mod, 1, policies[3])
    const b = run(mod, 1, policies[3])
    if (a.completed !== b.completed || a.trace !== b.trace) determinism = 'NON-DETERMINISTIC'
  }

  const l1 = clearedBy[1] ?? []
  const trivial = l1.includes('hold-right')
  if (trivial) {
    trivialLevel1.push(slug)
    hardFailures++
  }

  const list = [...clearedLevels].sort((a, b) => a - b)
  console.log(
    `${slug.padEnd(18)} trivial-cleared=${String(list.length).padStart(2)}/10 ${list.length ? `[${list.join(', ')}]` : ''}` +
      `  L1-by-hold-right=${trivial ? 'YES' : 'no'}  determinism=${determinism}`,
  )
  if (list.length) {
    for (const lv of list) console.log(`      L${lv}: ${clearedBy[lv].join(', ')}`)
  }
}

console.log(`\nDifficulty audit: games=${Object.keys(gameModules).length} hard-failures=${hardFailures}`)
if (trivialLevel1.length) console.log(`Level 1 beaten by hold-right: ${trivialLevel1.join(', ')}`)
console.log(hardFailures === 0 ? 'RESULT: PASS' : 'RESULT: FAIL')
if (hardFailures > 0) process.exitCode = 1
