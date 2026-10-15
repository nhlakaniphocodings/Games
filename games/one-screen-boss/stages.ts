/*
 * One Screen Boss — stage / attack definitions.
 *
 * Every stage is a single fixed-screen 60 second survival gauntlet. The runtime
 * reads these declarative attack descriptions and drives them with a strict
 * telegraph -> fire cycle. Attack geometry is generated deterministically from
 * a per-stage hash, so the same level always fires the same (learnable) pattern.
 *
 * Difficulty contract:
 *  - every stage opens with a lethal volley ~1s into the run (telegraph visible
 *    ~2.4s after the "GET READY" card) and a second, overlapping threat before
 *    the 5 second mark. Idle play dies on stage 1 within a few seconds.
 *  - volleys keep rotating their safe gaps (`rotate` / `gapSpin`) so the first
 *    safe spot you found is a lie by the second volley: the safe zone must be
 *    read fresh each cycle, not memorised once.
 *  - each individual attack always leaves a reachable safe region (>= 2 free
 *    lanes for rain/crossfire, >= 1.3rad gaps for radial/ring, uniform rotation
 *    for sweeps, 2x2 free cells for grid locks) so no volley is unavoidable.
 */

export type AttackType =
  | 'radial' // ring of orbs bursting outward from the core, with one safe gap
  | 'aimed' // orbs fired along a locked line at where you were
  | 'rain' // vertical columns of orbs fall from the ceiling
  | 'crossfire' // horizontal rows of orbs converge from both walls
  | 'sweep' // static or slowly rotating beams radiating from the core
  | 'ring' // expanding shockwave annulus with a safe arc
  | 'grid' // danger bands lock down the screen, leaving safe cells

export interface AttackDef {
  type: AttackType
  /** short label shown on the telegraph bar */
  name: string
  /** warning time before it fires — always >= 0.5s so it is readable */
  telegraph: number
  /** seconds of breathing room between volleys at the start of a stage */
  interval: number
  /** delay before this attack first fires (fractional offsets build combos) */
  first?: number
  /** only becomes active after this fraction (0..1) of the 60s stage */
  after?: number
  /** projectiles per volley (radial / aimed / rain / crossfire) */
  count?: number
  /** projectile travel speed, or shockwave growth speed */
  speed?: number
  /** projectile radius */
  radius?: number
  /** angular spread for aimed volleys (radians) */
  spread?: number
  /** rotation applied to each successive volley (radians) */
  rotate?: number
  /** safe gap width in radians (radial / ring) */
  gap?: number
  /** gap rotation over a ring's lifetime (rad/s) */
  gapSpin?: number
  /** number of concentric rings in one shockwave */
  rings?: number
  /** delay between concentric rings */
  ringGap?: number
  /** shockwave band thickness */
  thickness?: number
  /** number of lanes a rain / crossfire attack splits the screen into */
  lanes?: number
  /** number of beams in a sweep */
  beamCount?: number
  /** beam rotation speed (rad/s); 0 = static wall */
  beamSpeed?: number
  /** beam lifetime in seconds */
  beamDuration?: number
  /** beam thickness */
  beamWidth?: number
  /** how long grid danger bands stay lethal */
  duration?: number
  /** lethal column bands AND row bands for a grid lock */
  bands?: number
}

export interface StageDef {
  name: string
  blurb: string
  /** arena tint for this stage */
  tint: string
  /** core colour for this stage */
  core: string
  attacks: AttackDef[]
  /** injected at the finale mark for the dramatic final ten seconds */
  finale: AttackDef[]
}

const A = (type: AttackType, name: string, over: Partial<AttackDef> = {}): AttackDef => ({
  type,
  name,
  telegraph: 0.7,
  interval: 1.8,
  ...over,
})

/** Arena tints (monochrome backgrounds) and core colours (palette only). */
const BG_A = '#0a0a0a'
const BG_B = '#181818'
const C_BLUE = '#0066ff'
const C_GREEN = '#00a83b'
const C_STEEL = '#bdbdbd'
const C_RED = '#ff0000'

/**
 * Ten stages of escalating pressure. Each stage introduces a pattern, then the
 * next recombines what you already know. Stage 10 throws everything at once,
 * and stages 9-10 hide a last-second barrage right before the timer expires.
 */
export const stages: StageDef[] = [
  // 1 -----------------------------------------------------------------------
  {
    name: 'Calibration',
    blurb: 'The core opens with a snapping ring. Read the gap, keep moving.',
    tint: BG_A,
    core: C_BLUE,
    attacks: [
      // first telegraph ~1.0s in, lethal ~1.7s in: no safe opening
      A('radial', 'Opener Ring', {
        count: 10,
        gap: 1.5,
        speed: 195,
        radius: 8,
        interval: 2.2,
        telegraph: 0.7,
        first: 1.0,
        rotate: 0.45, // the safe wedge rotates every volley — do not camp it
      }),
      // single-shot sniper aims exactly where you stood: idle players die here
      A('aimed', 'Pinning Shot', {
        count: 1,
        speed: 250,
        radius: 8,
        interval: 2.3,
        telegraph: 0.6,
        first: 2.4,
      }),
      A('ring', 'Shock Pulse', {
        gap: 1.7,
        thickness: 20,
        speed: 150,
        interval: 3.0,
        telegraph: 1.0,
        first: 4.6,
        gapSpin: 0.3,
      }),
    ],
    finale: [
      A('radial', 'Convergence', { count: 11, gap: 1.5, speed: 205, radius: 8, interval: 1.7, telegraph: 0.7, first: 0.2, rotate: 0.5 }),
      A('aimed', 'Lock On', { count: 1, speed: 265, radius: 8, interval: 2.0, telegraph: 0.6, first: 1.4 }),
      A('rain', 'Late Downpour', { count: 3, lanes: 6, speed: 300, radius: 8, interval: 2.4, telegraph: 0.7, first: 6.0 }), // near-victory trap
    ],
  },
  // 2 -----------------------------------------------------------------------
  {
    name: 'Crossfire',
    blurb: 'Both walls spit fire while the core tracks you. Read the rows.',
    tint: BG_B,
    core: C_BLUE,
    attacks: [
      A('crossfire', 'Side Volley', { count: 3, lanes: 5, speed: 225, radius: 8, interval: 2.0, telegraph: 0.7, first: 0.9 }),
      A('aimed', 'Pinning Shot', { count: 1, speed: 255, radius: 8, interval: 2.2, telegraph: 0.6, first: 2.2 }),
      A('radial', 'Pulse', { count: 10, gap: 1.4, speed: 190, radius: 8, interval: 2.4, telegraph: 0.7, first: 3.6, rotate: 0.5 }),
    ],
    finale: [
      A('crossfire', 'Pincer', { count: 3, lanes: 6, speed: 250, radius: 8, interval: 1.6, telegraph: 0.65, first: 0.2 }),
      A('aimed', 'Snap Lock', { count: 1, speed: 270, radius: 8, interval: 1.9, telegraph: 0.55, first: 1.2 }),
      A('grid', 'Hard Lock', { bands: 1, duration: 1.0, interval: 3.4, telegraph: 1.1, first: 6.2 }), // near-victory trap
    ],
  },
  // 3 -----------------------------------------------------------------------
  {
    name: 'Rainmaker',
    blurb: 'Columns fall from the ceiling while the walls spit back.',
    tint: BG_A,
    core: C_GREEN,
    attacks: [
      A('rain', 'Downpour', { count: 3, lanes: 6, speed: 275, radius: 8, interval: 1.9, telegraph: 0.65, first: 0.9 }),
      A('radial', 'Outer Ring', { count: 10, gap: 1.4, speed: 195, radius: 8, interval: 2.3, telegraph: 0.7, first: 2.4, rotate: 0.45 }),
      A('crossfire', 'Cross Volley', { count: 2, lanes: 5, speed: 240, radius: 8, interval: 2.4, telegraph: 0.7, first: 4.0 }),
    ],
    finale: [
      A('rain', 'Monsoon', { count: 4, lanes: 6, speed: 310, radius: 8, interval: 1.5, telegraph: 0.65, first: 0.2 }),
      A('radial', 'Convergence', { count: 11, gap: 1.5, speed: 210, radius: 8, interval: 1.7, telegraph: 0.7, first: 1.0, rotate: 0.55 }),
      A('aimed', 'Snap Lock', { count: 2, spread: 0.5, speed: 275, radius: 8, interval: 1.8, telegraph: 0.55, first: 6.1 }),
    ],
  },
  // 4 -----------------------------------------------------------------------
  {
    name: 'Sweep Protocol',
    blurb: 'Laser spokes sweep the arena. The line you dodged is not the next one.',
    tint: BG_B,
    core: C_STEEL,
    attacks: [
      A('sweep', 'Laser Grid', { beamCount: 4, beamDuration: 0.8, beamWidth: 12, interval: 2.2, telegraph: 0.8, first: 1.0 }),
      A('radial', 'Spiral', { count: 11, gap: 1.3, speed: 200, radius: 8, interval: 1.9, telegraph: 0.7, first: 2.2, rotate: 0.55 }),
      A('aimed', 'Snap Lock', { count: 2, spread: 0.45, speed: 255, radius: 8, interval: 2.2, telegraph: 0.6, first: 3.6 }),
      A('sweep', 'Rotary Beam', { beamCount: 4, beamSpeed: 0.5, beamDuration: 1.2, beamWidth: 11, interval: 3.0, telegraph: 0.8, first: 0.4, after: 0.4 }),
    ],
    finale: [
      A('sweep', 'Rotary Beam', { beamCount: 3, beamSpeed: 0.45, beamDuration: 1.2, beamWidth: 11, interval: 1.9, telegraph: 0.75, first: 0.3 }),
      A('aimed', 'Snap Lock', { count: 2, spread: 0.5, speed: 270, radius: 8, interval: 1.7, telegraph: 0.55, first: 1.1 }),
      A('radial', 'Maelstrom', { count: 12, gap: 1.5, speed: 215, radius: 8, interval: 1.6, telegraph: 0.65, first: 6.3, rotate: 0.6 }),
    ],
  },
  // 5 -----------------------------------------------------------------------
  {
    name: 'Orbital Mines',
    blurb: 'Spiral spray, shockwave, sniper — stacked, never politely.',
    tint: BG_A,
    core: C_BLUE,
    attacks: [
      A('radial', 'Spiral Spray', { count: 11, gap: 1.35, speed: 205, radius: 8, interval: 1.7, telegraph: 0.65, first: 0.9, rotate: 0.6 }),
      A('ring', 'Shockwave', { gap: 1.45, thickness: 20, speed: 160, interval: 2.6, telegraph: 1.0, first: 2.2, gapSpin: 0.35 }),
      A('aimed', 'Tracking Shot', { count: 2, spread: 0.5, speed: 250, radius: 8, interval: 2.2, telegraph: 0.6, first: 3.4 }),
      A('grid', 'Lockdown', { bands: 1, duration: 1.0, interval: 2.6, telegraph: 1.0, first: 0.5, after: 0.5 }),
    ],
    finale: [
      A('ring', 'Collapse', { gap: 1.4, thickness: 22, speed: 175, interval: 1.8, telegraph: 1.1, first: 0.2, gapSpin: 0.4 }),
      A('aimed', 'Snap Lock', { count: 3, spread: 0.55, speed: 275, radius: 8, interval: 1.6, telegraph: 0.55, first: 1.0 }),
      A('crossfire', 'Pincer', { count: 3, lanes: 6, speed: 265, radius: 8, interval: 1.7, telegraph: 0.6, first: 5.8 }),
    ],
  },
  // 6 -----------------------------------------------------------------------
  {
    name: 'Shockwave',
    blurb: 'Concentric rings with a moving safe arc. Keep rotating with it.',
    tint: BG_B,
    core: C_GREEN,
    attacks: [
      A('ring', 'Double Pulse', { rings: 2, ringGap: 0.5, gap: 1.4, thickness: 20, speed: 160, interval: 2.6, telegraph: 1.1, first: 1.0, gapSpin: 0.35 }),
      A('rain', 'Downpour', { count: 3, lanes: 6, speed: 280, radius: 8, interval: 2.0, telegraph: 0.6, first: 2.4 }),
      A('sweep', 'Laser Grid', { beamCount: 4, beamDuration: 0.8, beamWidth: 12, interval: 2.4, telegraph: 0.75, first: 3.8 }),
      A('aimed', 'Snap Lock', { count: 2, spread: 0.4, speed: 255, radius: 8, interval: 2.2, telegraph: 0.55, first: 0.6, after: 0.35 }),
    ],
    finale: [
      A('ring', 'Final Pulse', { rings: 3, ringGap: 0.45, gap: 1.4, gapSpin: 0.45, thickness: 20, speed: 175, interval: 2.0, telegraph: 1.1, first: 0.2 }),
      A('rain', 'Monsoon', { count: 4, lanes: 6, speed: 315, radius: 8, interval: 1.5, telegraph: 0.6, first: 0.9 }),
      A('aimed', 'Snap Lock', { count: 2, spread: 0.5, speed: 275, radius: 8, interval: 1.6, telegraph: 0.55, first: 6.4 }),
    ],
  },
  // 7 -----------------------------------------------------------------------
  {
    name: 'Grid Lockdown',
    blurb: 'Fire bands cage the screen. Find the free cell, then keep it.',
    tint: BG_A,
    core: C_STEEL,
    attacks: [
      A('grid', 'Lockdown', { bands: 2, duration: 0.85, interval: 2.4, telegraph: 1.0, first: 0.8 }),
      A('aimed', 'Tracking Shot', { count: 2, spread: 0.45, speed: 245, radius: 8, interval: 2.1, telegraph: 0.6, first: 2.0 }),
      A('radial', 'Convergence', { count: 11, gap: 1.3, speed: 205, radius: 8, interval: 1.8, telegraph: 0.7, first: 3.2, rotate: 0.5 }),
      A('crossfire', 'Pincer', { count: 3, lanes: 6, speed: 255, radius: 8, interval: 2.4, telegraph: 0.7, first: 0.5, after: 0.45 }),
    ],
    finale: [
      A('grid', 'Hard Lock', { bands: 2, duration: 0.8, interval: 2.2, telegraph: 0.95, first: 0.2 }),
      A('radial', 'Convergence', { count: 12, gap: 1.5, speed: 220, radius: 8, interval: 1.7, telegraph: 0.65, first: 1.1, rotate: 0.6 }),
      A('sweep', 'Rotary Beam', { beamCount: 3, beamSpeed: 0.45, beamDuration: 1.1, beamWidth: 11, interval: 1.9, telegraph: 0.7, first: 6.0 }),
    ],
  },
  // 8 -----------------------------------------------------------------------
  {
    name: 'Spiral Storm',
    blurb: 'A rotating wall of orbs, crossfire and rain. Thread the eye.',
    tint: BG_B,
    core: C_RED,
    attacks: [
      A('radial', 'Spiral Storm', { count: 12, gap: 1.4, speed: 215, radius: 8, interval: 1.6, telegraph: 0.6, first: 0.8, rotate: 0.65 }),
      A('crossfire', 'Cross Volley', { count: 3, lanes: 6, speed: 255, radius: 8, interval: 2.0, telegraph: 0.65, first: 2.0 }),
      A('rain', 'Downpour', { count: 3, lanes: 6, speed: 290, radius: 8, interval: 2.0, telegraph: 0.6, first: 3.2 }),
      A('sweep', 'Rotary Beam', { beamCount: 4, beamSpeed: 0.5, beamDuration: 1.1, beamWidth: 11, interval: 2.4, telegraph: 0.75, first: 0.5, after: 0.35 }),
      A('ring', 'Shockwave', { gap: 1.4, gapSpin: 0.4, thickness: 20, speed: 170, interval: 2.6, telegraph: 1.0, first: 0.5, after: 0.6 }),
    ],
    finale: [
      A('radial', 'Maelstrom', { count: 12, gap: 1.5, speed: 225, radius: 8, interval: 1.5, telegraph: 0.6, first: 0.2, rotate: 0.7 }),
      A('crossfire', 'Pincer', { count: 4, lanes: 6, speed: 270, radius: 8, interval: 1.7, telegraph: 0.6, first: 0.9 }),
      A('aimed', 'Snap Lock', { count: 2, spread: 0.5, speed: 280, radius: 8, interval: 1.7, telegraph: 0.55, first: 1.6 }),
      A('rain', 'Late Downpour', { count: 4, lanes: 7, speed: 320, radius: 8, interval: 2.0, telegraph: 0.6, first: 6.2 }),
    ],
  },
  // 9 -----------------------------------------------------------------------
  {
    name: 'Total Suppression',
    blurb: 'Rain, lasers, shockwaves, aimed fire — and a trap at the end.',
    tint: BG_A,
    core: C_RED,
    attacks: [
      A('rain', 'Monsoon', { count: 4, lanes: 7, speed: 290, radius: 8, interval: 1.8, telegraph: 0.6, first: 0.7 }),
      A('sweep', 'Laser Grid', { beamCount: 4, beamDuration: 0.75, beamWidth: 11, interval: 2.2, telegraph: 0.7, first: 1.8 }),
      A('ring', 'Shockwave', { gap: 1.35, thickness: 20, speed: 170, gapSpin: 0.35, interval: 2.4, telegraph: 1.0, first: 3.0 }),
      A('aimed', 'Snap Lock', { count: 3, spread: 0.5, speed: 260, radius: 8, interval: 2.0, telegraph: 0.55, first: 0.5, after: 0.2 }),
      A('grid', 'Hard Lock', { bands: 2, duration: 0.8, interval: 2.4, telegraph: 0.95, first: 0.5, after: 0.55 }),
    ],
    finale: [
      A('sweep', 'Rotary Beam', { beamCount: 4, beamSpeed: 0.5, beamDuration: 1.1, beamWidth: 11, interval: 1.7, telegraph: 0.7, first: 0.2 }),
      A('rain', 'Monsoon', { count: 4, lanes: 7, speed: 325, radius: 8, interval: 1.5, telegraph: 0.6, first: 0.7 }),
      A('aimed', 'Snap Lock', { count: 3, spread: 0.55, speed: 285, radius: 8, interval: 1.6, telegraph: 0.55, first: 1.3 }),
      // the trap: a heavy ring cycle that only winds up as you near the timer
      A('ring', 'Last Breath', { rings: 2, ringGap: 0.45, gap: 1.4, gapSpin: 0.45, thickness: 22, speed: 185, interval: 2.0, telegraph: 1.1, first: 6.6 }),
    ],
  },
  // 10 ----------------------------------------------------------------------
  {
    name: 'One Screen Boss',
    blurb: 'Everything you survived, layered. Hold the line for ten more seconds.',
    tint: BG_B,
    core: C_RED,
    attacks: [
      A('radial', 'Omni Ring', { count: 12, gap: 1.4, speed: 220, radius: 8, interval: 1.7, telegraph: 0.6, first: 0.7, rotate: 0.5 }),
      A('rain', 'Downpour', { count: 4, lanes: 7, speed: 295, radius: 8, interval: 1.8, telegraph: 0.6, first: 1.8 }),
      A('grid', 'Lockdown', { bands: 2, duration: 0.85, interval: 2.4, telegraph: 1.0, first: 0.5, after: 0.1 }),
      A('sweep', 'Rotary Beam', { beamCount: 4, beamSpeed: 0.5, beamDuration: 1.0, beamWidth: 11, interval: 2.2, telegraph: 0.7, first: 0.4, after: 0.2 }),
      A('crossfire', 'Pincer', { count: 4, lanes: 7, speed: 265, radius: 8, interval: 1.9, telegraph: 0.6, first: 0.5, after: 0.3 }),
      A('aimed', 'Tracking Shot', { count: 3, spread: 0.5, speed: 265, radius: 8, interval: 2.2, telegraph: 0.55, first: 0.5, after: 0.4 }),
    ],
    finale: [
      A('radial', 'Judgment', { count: 12, gap: 1.5, speed: 230, radius: 8, interval: 1.5, telegraph: 0.6, first: 0.2, rotate: 0.6 }),
      A('ring', 'Collapse', { rings: 2, ringGap: 0.5, gap: 1.45, gapSpin: 0.4, thickness: 20, speed: 180, interval: 1.9, telegraph: 1.1, first: 0.6 }),
      A('sweep', 'Rotary Beam', { beamCount: 3, beamSpeed: 0.45, beamDuration: 1.0, beamWidth: 11, interval: 1.8, telegraph: 0.7, first: 1.2 }),
      A('aimed', 'Snap Lock', { count: 3, spread: 0.55, speed: 285, radius: 8, interval: 1.5, telegraph: 0.55, first: 1.6 }),
      // last-section betrayal: nothing, nothing, then everything at 56s
      A('grid', 'Final Lock', { bands: 1, duration: 0.9, interval: 2.4, telegraph: 1.0, first: 6.0 }),
      A('crossfire', 'Last Pincer', { count: 4, lanes: 7, speed: 280, radius: 8, interval: 1.6, telegraph: 0.6, first: 6.4 }),
    ],
  },
]
