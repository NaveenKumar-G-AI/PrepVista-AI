import React, { useState } from 'react';
import { AlignDashboard } from '../src/components/align/AlignDashboard';
import { TargetDetailPage } from '../src/components/align/TargetDetailPage';
import { TpoAlignmentOverview } from '../src/components/align/TpoAlignmentOverview';
import {
  ALL_RESULTS,
  AWAITING_EVIDENCE,
  COHORT,
  DATA_ANALYST,
  EXPLANATION,
  HISTORY,
  SHORTLIST,
  SOFTWARE_DEVELOPER,
  TOP_COHORT_GAPS,
} from './mockData';

type View = 'dashboard' | 'detail-data-analyst' | 'detail-software-developer' | 'tpo';

export function AlignPreviewApp() {
  const [view, setView] = useState<View>('dashboard');

  return (
    <div className="min-h-screen bg-align-bg px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <nav className="mb-8 flex gap-2">
          {(
            [
              ['dashboard', 'Dashboard'],
              ['detail-data-analyst', 'Target detail (developing)'],
              ['detail-software-developer', 'Target detail (critical gap)'],
              ['tpo', 'TPO cohort'],
            ] as [View, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`rounded-md px-3 py-1.5 font-body text-sm ${
                view === id ? 'bg-align-fit-dim text-align-text-primary' : 'text-align-text-tertiary hover:bg-align-surface-raised'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {view === 'dashboard' && (
          <AlignDashboard
            results={ALL_RESULTS}
            shortlist={SHORTLIST}
            awaitingEvidence={AWAITING_EVIDENCE}
            onViewTarget={(id) => console.log('view', id)}
            onImproveGap={(id) => console.log('improve', id)}
            onProveTarget={(id) => console.log('prove', id)}
          />
        )}

        {view === 'detail-data-analyst' && (
          <TargetDetailPage
            result={DATA_ANALYST}
            explanation={EXPLANATION}
            history={HISTORY}
            onImproveGap={(id) => console.log('improve', id)}
            onProveTarget={() => console.log('prove')}
            onRunScenario={async (capabilityId, level) => ({
              studentId: 'demo-anika',
              targetId: 'data_analyst',
              capabilityId,
              currentLevel: 'WEAK',
              projectedLevel: level,
              currentFitScore: 84,
              projectedFitScore: 91,
              currentReadinessScore: 45,
              projectedReadinessScore: 52,
              projectionReliable: true,
              label: 'PROJECTED',
            })}
          />
        )}

        {view === 'detail-software-developer' && (
          <TargetDetailPage
            result={SOFTWARE_DEVELOPER}
            explanation="Your demonstrated capabilities currently show a 55% fit with Software Developer. Programming remains below the bar this target requires, which is currently capping the overall alignment."
            history={[]}
            onImproveGap={(id) => console.log('improve', id)}
            onProveTarget={() => console.log('prove')}
            onRunScenario={async (capabilityId, level) => ({
              studentId: 'demo-anika',
              targetId: 'software_developer',
              capabilityId,
              currentLevel: 'WEAK',
              projectedLevel: level,
              currentFitScore: 55,
              projectedFitScore: 100,
              currentReadinessScore: 38,
              projectedReadinessScore: 45,
              projectionReliable: true,
              label: 'PROJECTED',
            })}
          />
        )}

        {view === 'tpo' && <TpoAlignmentOverview targets={COHORT} topCohortGaps={TOP_COHORT_GAPS} />}
      </div>
    </div>
  );
}
