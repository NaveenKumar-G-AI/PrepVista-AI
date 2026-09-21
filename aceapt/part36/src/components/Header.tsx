"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useUser } from "@/lib/userContext";

const NAV = [
  { href: "/today", label: "Today" },
  { href: "/plan", label: "Plan" },
  { href: "/time-budget", label: "Time Budget" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/graph", label: "Graph" },
  { href: "/review", label: "Review" },
  { href: "/health", label: "Health" },
];

export default function Header() {
  const pathname = usePathname();
  const { user, logout } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);

  // Focus mode: the active session screen goes distraction-free, no
  // chrome at all (spec section 16 — this is the one place deep,
  // uninterrupted work is meant to happen).
  if (pathname?.startsWith("/session/")) return null;
  if (pathname === "/login" || !user) return null;

  return (
    <header className="border-b border-hairline bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/today" className="font-display text-lg font-semibold tracking-tight text-ink">
          ACEAPT <span className="tnum text-xs font-normal text-ink-faint align-top">F36</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
                  active ? "text-ink font-medium border-b-2 border-brass" : "text-ink-muted hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <span className="text-sm text-ink-muted">{user.name}</span>
          <button
            onClick={() => logout()}
            className="rounded-sm border border-hairline px-3 py-1.5 text-sm text-ink-muted hover:border-hairline-strong hover:text-ink"
          >
            Sign out
          </button>
        </div>

        <button
          className="flex h-8 w-8 items-center justify-center text-ink md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {menuOpen && (
        <nav className="border-t border-hairline px-4 py-2 md:hidden">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`block rounded-sm px-2 py-2.5 text-sm ${active ? "font-medium text-ink" : "text-ink-muted"}`}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2">
            <span className="text-sm text-ink-muted">{user.name}</span>
            <button onClick={() => logout()} className="text-sm text-ink-muted underline underline-offset-2">
              Sign out
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
