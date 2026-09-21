import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Today', end: true },
  { to: '/opportunities', label: 'Opportunities' },
  { to: '/applications', label: 'Applications' },
  { to: '/followups', label: 'Follow-ups' },
  { to: '/insights', label: 'Insights' },
];

export default function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 border-b border-border-soft bg-paper/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <NavLink to="/" className="flex items-baseline gap-2 shrink-0">
              <span className="font-heading font-bold text-lg tracking-tight text-ink">ACEAPT</span>
              <span className="font-mono text-[11px] text-ink-faint hidden sm:inline">Feature 39 -- Opportunity Strategy</span>
            </NavLink>
          </div>
          <nav className="flex gap-1 -mb-px overflow-x-auto no-scrollbar">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `whitespace-nowrap px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isActive ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  );
}
