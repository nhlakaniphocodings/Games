'use client'

import { useSave } from '@/lib/game/use-progress'

export function CollectionStats() {
  const save = useSave()
  let deaths = 0
  let completed = 0
  let noDeath = 0
  let started = 0
  for (const g of Object.values(save.games)) {
    deaths += g.totalDeaths
    let gameCleared = false
    for (const l of Object.values(g.levels)) {
      if (l.completed) {
        completed += 1
        gameCleared = true
      }
      if (l.noDeath) noDeath += 1
    }
    if (gameCleared || g.unlocked > 1) started += 1
  }

  return (
    <div className="catalog-stats" aria-label="Your progress">
      <div className="catalog-stat">
        <b>{completed}</b>
        <span>Levels cleared</span>
      </div>
      <div className="catalog-stat">
        <b>{deaths}</b>
        <span>Total deaths</span>
      </div>
      <div className="catalog-stat">
        <b>{noDeath}</b>
        <span>Flawless clears</span>
      </div>
      <div className="catalog-stat">
        <b>{started}/10</b>
        <span>Games started</span>
      </div>
      <p className="catalog-spacer" style={{ color: '#8b86a0', fontSize: 12, margin: 0 }}>
        Progress saves in this browser.
      </p>
    </div>
  )
}
