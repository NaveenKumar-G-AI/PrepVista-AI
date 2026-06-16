'use client';

import { useEffect } from 'react';

export function AmbientEffects() {
  useEffect(() => {
    const root = document.documentElement;
    let rafId = 0;
    let isHidden = document.hidden;

    // ── Core updater ──────────────────────────────────────────────────────────
    const updatePointer = (x: number, y: number) => {
      root.style.setProperty('--cursor-x', `${x}px`);
      root.style.setProperty('--cursor-y', `${y}px`);
    };

    // Park glow off-screen helper
    const parkGlow = () => {
      cancelAnimationFrame(rafId);
      updatePointer(-200, -200);
    };

    // ── Reduced-motion guard (WCAG 2.1 SC 2.3.3) ─────────────────────────────
    // Check at mount AND listen for live OS-level changes (e.g. user toggles
    // accessibility setting while the app is open).
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleMqlChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        parkGlow();
      } else {
        updatePointer(window.innerWidth / 2, 120);
      }
    };

    // Apply immediately at mount
    if (mql.matches) {
      parkGlow();
    } else {
      updatePointer(window.innerWidth / 2, 120);
    }

    // Live listener — fires if user changes OS motion setting mid-session
    mql.addEventListener('change', handleMqlChange);

    // ── Move handler (pointer events = mouse + touch + stylus) ────────────────
    const handleMove = (event: PointerEvent | MouseEvent) => {
      if (isHidden || mql.matches) return;
      cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        if (isHidden || mql.matches) return;
        updatePointer(event.clientX, event.clientY);
      });
    };

    // ── Tap / pointerdown handler ─────────────────────────────────────────────
    // pointermove only fires during a drag; a quick tap never updates position.
    // This snaps the glow to the tap point on any press.
    const handleDown = (event: PointerEvent | MouseEvent) => {
      if (isHidden || mql.matches) return;
      cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        if (isHidden || mql.matches) return;
        updatePointer(event.clientX, event.clientY);
      });
    };

    // ── Leave / cancel handler ────────────────────────────────────────────────
    // pointerleave on document is more reliable than mouseleave on window
    // across all pointer types and browser/OS combinations.
    const handleLeave = () => parkGlow();

    // ── pointercancel handler ─────────────────────────────────────────────────
    // Fires when the OS interrupts a gesture (incoming call, palm rejection,
    // focus loss). Without this the glow freezes at the last position forever.
    const handleCancel = () => parkGlow();

    // ── Tab visibility handler ────────────────────────────────────────────────
    // Pause RAF while the tab is backgrounded — saves CPU across all devices
    // in a 500-concurrent-user session where students multitask constantly.
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isHidden = true;
        cancelAnimationFrame(rafId);
      } else {
        isHidden = false;
        if (!mql.matches) {
          updatePointer(window.innerWidth / 2, 120);
        }
      }
    };

    // ── Register listeners ────────────────────────────────────────────────────
    const supportsPointer = 'PointerEvent' in window;

    if (supportsPointer) {
      // Modern path: covers mouse, touch, and stylus uniformly.
      window.addEventListener('pointermove', handleMove as unknown as EventListener, { passive: true });
      window.addEventListener('pointerdown', handleDown as unknown as EventListener, { passive: true });
      window.addEventListener('pointercancel', handleCancel, { passive: true });
      document.addEventListener('pointerleave', handleLeave);
    } else {
      // Legacy fallback: mouse-only for browsers without Pointer Events.
      window.addEventListener('mousemove', handleMove as unknown as EventListener, { passive: true });
      window.addEventListener('mouseleave', handleLeave);

      // touchend fallback: on legacy browsers that support touch but not
      // Pointer Events, park the glow when the finger lifts so it doesn't
      // freeze at the last touch coordinate.
      window.addEventListener('touchend', handleLeave, { passive: true });
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      mql.removeEventListener('change', handleMqlChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (supportsPointer) {
        window.removeEventListener('pointermove', handleMove as unknown as EventListener);
        window.removeEventListener('pointerdown', handleDown as unknown as EventListener);
        window.removeEventListener('pointercancel', handleCancel);
        document.removeEventListener('pointerleave', handleLeave);
      } else {
        window.removeEventListener('mousemove', handleMove as unknown as EventListener);
        window.removeEventListener('mouseleave', handleLeave);
        window.removeEventListener('touchend', handleLeave);
      }
    };
  }, []);

  return (
    <>
      <div className="ambient-backdrop" aria-hidden="true" />
      <div className="ambient-grid" aria-hidden="true" />
      <div className="ambient-cursor" aria-hidden="true" />
    </>
  );
}