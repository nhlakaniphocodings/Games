'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowUpRight, Menu, X } from 'lucide-react'

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" onClick={() => setOpen(false)} aria-label="X Games home">
          <span className="brand-mark">X</span>
          <span className="brand-name">GAMES</span>
        </Link>
        <nav className={open ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">
          <Link href="/games" onClick={() => setOpen(false)}>Games</Link>
          <Link href="/about" onClick={() => setOpen(false)}>About</Link>
          <Link className="nav-cta" href="/games" onClick={() => setOpen(false)}>Play now <ArrowUpRight data-icon="inline-end" /></Link>
        </nav>
        <button className="menu-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
          {open ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  )
}
