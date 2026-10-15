import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'

export default function AboutPage() {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="container page-main about-page">
        <div className="page-intro">
          <p className="kicker">02 / About</p>
          <h1>
            Play the
            <br />
            <em>moment.</em>
          </h1>
        </div>
        <div className="about-layout">
          <div className="about-statement">
            <span className="statement-mark">X</span>
            <p>X Games is a browser-based gaming platform. A central place to find and play games directly in your browser, whenever the moment calls for it.</p>
          </div>
          <div className="about-detail">
            <p>Ten original, brutally difficult games live here now — built to be easy to start and hard to put down. Every trap is deterministic, every death is a lesson, and every level can be beaten.</p>
            <p>No installs, no accounts, no noise. Your progress is saved locally in this browser.</p>
            <p className="footer-meta" style={{ marginBottom: 20 }}>Developed by X Spark.</p>
            <Link href="/games" className="button button-primary">
              Browse the games <ArrowUpRight data-icon="inline-end" />
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
