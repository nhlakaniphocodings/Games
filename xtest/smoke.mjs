// Headless smoke test: instantiate every game, load every level, simulate
// input and render frames, and assert nothing throws.
import { gameModules } from '../lib/game/registry.ts'

const gradient = { addColorStop() {} }
function makeCtx() {
  const target = {
    canvas: { width: 960, height: 540 },
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    createPattern: () => null,
    measureText: () => ({ width: 12 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    setLineDash() {},
    save() {},
    restore() {},
  }
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop]
      // default: a no-op method
      return () => {}
    },
    set() {
      return true
    },
  })
}

const ctx = makeCtx()

function makeInput(frame) {
  const phase = frame % 120
  const right = phase < 70
  const left = phase >= 70 && phase < 95
  const jump = phase >= 25 && phase % 30 < 8
  const action = phase % 47 === 0
  return {
    left,
    right,
    up: jump,
    down: false,
    jump,
    jumpPressed: jump && phase % 30 === 25,
    action,
    actionPressed: action,
    pointer: { x: 480, y: 270, down: action, pressed: action },
  }
}

let totalThrows = 0
let totalDeath = 0
let totalComplete = 0

for (const [slug, mod] of Object.entries(gameModules)) {
  const problems = []
  const record = { deaths: 0, completes: 0, sounds: 0 }
  const hooks = {
    death: () => {
      record.deaths++
    },
    complete: () => {
      record.completes++
    },
    sound: () => {
      record.sounds++
    },
    shake: () => {},
    reducedMotion: false,
  }

  if (typeof mod.create !== 'function') problems.push('missing create()')
  if (mod.levels < 10) problems.push(`levels=${mod.levels} (<10)`)
  if (!mod.view || !mod.view.w) problems.push('missing view')

  let runtime
  try {
    runtime = mod.create(hooks)
  } catch (e) {
    problems.push('create threw: ' + e.message)
  }

  if (runtime) {
    for (let level = 1; level <= mod.levels; level++) {
      try {
        runtime.load(level)
      } catch (e) {
        problems.push(`load(${level}) threw: ${e.message}`)
        continue
      }
      for (let f = 0; f < 200; f++) {
        try {
          runtime.update(1 / 60, makeInput(f))
        } catch (e) {
          problems.push(`update L${level} f${f} threw: ${e.message}`)
          break
        }
        try {
          runtime.render(ctx, 960, 540)
        } catch (e) {
          problems.push(`render L${level} f${f} threw: ${e.message}`)
          break
        }
      }
      // after the run, focus() must be safe
      try {
        runtime.focus?.()
      } catch (e) {
        problems.push(`focus L${level} threw: ${e.message}`)
      }
    }
    try {
      runtime.destroy?.()
    } catch (e) {
      problems.push('destroy threw: ' + e.message)
    }
  }

  totalDeath += record.deaths
  totalComplete += record.completes

  const status = problems.length ? 'FAIL' : 'ok'
  if (problems.length) totalThrows += problems.length
  console.log(`${status.padEnd(4)} ${slug.padEnd(18)} levels=${mod.levels} deaths=${record.deaths} completes=${record.completes} sounds=${record.sounds}`)
  for (const p of problems.slice(0, 6)) console.log('      - ' + p)
}

console.log(`\nTOTAL: modules=${Object.keys(gameModules).length} problems=${totalThrows} deathHooks=${totalDeath} completeHooks=${totalComplete}`)
if (totalThrows > 0) process.exit(1)
