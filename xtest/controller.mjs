// Controller integration test: drives the real GameController exactly like the
// browser does — including the frame(s) that run BEFORE a level is loaded.
//
// This is the scenario the plain smoke test missed: the controller renders on
// every frame regardless of status, and during `intro` no game has had load()
// called yet, so a game must not be asked to render world state. The controller
// guards this; this test fails loudly if that guard regresses.

import { gameModules } from '../lib/game/registry.ts'
import { GameController } from '../lib/game/controller.ts'

// ---- minimal DOM / WebAudio / storage stubs ---------------------------------

class FakeParam {
  value = 0
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
  cancelScheduledValues() {}
}
class FakeGain {
  gain = new FakeParam()
  connect() {
    return this
  }
  disconnect() {}
}
class FakeOsc {
  frequency = new FakeParam()
  type = 'sine'
  connect() {
    return this
  }
  start() {}
  stop() {}
}
class FakeFilter {
  frequency = new FakeParam()
  Q = new FakeParam()
  type = 'lowpass'
  connect() {
    return this
  }
}
class FakeSource {
  buffer = null
  loop = false
  playbackRate = new FakeParam()
  connect() {
    return this
  }
  start() {}
  stop() {}
}
class FakeAudioContext {
  destination = {}
  currentTime = 0
  state = 'running'
  sampleRate = 44100
  createGain() {
    return new FakeGain()
  }
  createOscillator() {
    return new FakeOsc()
  }
  createBiquadFilter() {
    return new FakeFilter()
  }
  createBufferSource() {
    return new FakeSource()
  }
  createBuffer(_c, length = 1) {
    return { getChannelData: () => new Float32Array(length) }
  }
  resume() {
    return Promise.resolve()
  }
  suspend() {
    return Promise.resolve()
  }
  close() {
    return Promise.resolve()
  }
}

const store = new Map()
const localStorageStub = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
}

let rafCb = null
let rafId = 1

globalThis.window = globalThis
globalThis.localStorage = localStorageStub
globalThis.devicePixelRatio = 1
globalThis.AudioContext = FakeAudioContext
globalThis.requestAnimationFrame = (cb) => {
  rafCb = cb
  return rafId++
}
globalThis.cancelAnimationFrame = () => {
  rafCb = null
}

// ---- instrumented canvas ----------------------------------------------------

function makeCtx(counter) {
  const gradient = { addColorStop() {} }
  const target = {
    canvas: null,
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    createPattern: () => null,
    measureText: () => ({ width: 12 }),
    setLineDash() {},
    save() {},
    restore() {},
  }
  return new Proxy(target, {
    get(t, p) {
      if (p in t) {
        const v = t[p]
        if (typeof v === 'function') {
          return (...a) => {
            counter[p] = (counter[p] || 0) + 1
            return v.apply(t, a)
          }
        }
        return v
      }
      return () => {
        counter[p] = (counter[p] || 0) + 1
      }
    },
    set() {
      return true
    },
  })
}

function makeCanvas(counter) {
  const ctx = makeCtx(counter)
  return {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    focus() {},
  }
}

// ---- runner -----------------------------------------------------------------

// Capture controller console.error output.
const errors = []
const realError = console.error
console.error = (...a) => {
  errors.push(a.map((x) => (x && x.stack) || String(x)).join(' '))
}

let now = 0
function frame(dtMs = 16) {
  now += dtMs
  const cb = rafCb
  rafCb = null
  if (cb) cb(now)
}

const problems = []
let renderErrors = 0
let updateErrors = 0
let otherErrors = 0

for (const [slug, mod] of Object.entries(gameModules)) {
  const counter = {}
  const canvas = makeCanvas(counter)
  const uiStates = []
  const before = errors.length
  const controller = new GameController({
    canvas,
    module: mod,
    onUi: (ui) => uiStates.push(ui.status),
  })

  let phase = 'pre-begin'
  try {
    // 1. run several frames BEFORE begin(): the "intro" window.
    controller.run()
    const fillBefore = counter.fillRect || 0
    for (let i = 0; i < 10; i++) frame()
    const fillAfterPreBegin = counter.fillRect || 0
    if (!controller.hasStarted) {
      // expected: no runtime render, just the placeholder background
      if (fillAfterPreBegin <= fillBefore) {
        problems.push(`${slug}: pre-begin frames painted nothing (expected placeholder)`)
      }
    }

    // 2. begin at level 1 and play.
    phase = 'begin'
    controller.begin(1)
    for (let i = 0; i < 30; i++) {
      controller.handleKey('ArrowRight', true)
      controller.handleKey('Space', i % 6 === 0)
      frame()
      controller.handleKey('Space', false)
    }

    // 3. pause / resume / restart.
    phase = 'pause'
    controller.pause()
    for (let i = 0; i < 5; i++) frame()
    controller.resume()
    controller.restart()
    for (let i = 0; i < 5; i++) frame()

    // 4. level select + next, walking every level.
    phase = 'levels'
    for (let lv = 1; lv <= mod.levels; lv++) {
      controller.selectLevel(lv)
      for (let i = 0; i < 5; i++) frame()
    }
    controller.nextLevel()
    frame()

    // 5. pointer input path.
    phase = 'pointer'
    controller.setPointer(480, 300, true)
    frame()
    controller.setPointer(500, 260, false)
    frame()

    controller.destroy()
  } catch (err) {
    problems.push(`${slug}: threw during ${phase}: ${err && err.stack ? err.stack : err}`)
  }

  // Attribute any controller errors produced during this slug.
  const mine = errors.slice(before)
  for (const e of mine) {
    const first = e.split('\n')[0]
    if (e.includes('render error')) renderErrors++
    else if (e.includes('update error')) updateErrors++
    else otherErrors++
    console.log(`ERROR [${slug}] ${first}`)
  }
  if (mine.length) problems.push(`${slug}: ${mine.length} console.error output`)
}

console.error = realError

for (const p of problems.slice(0, 12)) console.log('PROBLEM:', p)

const total = renderErrors + updateErrors + otherErrors + problems.length
console.log(`\ncontroller: modules=${Object.keys(gameModules).length} renderErrors=${renderErrors} updateErrors=${updateErrors} other=${otherErrors} problems=${problems.length}`)
if (total > 0) {
  console.log('RESULT: FAIL')
  process.exitCode = 1
} else {
  console.log('RESULT: PASS')
}
