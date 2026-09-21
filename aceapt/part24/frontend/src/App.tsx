import { useState } from 'react';
import { Dashboard } from './pages/Dashboard';
import { RecoveryFlow } from './pages/RecoveryFlow';

interface Selection {
  skillId: string;
  skillName: string;
}

function App() {
  const [selection, setSelection] = useState<Selection | null>(null);

  return (
    <div className="min-h-screen bg-ink font-body">
      {selection ? (
        <RecoveryFlow skillId={selection.skillId} skillName={selection.skillName} onDone={() => setSelection(null)} />
      ) : (
        <Dashboard onSelectSkill={(skillId, skillName) => setSelection({ skillId, skillName })} />
      )}
    </div>
  );
}

export default App;
