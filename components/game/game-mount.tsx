'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getGameModule } from '@/lib/game/registry'
import { GameShell } from './game-shell'

export function GameMount({ slug }: { slug: string }) {
  const mod = getGameModule(slug)
  if (!mod) {
    return (
      <div className="game-unavailable">
        <p className="kicker">In development</p>
        <h2>This game is being built.</h2>
        <p>The cartridge is still being manufactured. Check back shortly.</p>
        <Link href="/games" className="button button-outline">
          <ArrowLeft data-icon="inline-start" /> Back to all games
        </Link>
      </div>
    )
  }
  return <GameShell module={mod} />
}
