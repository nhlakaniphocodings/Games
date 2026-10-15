import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { GameMount } from '@/components/game/game-mount'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { games, getGame } from '@/lib/games'

export function generateStaticParams() {
  return games.map((game) => ({ slug: game.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const game = getGame(slug)
  if (!game) return {}
  return {
    title: `${game.title} — X Games`,
    description: game.description,
  }
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const game = getGame(slug)
  if (!game) notFound()
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="container game-page">
        <Link href="/games" className="back-link">
          <ArrowLeft data-icon="inline-start" /> Back to all games
        </Link>
        <div className="game-page-heading">
          <p className="kicker">
            {game.number} / {game.category}
          </p>
          <h1>{game.title}</h1>
          <p>{game.description}</p>
        </div>
        <GameMount slug={game.slug} />
      </main>
      <SiteFooter />
    </div>
  )
}
