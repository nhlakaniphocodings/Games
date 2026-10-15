'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { progress, type GameRecord, type SaveData, type Settings } from './storage'

/** Subscribe a component to the whole save file. */
export function useSave(): SaveData {
  return useSyncExternalStore(
    progress.subscribe,
    progress.getSnapshot,
    progress.getServerSnapshot,
  )
}

export function useSettings(): Settings {
  return useSave().settings
}

export function useGameRecord(slug: string): GameRecord {
  const save = useSave()
  return save.games[slug] ?? { unlocked: 1, levels: {}, totalDeaths: 0 }
}

/** Stable action helpers (the store itself never changes identity). */
export function useProgressActions() {
  return useCallback(() => progress, [])()
}
