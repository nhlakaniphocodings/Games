import type { GameModule } from './types'
import { game as xDevil } from '@/games/x-devil'
import { game as gravityFlip } from '@/games/gravity-flip'
import { game as liarUi } from '@/games/liar-ui'
import { game as controlChaos } from '@/games/control-chaos'
import { game as invisiblePath } from '@/games/invisible-path'
import { game as rhythmBetrayer } from '@/games/rhythm-betrayer'
import { game as mirrorTwins } from '@/games/mirror-twins'
import { game as oneScreenBoss } from '@/games/one-screen-boss'
import { game as shrinkingWorld } from '@/games/shrinking-world'
import { game as xDevilFinale } from '@/games/x-devil-finale'

/**
 * Central map of playable game modules keyed by slug.
 * The [slug] route resolves them here.
 */
export const gameModules: Record<string, GameModule> = {
  'x-devil': xDevil,
  'gravity-flip': gravityFlip,
  'liar-ui': liarUi,
  'control-chaos': controlChaos,
  'invisible-path': invisiblePath,
  'rhythm-betrayer': rhythmBetrayer,
  'mirror-twins': mirrorTwins,
  'one-screen-boss': oneScreenBoss,
  'shrinking-world': shrinkingWorld,
  'x-devil-finale': xDevilFinale,
}

export function getGameModule(slug: string): GameModule | undefined {
  return gameModules[slug]
}
