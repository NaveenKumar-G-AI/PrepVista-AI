import { NavLink, Route, HashRouter, Routes } from "react-router-dom";
import { StudentIdGate } from "./components/shared/StudentIdGate";
import { clearStudentId } from "./lib/api";
import ReadinessPage from "./pages/ReadinessPage";
import SimulationInstructionsPage from "./pages/SimulationInstructionsPage";
import SimulationRunnerPage from "./pages/SimulationRunnerPage";
import ResultPage from "./pages/ResultPage";
import PostmortemPage from "./pages/PostmortemPage";
import HistoryPage from "./pages/HistoryPage";

function TopBar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm px-3 py-1.5 rounded-md transition-colors ${
      isActive ? "text-paper-100 bg-ink-700" : "text-paper-500 hover:text-paper-300"
    }`;

  return (
    <header className="border-b hairline sticky top-0 z-20 backdrop-blur bg-ink-900/90">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-baseline gap-2">
            <span className="font-display font-semibold text-paper-100 text-sm tracking-tight">ACEAPT</span>
            <span className="label-caps">Readiness Engine</span>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              Readiness
            </NavLink>
            <NavLink to="/history" className={linkClass}>
              History
            </NavLink>
          </nav>
        </div>
        <button
          onClick={() => {
            clearStudentId();
            window.location.reload();
          }}
          className="label-caps hover:text-paper-300 transition-colors"
        >
          Switch student
        </button>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <StudentIdGate>
      <HashRouter>
        <TopBar />
        <main className="max-w-6xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<ReadinessPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/simulations/:id/instructions" element={<SimulationInstructionsPage />} />
            <Route path="/simulations/:id/run" element={<SimulationRunnerPage />} />
            <Route path="/simulations/:id/result" element={<ResultPage />} />
            <Route path="/simulations/:id/postmortem" element={<PostmortemPage />} />
          </Routes>
        </main>
      </HashRouter>
    </StudentIdGate>
  );
}
