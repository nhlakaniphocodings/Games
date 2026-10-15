// Solvability probe: try a set of deterministic policies per level and report
// whether the exit/win hook is ever reachable with simple play. Not a proof of
// solvability for hard levels — a check that the completion plumbing works and
// that early (tutorial) levels are clearable.
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

function mulberry(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A policy is a function(frame) -> {right,left,jump,action}
const policies = [
  { name: 'hold-right', f: () => ({ right: true }) },
  { name: 'right+jump20', f: (i) => ({ right: true, jump: i % 20 < 6 }) },
  { name: 'right+jump30', f: (i) => ({ right: true, jump: i % 30 < 8 }) },
  { name: 'right+jump45', f: (i) => ({ right: true, jump: i % 45 < 10 }) },
  { name: 'right+jump70', f: (i) => ({ right: true, jump: i % 70 < 12 }) },
  { name: 'right+hop-long', f: (i) => ({ right: true, jump: (i % 50) < 14 }) },
  { name: 'right+act', f: (i) => ({ right: true, jump: i % 33 < 9, action: i % 40 < 4 }) },
  { name: 'osc-right', f: (i) => ({ right: (i % 120) < 90, left: (i % 120) >= 90, jump: i % 25 < 7 }) },
  { name: 'rnd-a', f: (i, r) => ({ right: r() < 0.75, left: r() < 0.15, jump: r() < 0.25, action: r() < 0.05 }) },
  { name: 'rnd-b', f: (i, r) => ({ right: r() < 0.85, jump: r() < 0.3, action: r() < 0.08 }) },
]

function run(mod, level, policy, seed) {
  let done = false
  const hooks = {
    death: () => {},
    complete: () => {
      done = true
    },
    sound: () => {},
    shake: () => {},
    reducedMotion: false,
  }
  const rt = mod.create(hooks)
  rt.load(level)
  const r = mulberry(seed)
  for (let i = 0; i < 1400 && !done; i++) {
    const b = policy.f(i, r)
    const jump = !!b.jump
    const action = !!b.action
    const input = {
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
    rt.update(1 / 60, input)
  }
  return done
}

const results = {}
for (const [slug, mod] of Object.entries(gameModules)) {
  const solved = []
  for (let level = 1; level <= mod.levels; level++) {
    let ok = false
    for (const p of policies) {
      for (const seed of [1, 7, 42]) {
        if (run(mod, level, p, seed)) {
          ok = true
          break
        }
      }
      if (ok) break
    }
    if (ok) solved.push(level)
  }
  results[slug] = solved
  console.log(`${slug.padEnd(18)} solved-with-simple-policies: [${solved.join(', ')}]`)
}

const total = Object.values(results).reduce((a, l) => a + l.length, 0)
console.log(`\nTotal levels clearable by simple policies: ${total}/100`)
