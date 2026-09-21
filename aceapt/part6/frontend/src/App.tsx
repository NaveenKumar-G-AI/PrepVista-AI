import { useState } from 'react';
import { Home } from './pages/Home';
import { TakeAssessment } from './pages/TakeAssessment';
import { Result } from './pages/Result';
import { History } from './pages/History';

type View =
  | { name: 'home' }
  | { name: 'exam'; assessmentId: string }
  | { name: 'result'; assessmentId: string }
  | { name: 'history' };

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' });

  const isExam = view.name === 'exam';

  return (
    <div className={`app-shell ${isExam ? 'mode-exam' : 'mode-report'}`}>
      {view.name === 'home' && (
        <Home
          onStart={(assessmentId) => setView({ name: 'exam', assessmentId })}
          onViewHistory={() => setView({ name: 'history' })}
          onViewResult={(assessmentId) => setView({ name: 'result', assessmentId })}
        />
      )}
      {view.name === 'exam' && (
        <TakeAssessment
          assessmentId={view.assessmentId}
          onSubmitted={(assessmentId) => setView({ name: 'result', assessmentId })}
          onExit={() => setView({ name: 'home' })}
        />
      )}
      {view.name === 'result' && (
        <Result
          assessmentId={view.assessmentId}
          onBackToStart={() => setView({ name: 'home' })}
          onViewHistory={() => setView({ name: 'history' })}
        />
      )}
      {view.name === 'history' && (
        <History onBack={() => setView({ name: 'home' })} onOpen={(assessmentId) => setView({ name: 'result', assessmentId })} />
      )}
    </div>
  );
}
