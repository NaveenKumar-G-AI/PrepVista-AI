'use client';

import { useEffect, useRef, useState } from 'react';

import { CheckIcon, ChevronDownIcon, SparklesIcon, TargetIcon } from './icons';

const difficultyOptions = [
  {
    id: 'auto',
    name: 'Auto',
    short: 'Adaptive by resume',
    description: 'Uses the current smart adaptive flow.',
    icon: SparklesIcon,
  },
  {
    id: 'basic',
    name: 'Basic',
    short: 'Simpler direct questions',
    description: 'Good for calmer practice and faster confidence-building.',
    icon: TargetIcon,
  },
  {
    id: 'medium',
    name: 'Medium',
    short: 'Balanced challenge',
    description: 'Avoids tiny questions and keeps the round practical.',
    icon: TargetIcon,
  },
  {
    id: 'difficult',
    name: 'Difficult',
    short: 'Sharper deeper practice',
    description: 'Better for stronger candidates who want tougher signals.',
    icon: TargetIcon,
  },
] as const;

export function DifficultySelector({
  value,
  onChange,
  placement = 'bottom',
}: {
  value: string;
  onChange: (nextValue: string) => void;
  placement?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const currentOption = difficultyOptions.find(option => option.id === value) || difficultyOptions[0];
  const dropdownPlacementClass = placement === 'top' ? 'bottom-[calc(100%+12px)]' : 'top-[calc(100%+12px)]';

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative z-[70]">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="inline-flex min-w-[198px] items-center justify-between gap-3 rounded-full border border-slate-700/70 bg-[linear-gradient(135deg,rgba(7,15,31,0.96),rgba(12,24,48,0.96))] px-4 py-3 text-left shadow-[0_16px_36px_rgba(2,8,23,0.32)] backdrop-blur-xl transition-all hover:border-sky-400/60 hover:bg-[linear-gradient(135deg,rgba(8,18,38,0.98),rgba(14,29,58,0.98))]"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">{currentOption.name}</span>
          <span className="block truncate text-xs text-slate-300">{currentOption.short}</span>
        </span>
        <ChevronDownIcon size={16} className={`shrink-0 text-slate-200 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className={`absolute right-0 z-[90] w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-[24px] border border-slate-700/85 bg-[linear-gradient(180deg,#0b1220,#14233d)] p-3 text-white shadow-[0_28px_64px_rgba(2,8,23,0.68)] ${dropdownPlacementClass}`}>
          <div className="max-h-[min(24rem,calc(100vh-8rem))] space-y-1 overflow-y-auto pr-1">
            {difficultyOptions.map(option => {
              const Icon = option.icon;
              const active = option.id === value;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start gap-3 rounded-[20px] px-3 py-3 text-left transition-colors ${
                    active ? 'bg-sky-500/12 ring-1 ring-sky-400/28' : 'hover:bg-white/10'
                  }`}
                >
                  <span className={`mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl ${
                    active ? 'bg-sky-500/18 text-sky-100' : 'bg-white/8 text-slate-100'
                  }`}>
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-white">{option.name}</span>
                    <span className="mt-0.5 block text-sm text-slate-200">{option.short}</span>
                    <span className="mt-0.5 block text-sm text-slate-400">{option.description}</span>
                  </span>
                  <span className="mt-1 inline-flex h-6 min-w-6 items-center justify-center">
                    {active ? <CheckIcon size={16} className="text-white" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
