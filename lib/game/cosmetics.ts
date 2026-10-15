import { progress } from './storage'

export type CosmeticType = 'trail' | 'skin' | 'death' | 'victory'

export interface Cosmetic {
  id: string
  name: string
  type: CosmeticType
  hint: string
}

/** Cosmetic rewards are purely visual — never affect difficulty. */
export const COSMETICS: Cosmetic[] = [
  { id: 'trail-violet', name: 'Violet Trail', type: 'trail', hint: 'Clear any level without dying.' },
  { id: 'trail-ember', name: 'Ember Trail', type: 'trail', hint: 'Clear 3 levels without dying.' },
  { id: 'skin-ghost', name: 'Ghost Skin', type: 'skin', hint: 'Finish an entire game.' },
  { id: 'death-confetti', name: 'Confetti Death', type: 'death', hint: 'Reach 50 total deaths.' },
  { id: 'victory-crown', name: 'Victory Crown', type: 'victory', hint: 'Clear 25 levels in total.' },
  { id: 'skin-void', name: 'Void Skin', type: 'skin', hint: 'Clear 5 levels without dying.' },
]

/**
 * Evaluate achievements against current progress and unlock any new cosmetics.
 * Returns the newly unlocked cosmetics so the UI can celebrate.
 */
export function awardCosmetics(gameLevelCount: number): Cosmetic[] {
  const totals = progress.totals()
  const state = progress.getSnapshot()
  const owned = new Set(state.cosmetics)
  const want: string[] = []

  if (totals.noDeath >= 1) want.push('trail-violet')
  if (totals.noDeath >= 3) want.push('trail-ember')
  if (totals.noDeath >= 5) want.push('skin-void')
  if (totals.deaths >= 50) want.push('death-confetti')
  if (totals.completed >= 25) want.push('victory-crown')
  if (gameLevelCount > 0) {
    let fullyDone = false
    for (const [slug, rec] of Object.entries(state.games)) {
      void slug
      const done = Object.values(rec.levels).filter((l) => l.completed).length
      if (done >= gameLevelCount) fullyDone = true
    }
    if (fullyDone) want.push('skin-ghost')
  }

  const newly: Cosmetic[] = []
  for (const id of want) {
    if (!owned.has(id)) {
      progress.unlockCosmetic(id)
      const c = COSMETICS.find((x) => x.id === id)
      if (c) newly.push(c)
    }
  }
  return newly
}
