'use client'

import { formatTime } from '@/lib/game/math'
import type { GameRecord } from '@/lib/game/storage'

export function LevelSelect({
  slug,
  levelCount,
  record,
  currentLevel,
  onSelect,
  onClose,
  onReset,
}: {
  slug: string
  levelCount: number
  record: GameRecord
  currentLevel: number
  onSelect: (level: number) => void
  onClose: () => void
  onReset: () => void
}) {
  void slug
  const levels = Array.from({ length: levelCount }, (_, i) => i + 1)

  return (
    <div className="game-overlay" role="dialog" aria-modal="true" aria-label="Level select">
      <div className="overlay-panel level-panel">
        <div className="overlay-head">
          <div>
            <p className="overlay-kicker">Level select</p>
            <h2 className="overlay-title">Pick your poison</h2>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose} aria-label="Close level select">
            ✕
          </button>
        </div>
        <div className="level-grid">
          {levels.map((level) => {
            const stat = record.levels[String(level)] ?? {}
            const unlocked = level <= record.unlocked
            const completed = Boolean(stat.completed)
            return (
              <button
                key={level}
                type="button"
                className={`level-tile${completed ? ' is-done' : ''}${!unlocked ? ' is-locked' : ''}${level === currentLevel ? ' is-current' : ''}`}
                disabled={!unlocked}
                onClick={() => unlocked && onSelect(level)}
                aria-label={`Level ${level}${unlocked ? '' : ' locked'}`}
              >
                <span className="level-num">{level}</span>
                <span className="level-meta">
                  {completed ? (
                    <>
                      <span className="level-deaths" title="Deaths">☠ {stat.deaths ?? 0}</span>
                      {stat.bestMs != null && <span className="level-best" title="Best time">{formatTime(stat.bestMs)}</span>}
                    </>
                  ) : unlocked ? (
                    <span className="level-best">Not cleared</span>
                  ) : (
                    <span className="level-best">Locked</span>
                  )}
                </span>
                {stat.noDeath && <span className="level-badge" title="No-death clear">★</span>}
              </button>
            )
          })}
        </div>
        <div className="overlay-foot">
          <button type="button" className="danger-btn" onClick={onReset}>
            Reset this game&rsquo;s progress
          </button>
          <p className="overlay-hint">Progress saves automatically in your browser.</p>
        </div>
      </div>
    </div>
  )
}
