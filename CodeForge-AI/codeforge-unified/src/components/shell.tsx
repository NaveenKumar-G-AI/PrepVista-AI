'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Braces, LayoutDashboard, Code2, BookOpen, Wrench, FolderKanban, Radio, MessagesSquare, ChartNoAxesCombined, Settings2, Menu, X, ArrowUpRight } from 'lucide-react';
import { useWorkspace } from '@/lib/state';
import { BrandLogo } from './brand-logo';
import { ThemeToggle } from './theme-toggle';
export const navigation = [
  { href: '/', label: 'Workspace', icon: LayoutDashboard }, { href: '/practice', label: 'Coding practice', icon: Code2 },
  { href: '/diagnostic', label: 'Reasoning checks', icon: Braces }, { href: '/learn', label: 'Concept library', icon: BookOpen }, { href: '/debug', label: 'Debug & review', icon: Wrench },
  { href: '/projects', label: 'Build a project', icon: FolderKanban }, { href: '/incidents', label: 'Incident lab', icon: Radio },
  { href: '/interview', label: 'Technical interview', icon: MessagesSquare }, { href: '/progress', label: 'My growth', icon: ChartNoAxesCombined },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const [open, setOpen] = useState(false); const { ready, warning } = useWorkspace();
  const active = navigation.find(n => n.href === path)?.label ?? (path.startsWith('/practice/') ? 'Coding practice' : 'Workspace');
  return <div className="app-shell"><a className="skip-link" href="#main">Skip to workspace</a>
    <aside className={`sidebar ${open ? 'is-open' : ''}`}><Link href="/" className="brand" aria-label="PrepVista coding workspace" onClick={() => setOpen(false)}><BrandLogo /></Link>
      <button className="icon-button mobile-close" aria-label="Close navigation" onClick={() => setOpen(false)}><X/></button>
      <div className="nav-caption">YOUR WORKSPACE</div><nav aria-label="Main navigation">{navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${path === href || (href === '/practice' && path.startsWith('/practice/')) ? 'active' : ''}`} aria-current={path === href ? 'page' : undefined} onClick={() => setOpen(false)}><Icon size={18}/>{label}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="practice-note"><span className="tiny-dot"/> A little practice, every day.<p>Understand the why.<br/>Then write the how.</p><Link href="/practice" onClick={() => setOpen(false)}>Start a session <ArrowUpRight size={15}/></Link></div><Link className="nav-link" href="/settings" onClick={() => setOpen(false)}><Settings2 size={18}/>Workspace settings</Link><div className="local-label">LOCAL WORKSPACE <span>v1.0</span></div></div>
    </aside>
    {open && <button aria-label="Dismiss navigation" className="nav-scrim" onClick={() => setOpen(false)}/>}
    <div className="app-body"><header className="topbar"><div className="breadcrumb"><button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={20}/></button><Link href="/" className="mobile-brand" aria-label="PrepVista coding workspace"><BrandLogo compact /></Link><span className="desktop-brand-label">PrepVista</span><span>/</span><strong>{path === '/settings' ? 'Settings' : active}</strong></div><div className="topbar-actions"><div className="session-label"><span className="tiny-dot"/> Personal learning space</div><ThemeToggle /></div></header>
      <main id="main" tabIndex={-1}>{warning && <div className="notice" role="status">{warning}</div>}{ready ? children : <div className="loading-screen" role="status">Opening your workspace…</div>}</main><footer>Your work stays in this browser. <Link href="/settings">Back up your progress</Link><span>PrepVista · Think. Build. Improve.</span></footer>
    </div></div>;
}
