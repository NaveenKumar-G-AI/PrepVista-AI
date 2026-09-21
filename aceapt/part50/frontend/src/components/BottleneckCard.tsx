import React from 'react';
import { BottleneckAssessment } from '../types/speed';

export interface BottleneckCardProps {
  bottleneck: BottleneckAssessment;
  onTrain?: () => void;
}

const LABELS: Record<BottleneckAssessment['type'], string> = {
  READING: 'Reading',
  RECOGNITION: 'Recognition',
  STRATEGY: 'Strategy selection',
  CALCULATION: 'Calculation',
  VERIFICATION: 'Verification',
  DECISION: 'Decision speed',
  RUSHING: 'Rushing',
  HESITATION: 'Hesitation',
  TIME_WASTING: 'Time management',
  KNOWLEDGE_GAP: 'Concept gap',
  UNKNOWN: 'Still gathering evidence',
};

const TRAINING_HINTS: Record<BottleneckAssessment['type'], string> = {
  READING: 'Practice extracting relevant information faster.',
  RECOGNITION: 'Rapid problem-classification drills.',
  STRATEGY: 'Rapid strategy-selection drills.',
  CALCULATION: 'Calculation fluency practice.',
  VERIFICATION: 'Efficient verification practice.',
  DECISION: 'Decision-speed training.',
  RUSHING: 'Balanced speed practice.',
  HESITATION: 'Decision-fluency training.',
  TIME_WASTING: 'Steadier, single-pass solving.',
  KNOWLEDGE_GAP: 'Concept and guided practice.',
  UNKNOWN: 'Keep training - we need a bit more evidence.',
};

/** Spec 67-69: names the bottleneck plainly, backs it with plain-language
 * evidence, and points at a specific next training mode. */
export function BottleneckCard({ bottleneck, onTrain }: BottleneckCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Your biggest time bottleneck</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-900">{LABELS[bottleneck.type]}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{bottleneck.evidence}</p>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Training: <span className="font-medium text-slate-700">{TRAINING_HINTS[bottleneck.type]}</span>
        </p>
        {onTrain && (
          <button
            type="button"
            onClick={onTrain}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Train this
          </button>
        )}
      </div>
      {bottleneck.confidence === 'LOW' && (
        <p className="mt-2 text-xs text-slate-400">Based on limited evidence so far - this will sharpen with more attempts.</p>
      )}
    </div>
  );
}

export default BottleneckCard;
