// Procedural Web Audio engine for X Games.
// No external assets: all sounds are synthesized. The context is created
// lazily on the first user gesture and degrades gracefully if unavailable.

import type { SoundName } from './types'

type Osc = OscillatorType

interface ToneSpec {
  type: Osc
  freq: number
  freqEnd?: number
  dur: number
  gain: number
  delay?: number
}

const SFX: Record<SoundName, ToneSpec[]> = {
  jump: [{ type: 'square', freq: 320, freqEnd: 620, dur: 0.12, gain: 0.16 }],
  land: [{ type: 'triangle', freq: 200, freqEnd: 120, dur: 0.08, gain: 0.14 }],
  death: [
    { type: 'sawtooth', freq: 420, freqEnd: 70, dur: 0.42, gain: 0.2 },
    { type: 'square', freq: 210, freqEnd: 50, dur: 0.4, gain: 0.1, delay: 0.02 },
  ],
  win: [
    { type: 'triangle', freq: 523, dur: 0.12, gain: 0.16 },
    { type: 'triangle', freq: 659, dur: 0.12, gain: 0.16, delay: 0.1 },
    { type: 'triangle', freq: 784, dur: 0.16, gain: 0.18, delay: 0.2 },
    { type: 'triangle', freq: 1046, dur: 0.28, gain: 0.18, delay: 0.32 },
  ],
  click: [{ type: 'square', freq: 660, freqEnd: 880, dur: 0.05, gain: 0.1 }],
  blip: [{ type: 'square', freq: 880, dur: 0.04, gain: 0.08 }],
  flip: [{ type: 'sine', freq: 300, freqEnd: 900, dur: 0.16, gain: 0.14 }],
  hit: [{ type: 'square', freq: 180, freqEnd: 90, dur: 0.1, gain: 0.16 }],
  checkpoint: [
    { type: 'sine', freq: 600, dur: 0.08, gain: 0.12 },
    { type: 'sine', freq: 900, dur: 0.12, gain: 0.12, delay: 0.08 },
  ],
  unlock: [
    { type: 'triangle', freq: 700, dur: 0.1, gain: 0.14 },
    { type: 'triangle', freq: 1050, dur: 0.16, gain: 0.14, delay: 0.09 },
  ],
}

class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private muted = false
  private volume = 0.7
  private musicTimer: number | null = null
  private musicOn = false
  private failed = false

  configure(muted: boolean, volume: number) {
    this.muted = muted
    this.volume = volume
    if (this.master) this.master.gain.value = muted ? 0 : volume
  }

  /** Must be called from a user gesture at least once. */
  resume() {
    if (this.failed) return
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctor) {
          this.failed = true
          return
        }
        this.ctx = new Ctor()
        this.master = this.ctx.createGain()
        this.master.gain.value = this.muted ? 0 : this.volume
        this.master.connect(this.ctx.destination)
        this.musicGain = this.ctx.createGain()
        this.musicGain.gain.value = this.musicOn ? 0.14 : 0
        this.musicGain.connect(this.master)
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
    } catch {
      this.failed = true
    }
  }

  play(name: SoundName) {
    if (this.failed || this.muted) return
    this.resume()
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const specs = SFX[name]
    if (!specs) return
    const now = ctx.currentTime
    for (const s of specs) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      const t = now + (s.delay ?? 0)
      osc.type = s.type
      osc.frequency.setValueAtTime(s.freq, t)
      if (s.freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, s.freqEnd), t + s.dur)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(s.gain, t + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, t + s.dur)
      osc.connect(g)
      g.connect(this.master)
      osc.start(t)
      osc.stop(t + s.dur + 0.02)
    }
  }

  /** Toggle a simple procedural pulse. Optional, non-blocking. */
  setMusic(on: boolean, intensity = 0) {
    this.musicOn = on
    this.resume()
    if (!this.ctx || !this.musicGain) return
    this.musicGain.gain.value = on && !this.muted ? 0.12 + intensity * 0.06 : 0
    if (on && this.musicTimer == null) {
      const beat = 0.42
      const seq = [110, 138.6, 164.8, 138.6]
      let i = 0
      const tick = () => {
        if (!this.ctx || !this.musicGain || !this.musicOn) return
        const ctx = this.ctx
        const t = ctx.currentTime
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.value = seq[i % seq.length]
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34)
        osc.connect(g)
        g.connect(this.musicGain)
        osc.start(t)
        osc.stop(t + 0.36)
        i++
      }
      this.musicTimer = window.setInterval(tick, beat * 1000)
    } else if (!on && this.musicTimer != null) {
      window.clearInterval(this.musicTimer)
      this.musicTimer = null
    }
  }
}

export const audio = new AudioEngine()

export function playSound(name: SoundName) {
  audio.play(name)
}
