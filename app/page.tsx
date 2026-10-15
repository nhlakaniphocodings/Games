import Link from 'next/link'
import { ArrowDown, ArrowUpRight, Play } from 'lucide-react'
import { GameCard } from '@/components/game-card'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { games } from '@/lib/games'

export default function Page() {
  return <div className="site-shell"><SiteHeader /><main>
    <section className="hero container"><div className="hero-copy"><p className="kicker"><span className="live-dot" /> Your next session starts here</p><h1>PLAY<br /><em>WITHOUT</em><br />LIMITS.</h1><p className="hero-intro">A focused collection of browser games built for quick escapes, deep focus, and everything in between.</p><div className="hero-actions"><Link href="/games" className="button button-primary">Explore games <ArrowUpRight data-icon="inline-end" /></Link><a href="#featured" className="text-link">Scroll to discover <ArrowDown data-icon="inline-end" /></a></div></div><div className="hero-orbit" aria-hidden="true"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-core"><span>X</span><small>GAMES</small></div><div className="orbit-label label-one">10 / GAMES</div><div className="orbit-label label-two">PLAY / NOW</div></div></section>
    <section className="ticker" aria-label="X Games features"><div className="ticker-track"><span>NO DOWNLOADS</span><i /> <span>NO DISTRACTIONS</span><i /> <span>JUST PLAY</span><i /> <span>NO DOWNLOADS</span><i /> <span>NO DISTRACTIONS</span><i /> <span>JUST PLAY</span></div></section>
    <section id="featured" className="section container"><div className="section-heading"><div><p className="kicker">01 / The collection</p><h2>Pick your<br /><span>next game.</span></h2></div><Link href="/games" className="text-link">View all games <ArrowUpRight data-icon="inline-end" /></Link></div><div className="featured-grid">{games.slice(0, 3).map((game, index) => <GameCard key={game.slug} game={game} featured={index === 0} />)}</div></section>
    <section className="manifesto"><div className="container manifesto-inner"><p className="kicker">02 / Why X Games</p><h2>Small moments.<br /><span>Big energy.</span></h2><div className="manifesto-copy"><p>X Games is a browser-based gaming platform made to get you playing faster. No installs, no accounts, no noise — just a growing lineup of games ready when you are.</p><Link href="/about" className="button button-outline">About X Games <ArrowUpRight data-icon="inline-end" /></Link></div></div></section>
  </main><SiteFooter /></div>
}
