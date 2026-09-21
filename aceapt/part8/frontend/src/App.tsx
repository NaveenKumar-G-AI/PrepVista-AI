import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { RequireAuth } from "./components/RequireAuth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { MasteryMapPage } from "./pages/MasteryMapPage";
import { SkillDetailPage } from "./pages/SkillDetailPage";
import { ReviewQueuePage } from "./pages/ReviewQueuePage";
import { VerificationSessionPage } from "./pages/VerificationSessionPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<MasteryMapPage />} />
          <Route path="/skills/:skillId" element={<SkillDetailPage />} />
          <Route path="/reviews" element={<ReviewQueuePage />} />
        </Route>
        {/* Verification runs full-bleed, outside the standard nav Layout,
            so the "switch into verification mode" framing (spec section 29)
            isn't undercut by ordinary chrome sitting on top of it. */}
        <Route
          path="/verify/:attemptId"
          element={
            <RequireAuth>
              <VerificationSessionPage />
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
