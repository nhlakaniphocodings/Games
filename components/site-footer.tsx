import Link from 'next/link'

export function SiteFooter() {
  return <footer className="site-footer"><div className="container footer-inner"><Link href="/" className="brand"><span className="brand-mark">X</span><span className="brand-name">GAMES</span></Link><p>Browser-based games, made for the moment.</p><div className="footer-links"><Link href="/games">Games</Link><Link href="/about">About</Link></div><span className="footer-meta">© 2026 X Games · Developed by X Spark</span></div></footer>
}
