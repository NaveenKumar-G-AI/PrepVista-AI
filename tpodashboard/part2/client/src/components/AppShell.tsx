import type { FC, ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Building2, ListChecks, LogOut } from "lucide-react";
import { useAuth } from "../api/AuthContext.js";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? "bg-harbor text-white" : "text-ink-soft hover:bg-paper hover:text-ink"
  }`;

export const AppShell: FC<{ children: ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-ink-faint">PrepVista</p>
              <p className="font-display text-base font-medium leading-tight text-ink">Companies &amp; Recruiters</p>
            </div>
            <nav className="flex items-center gap-1" aria-label="Primary">
              <NavLink to="/companies" className={navLinkClass}>
                <Building2 size={16} /> Companies
              </NavLink>
              <NavLink to="/followups" className={navLinkClass}>
                <ListChecks size={16} /> Follow-ups
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-soft">{user?.userName}</span>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-paper hover:text-ink"
            >
              <LogOut size={15} /> Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
};
