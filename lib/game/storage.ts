// Versioned local-storage persistence for X Games progress.
// The store is framework-agnostic; React subscribes through useProgress().

export interface LevelRecord {
  completed?: boolean
  noDeath?: boolean
  deaths?: number
  bestMs?: number
}

export interface GameRecord {
  /** highest unlocked level, 1-based. */
  unlocked: number
  levels: Record<string, LevelRecord>
  totalDeaths: number
}

export interface Settings {
  muted: boolean
  volume: number
  reducedMotion: boolean
}

export interface SaveData {
  version: number
  games: Record<string, GameRecord>
  cosmetics: string[]
  settings: Settings
}

const STORAGE_KEY = 'xgames.save'
const SAVE_VERSION = 2

const DEFAULT_SETTINGS: Settings = { muted: false, volume: 0.7, reducedMotion: false }

function emptyGame(): GameRecord {
  return { unlocked: 1, levels: {}, totalDeaths: 0 }
}

function defaultSave(): SaveData {
  return { version: SAVE_VERSION, games: {}, cosmetics: [], settings: { ...DEFAULT_SETTINGS } }
}

/**
 * Stable snapshot used for server rendering and the client's initial hydration
 * render. It must never read localStorage: the server has none, so if the
 * hydration render saw saved data while the server saw this default, React would
 * report a hydration mismatch. After hydration React switches to getSnapshot().
 */
const SERVER_SNAPSHOT: SaveData = defaultSave()

/** Migrate older save shapes forward. Unknown versions fall back safely. */
function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') return defaultSave()
  const data = raw as Partial<SaveData>
  const out = defaultSave()
  if (data.settings && typeof data.settings === 'object') {
    out.settings = {
      muted: Boolean(data.settings.muted),
      volume: typeof data.settings.volume === 'number' ? clamp01(data.settings.volume) : DEFAULT_SETTINGS.volume,
      reducedMotion: Boolean(data.settings.reducedMotion),
    }
  }
  if (data.games && typeof data.games === 'object') {
    for (const [slug, rec] of Object.entries(data.games)) {
      const r = rec as Partial<GameRecord>
      out.games[slug] = {
        unlocked: typeof r.unlocked === 'number' && r.unlocked >= 1 ? Math.floor(r.unlocked) : 1,
        levels: r.levels && typeof r.levels === 'object' ? r.levels : {},
        totalDeaths: typeof r.totalDeaths === 'number' ? Math.max(0, Math.floor(r.totalDeaths)) : 0,
      }
    }
  }
  if (Array.isArray(data.cosmetics)) out.cosmetics = data.cosmetics.filter((c) => typeof c === 'string')
  out.version = SAVE_VERSION
  return out
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

let state: SaveData = defaultSave()
let loaded = false
const listeners = new Set<() => void>()

function ensureLoaded() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    state = raw ? migrate(JSON.parse(raw)) : defaultSave()
  } catch {
    state = defaultSave()
  }
  // reduced-motion preference acts as a default until the player overrides it.
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      state.settings.reducedMotion = true
    }
  } catch {
    /* ignore */
  }
}

function persist() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage may be unavailable (private mode / quota) */
  }
}

function emit() {
  for (const fn of listeners) fn()
}

function commit(mutator: (s: SaveData) => void) {
  ensureLoaded()
  // shallow clone for a stable snapshot reference
  const next: SaveData = {
    version: state.version,
    cosmetics: [...state.cosmetics],
    settings: { ...state.settings },
    games: {},
  }
  for (const [k, v] of Object.entries(state.games)) {
    next.games[k] = { unlocked: v.unlocked, totalDeaths: v.totalDeaths, levels: { ...v.levels } }
  }
  mutator(next)
  state = next
  persist()
  emit()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const progress = {
  subscribe(fn: () => void) {
    ensureLoaded()
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  getSnapshot(): SaveData {
    ensureLoaded()
    return state
  },
  getServerSnapshot(): SaveData {
    return SERVER_SNAPSHOT
  },
  getGame(slug: string): GameRecord {
    ensureLoaded()
    return state.games[slug] ?? emptyGame()
  },
  getLevel(slug: string, level: number): LevelRecord {
    return progress.getGame(slug).levels[String(level)] ?? {}
  },
  getUnlocked(slug: string): number {
    return progress.getGame(slug).unlocked
  },
  isCompleted(slug: string, level: number): boolean {
    return Boolean(progress.getLevel(slug, level).completed)
  },
  recordDeath(slug: string, level: number) {
    commit((s) => {
      const g = (s.games[slug] ??= emptyGame())
      const l = (g.levels[String(level)] ??= {})
      l.deaths = (l.deaths ?? 0) + 1
      g.totalDeaths += 1
    })
  },
  recordComplete(slug: string, level: number, timeMs: number, deathsThisLevel: number) {
    commit((s) => {
      const g = (s.games[slug] ??= emptyGame())
      const l = (g.levels[String(level)] ??= {})
      l.completed = true
      l.deaths = deathsThisLevel
      if (l.bestMs == null || timeMs < l.bestMs) l.bestMs = Math.round(timeMs)
      if (deathsThisLevel === 0) l.noDeath = true
      const nextUnlocked = Math.max(g.unlocked, level + 1)
      g.unlocked = nextUnlocked
    })
  },
  setSettings(patch: Partial<Settings>) {
    commit((s) => {
      s.settings = { ...s.settings, ...patch }
    })
  },
  unlockCosmetic(id: string) {
    commit((s) => {
      if (!s.cosmetics.includes(id)) s.cosmetics.push(id)
    })
  },
  resetGame(slug: string) {
    commit((s) => {
      s.games[slug] = emptyGame()
    })
  },
  resetAll() {
    commit((s) => {
      s.games = {}
      s.cosmetics = []
    })
  },
  /** Aggregate totals for the catalogue / dashboard. */
  totals() {
    ensureLoaded()
    let deaths = 0
    let completed = 0
    let levels = 0
    let noDeath = 0
    for (const g of Object.values(state.games)) {
      deaths += g.totalDeaths
      for (const l of Object.values(g.levels)) {
        levels += 1
        if (l.completed) completed += 1
        if (l.noDeath) noDeath += 1
      }
    }
    return { deaths, completed, levels, noDeath }
  },
  exportText(): string {
    const t = progress.totals()
    return `X GAMES — my run so far\n${t.completed} levels cleared · ${t.deaths} deaths · ${t.noDeath} flawless\n#XGames`
  },
}

export const SAVE_VERSION_VALUE = SAVE_VERSION
