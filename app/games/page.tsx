import { GameCard } from '@/components/game-card'
import { CollectionStats } from '@/components/game/collection-stats'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { games } from '@/lib/games'

export default function GamesPage() {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="container page-main">
        <div className="page-intro">
          <p className="kicker">01 / The collection</p>
          <h1>
            All games.
            <br />
            <em>One place.</em>
          </h1>
          <p>Choose a game and make the next few minutes yours.</p>
        </div>
        <CollectionStats />
        <div className="catalogue-grid">
          {games.map((game) => (
            <GameCard key={game.slug} game={game} />
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
