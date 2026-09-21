import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { student, isReady } = useAuth();
  if (!isReady) return <div className="min-h-screen flex items-center justify-center text-sm text-ink-faint">Loading...</div>;
  if (!student) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
