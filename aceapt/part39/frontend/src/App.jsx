import { HashRouter, Routes, Route } from 'react-router-dom';
import AppShell from './components/layout/AppShell.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import OpportunitiesPage from './pages/OpportunitiesPage.jsx';
import OpportunityDetailPage from './pages/OpportunityDetailPage.jsx';
import ApplicationsPage from './pages/ApplicationsPage.jsx';
import ApplicationWorkspacePage from './pages/ApplicationWorkspacePage.jsx';
import FollowUpsPage from './pages/FollowUpsPage.jsx';
import InsightsPage from './pages/InsightsPage.jsx';

export default function App() {
  return (
    <HashRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/opportunities" element={<OpportunitiesPage />} />
          <Route path="/opportunities/:id" element={<OpportunityDetailPage />} />
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/applications/:id" element={<ApplicationWorkspacePage />} />
          <Route path="/followups" element={<FollowUpsPage />} />
          <Route path="/insights" element={<InsightsPage />} />
        </Routes>
      </AppShell>
    </HashRouter>
  );
}
