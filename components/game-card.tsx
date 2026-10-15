import Link from 'next/link'
import { ArrowUpRight, Gamepad2 } from 'lucide-react'
import type { Game } from '@/lib/games'

export function GameCard({ game, featured = false }: { game: Game; featured?: boolean }) {
  return (
    <Link href={`/games/${game.slug}`} className={featured ? 'game-card featured' : 'game-card'} style={{ '--game-accent': game.accent } as React.CSSProperties}>
      <div className="game-art" aria-hidden="true"><span className="game-number">{game.number}</span><Gamepad2 /></div>
      <div className="game-card-content">
        <div><span className="eyebrow">{game.category}</span><h3>{game.title}</h3><p>{game.description}</p></div>
        <span className="card-arrow"><ArrowUpRight /></span>
      </div>
    </Link>
  )
}
