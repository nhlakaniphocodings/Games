'use client'

import { formatTime } from '@/lib/game/math'
import type { Settings } from '@/lib/game/storage'
import type { GameModule } from '@/lib/game/types'

function SettingsPanel({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  return (
    <div className="settings-panel">
      <label className="settings-row">
        <span>Sound</span>
        <button
          type="button"
          className={`toggle${settings.muted ? '' : ' is-on'}`}
          aria-pressed={!settings.muted}
          onClick={() => onChange({ muted: !settings.muted })}
        >
          {settings.muted ? 'Off' : 'On'}
        </button>
      </label>
      <label className="settings-row">
        <span>Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => onChange({ volume: Number(e.target.value) })}
          aria-label="Volume"
        />
      </label>
      <label className="settings-row">
        <span>Reduced motion</span>
        <button
          type="button"
          className={`toggle${settings.reducedMotion ? ' is-on' : ''}`}
          aria-pressed={settings.reducedMotion}
          onClick={() => onChange({ reducedMotion: !settings.reducedMotion })}
        >
          {settings.reducedMotion ? 'On' : 'Off'}
        </button>
      </label>
    </div>
  )
}

export function IntroOverlay({
  module: mod,
  settings,
  onSettings,
  onStart,
  onLevels,
  hasProgress,
}: {
  module: GameModule
  settings: Settings
  onSettings: (patch: Partial<Settings>) => void
  onStart: () => void
  onLevels: () => void
  hasProgress: boolean
}) {
  return (
    <div className="game-overlay" role="dialog" aria-modal="true" aria-label={`${mod.title} start`}>
      <div className="overlay-panel">
        <p className="overlay-kicker">{mod.slug === 'x-devil-finale' ? 'Final game' : 'X Games'}</p>
        <h2 className="overlay-title">{mod.title}</h2>
        <p className="overlay-tagline">{mod.tagline}</p>
        <ul className="overlay-list">
          {mod.instructions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="controls-grid">
          {mod.controls.map((c) => (
            <div key={c.label} className="control-chip">
              <span className="control-keys">{c.keys}</span>
              <span className="control-label">{c.label}</span>
            </div>
          ))}
        </div>
        <div className="overlay-actions">
          <button type="button" className="primary-btn" onClick={onStart}>
            {hasProgress ? 'Continue' : 'Play level 1'}
          </button>
          <button type="button" className="ghost-btn" onClick={onLevels}>
            Level select
          </button>
        </div>
        <SettingsPanel settings={settings} onChange={onSettings} />
      </div>
    </div>
  )
}

export function PauseOverlay({
  settings,
  onSettings,
  onResume,
  onRestart,
  onLevels,
}: {
  settings: Settings
  onSettings: (patch: Partial<Settings>) => void
  onResume: () => void
  onRestart: () => void
  onLevels: () => void
}) {
  return (
    <div className="game-overlay" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="overlay-panel overlay-panel-sm">
        <p className="overlay-kicker">Paused</p>
        <h2 className="overlay-title">Take a breath.</h2>
        <p className="overlay-tagline">The traps will wait. They are patient.</p>
        <div className="overlay-actions">
          <button type="button" className="primary-btn" onClick={onResume}>
            Resume
          </button>
          <button type="button" className="ghost-btn" onClick={onRestart}>
            Restart level (R)
          </button>
          <button type="button" className="ghost-btn" onClick={onLevels}>
            Level select
          </button>
        </div>
        <SettingsPanel settings={settings} onChange={onSettings} />
      </div>
    </div>
  )
}

export function LevelCompleteOverlay({
  level,
  levelCount,
  timeMs,
  deaths,
  bestMs,
  noDeath,
  onNext,
  onReplay,
  onLevels,
}: {
  level: number
  levelCount: number
  timeMs: number
  deaths: number
  bestMs: number | null
  noDeath: boolean
  onNext: () => void
  onReplay: () => void
  onLevels: () => void
}) {
  const isLast = level >= levelCount
  return (
    <div className="game-overlay" role="dialog" aria-modal="true" aria-label="Level complete">
      <div className="overlay-panel overlay-panel-sm">
        <p className="overlay-kicker">Level {level} cleared</p>
        <h2 className="overlay-title">{isLast ? 'Game complete.' : 'About time.'}</h2>
        <div className="stat-row">
          <div className="stat">
            <span className="stat-label">Time</span>
            <span className="stat-value">{formatTime(timeMs)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Deaths</span>
            <span className="stat-value">{deaths}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Best</span>
            <span className="stat-value">{bestMs != null ? formatTime(Math.min(bestMs, timeMs)) : formatTime(timeMs)}</span>
          </div>
        </div>
        {noDeath && <p className="flawless">★ Flawless clear - not a single death.</p>}
        <div className="overlay-actions">
          {!isLast && (
            <button type="button" className="primary-btn" onClick={onNext}>
              Next level
            </button>
          )}
          <button type="button" className="ghost-btn" onClick={onReplay}>
            Replay
          </button>
          <button type="button" className="ghost-btn" onClick={onLevels}>
            Level select
          </button>
        </div>
      </div>
    </div>
  )
}

export function GameCompleteOverlay({
  title,
  totalDeaths,
  clearedLevels,
  totalLevels,
  bestLabel,
  onReplay,
  onLevels,
  onShare,
  shareLabel,
}: {
  title: string
  totalDeaths: number
  clearedLevels: number
  totalLevels: number
  bestLabel: string
  onReplay: () => void
  onLevels: () => void
  onShare: () => void
  shareLabel: string
}) {
  return (
    <div className="game-overlay game-overlay-final" role="dialog" aria-modal="true" aria-label="Game complete">
      <div className="overlay-panel">
        <p className="overlay-kicker">Victory</p>
        <h2 className="overlay-title overlay-title-xl">{title} - FINISHED</h2>
        <p className="overlay-tagline">You survived all {totalLevels} levels. The traps are taking it personally.</p>
        <div className="stat-row">
          <div className="stat">
            <span className="stat-label">Levels</span>
            <span className="stat-value">
              {clearedLevels}/{totalLevels}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Total deaths</span>
            <span className="stat-value">{totalDeaths}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Best clear</span>
            <span className="stat-value">{bestLabel}</span>
          </div>
        </div>
        <div className="overlay-actions">
          <button type="button" className="primary-btn" onClick={onReplay}>
            Play again
          </button>
          <button type="button" className="ghost-btn" onClick={onLevels}>
            Level select
          </button>
          <button type="button" className="ghost-btn" onClick={onShare}>
            {shareLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
