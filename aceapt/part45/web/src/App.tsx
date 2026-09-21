import { useMemo, useState } from 'react';
import { GraduationCap, LayoutGrid, Shield, Smartphone } from 'lucide-react';
import { createSkillGraphClient } from './api/skillGraphClient';
import { SkillMapOverview } from './components/SkillMapOverview';
import { SkillCategoryDrilldown } from './components/SkillCategoryDrilldown';
import { SkillDetailPanel } from './components/SkillDetailPanel';
import { MobileSkillPathView } from './components/MobileSkillPathView';
import { AdminSkillGraphConsole } from './components/AdminSkillGraphConsole';

type Tab = 'map' | 'mobile-preview' | 'admin';

const DEMO_STUDENT_ID = 'student_demo_1';

export default function App() {
  const [tab, setTab] = useState<Tab>('map');
  const [domain, setDomain] = useState<string | null>(null);
  const [openSkillCode, setOpenSkillCode] = useState<string | null>(null);
  const [mobilePreviewCode, setMobilePreviewCode] = useState('QUANT.PROBABILITY');

  const studentClient = useMemo(() => createSkillGraphClient(`${DEMO_STUDENT_ID}:student`), []);
  const adminClient = useMemo(() => createSkillGraphClient('admin_1:admin'), []);

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="skill-code">ACEAPT · FEATURE 45</p>
          <h1 className="font-display text-xl font-bold text-ink">Aptitude Skill Graph</h1>
        </div>
      </header>

      <nav aria-label="Sections" className="mb-6 flex gap-1 rounded-full border border-line bg-white/60 p-1 text-sm">
        <TabButton active={tab === 'map'} onClick={() => setTab('map')} icon={<LayoutGrid size={14} />} label="My skill map" />
        <TabButton active={tab === 'mobile-preview'} onClick={() => setTab('mobile-preview')} icon={<Smartphone size={14} />} label="Mobile path" />
        <TabButton active={tab === 'admin'} onClick={() => setTab('admin')} icon={<Shield size={14} />} label="Admin" />
      </nav>

      {tab === 'map' && !domain && (
        <SkillMapOverview client={studentClient} studentId={DEMO_STUDENT_ID} onOpenSkill={setOpenSkillCode} onExploreDomain={setDomain} />
      )}

      {tab === 'map' && domain && (
        <SkillCategoryDrilldown client={studentClient} studentId={DEMO_STUDENT_ID} domain={domain} onBack={() => setDomain(null)} onOpenSkill={setOpenSkillCode} />
      )}

      {tab === 'mobile-preview' && (
        <div>
          <label htmlFor="mobile-skill-picker" className="mb-2 block text-xs font-medium text-ink-soft">
            Preview a skill's path view
          </label>
          <select
            id="mobile-skill-picker"
            value={mobilePreviewCode}
            onChange={(e) => setMobilePreviewCode(e.target.value)}
            className="mb-4 w-full rounded-card border border-line bg-white px-3 py-2 text-sm"
          >
            <option value="QUANT.PROBABILITY">Probability</option>
            <option value="QUANT.DATA_INTERPRETATION">Data Interpretation</option>
            <option value="LOGIC.PUZZLE_REASONING">Puzzle Reasoning</option>
            <option value="VERBAL.READING_COMPREHENSION">Reading Comprehension</option>
          </select>
          <div className="rounded-card border border-line bg-white/40 p-4">
            <MobileSkillPathView client={studentClient} studentId={DEMO_STUDENT_ID} skillCode={mobilePreviewCode} onOpenSkill={setMobilePreviewCode} />
          </div>
        </div>
      )}

      {tab === 'admin' && (
        <div>
          <div className="mb-4 flex items-center gap-1.5 rounded-card border border-line bg-white/60 px-3 py-2 text-xs text-ink-soft">
            <GraduationCap size={14} /> Signed in as <span className="font-mono">admin_1</span> (role: admin) — students cannot reach this view.
          </div>
          <AdminSkillGraphConsole client={adminClient} />
        </div>
      )}

      {openSkillCode && <SkillDetailPanel client={studentClient} studentId={DEMO_STUDENT_ID} skillCode={openSkillCode} onClose={() => setOpenSkillCode(null)} onOpenSkill={setOpenSkillCode} />}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 font-medium transition ${active ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'}`}
    >
      {icon} {label}
    </button>
  );
}
