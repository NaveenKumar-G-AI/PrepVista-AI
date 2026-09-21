import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Layout() {
  const { student, logout } = useAuth();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm px-1 pb-3 -mb-px border-b-2 ${isActive ? "border-ink text-ink" : "border-transparent text-ink-faint hover:text-ink-soft"}`;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-paper-raised">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="py-4 text-xs uppercase tracking-[0.2em] text-ink-faint">ACEAPT</span>
            <nav className="flex gap-6">
              <NavLink to="/" end className={linkClass}>
                Mastery map
              </NavLink>
              <NavLink to="/reviews" className={linkClass}>
                Review queue
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4 py-3">
            {student && <span className="text-sm text-ink-soft">{student.name}</span>}
            <button onClick={logout} className="text-xs uppercase tracking-wide text-ink-faint hover:text-ink-soft">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
