'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  { href: '/',            label: 'Tonight',     icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { href: '/turf-wars',   label: 'Turf Wars',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 22L10 2l8 20"/><path d="M6 14h8"/></svg> },
  { href: '/drops',       label: 'Drops',       icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
  { href: '/ambassador',  label: 'Ambassador',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
  { href: '/account',     label: 'Account',     icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
]

export default function BottomNav() {
  const path = usePathname()
  return (
    <nav className="nav">
      {items.map(item => (
        <Link key={item.href} href={item.href}
          className={`nav-item ${path === item.href ? 'active' : ''}`}>
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
