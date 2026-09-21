import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api, getToken, setToken, type Student } from "../api/client";

interface AuthContextValue {
  student: Student | null;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<Student | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Restore a session from a previously-stored token (e.g. after a page
  // reload) by asking the server who it belongs to, rather than trusting
  // any cached profile data - a token that's since expired or been revoked
  // correctly falls back to logged-out.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsReady(true);
      return;
    }
    api
      .me()
      .then((res) => setStudent(res.student))
      .catch(() => setToken(null))
      .finally(() => setIsReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    setToken(res.token);
    setStudent(res.student);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const res = await api.register({ email, password, name });
    setToken(res.token);
    setStudent(res.student);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setStudent(null);
  }, []);

  return <AuthContext.Provider value={{ student, isReady, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
