import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./api/AuthContext.js";
import LoginPage from "./pages/LoginPage.js";
import CompanyListPage from "./pages/CompanyListPage.js";
import CompanyDossierPage from "./pages/CompanyDossierPage.js";
import FollowupsPage from "./pages/FollowupsPage.js";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-ink-soft">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Router() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/companies"
        element={
          <RequireAuth>
            <CompanyListPage />
          </RequireAuth>
        }
      />
      <Route
        path="/companies/:id"
        element={
          <RequireAuth>
            <CompanyDossierPage />
          </RequireAuth>
        }
      />
      <Route
        path="/followups"
        element={
          <RequireAuth>
            <FollowupsPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/companies" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
