'use client';
/**
 * PrepVista — College Admin (TPO): Placement Config  (Fix 9)
 *
 * Lets a TPO configure the placement targets used across their college:
 *   - which company archetypes matter for their students,
 *   - the readiness score the college treats as "placement ready",
 *   - the competency pillars they want to emphasise,
 *   - free-text notes.
 *
 * Backed by GET/PUT /org/my/placement-config. The available company archetypes
 * and competency pillars come from the placement readiness engine, so the
 * choices here can never drift from what the engine actually scores.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertIcon, CheckIcon, TargetIcon } from '@/components/icons';
import { api } from '@/lib/api';

interface PillarOption {
  key: string;
  label: string;
}

interface PlacementConfig {
  target_companies: string[];
  readiness_threshold: number;
  focus_pillars: string[];
  notes: string | null;
  updated_at: string | null;
  is_default: boolean;
}

interface ConfigResponse {
  config: PlacementConfig;
  options: {
    available_companies: string[];
    available_pillars: PillarOption[];
  };
}

export default function PlacementConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [companies, setCompanies] = useState<string[]>([]);
  const [pillars, setPillars] = useState<PillarOption[]>([]);

  const [targetCompanies, setTargetCompanies] = useState<string[]>([]);
  const [focusPillars, setFocusPillars] = useState<string[]>([]);
  const [threshold, setThreshold] = useState(70);
  const [notes, setNotes] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(true);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  };

  const load = useCallback(async () => {
    try {
      const res = await api.getPlacementConfig<ConfigResponse>();
      setCompanies(res.options.available_companies || []);
      setPillars(res.options.available_pillars || []);
      setTargetCompanies(res.config.target_companies || []);
      setFocusPillars(res.config.focus_pillars || []);
      setThreshold(res.config.readiness_threshold ?? 70);
      setNotes(res.config.notes || '');
      setUpdatedAt(res.config.updated_at);
      setIsDefault(res.config.is_default);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load placement config.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.updatePlacementConfig({
        target_companies: targetCompanies,
        readiness_threshold: threshold,
        focus_pillars: focusPillars,
        notes: notes.trim() || null,
      });
      showToast('Placement config saved.');
      setIsDefault(false);
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] rounded-2xl border border-green-500/20 bg-green-500/10 px-5 py-3 text-sm text-green-400 shadow-2xl backdrop-blur-sm animate-fade-in">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between fade-in">
        <div>
          <h1 className="text-2xl font-bold text-white">Placement Config</h1>
          <p className="text-sm text-slate-400">
            Set the company targets and readiness bar used across your college’s placement reports.
            {updatedAt && !isDefault && (
              <span className="ml-1 text-slate-500">
                Last updated {new Date(updatedAt).toLocaleDateString()}.
              </span>
            )}
            {isDefault && <span className="ml-1 text-amber-400/80">Using defaults — not saved yet.</span>}
          </p>
        </div>
        <button type="button" onClick={handleSave} disabled={saving} className="btn-primary !px-4 !py-2 text-sm">
          <span className="inline-flex items-center gap-2"><CheckIcon size={15} />{saving ? 'Saving…' : 'Save'}</span>
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400 flex items-start gap-2">
          <AlertIcon size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Target companies */}
      <div className="card !p-5 fade-in">
        <div className="flex items-center gap-2 mb-1">
          <TargetIcon size={16} className="text-blue-400" />
          <h2 className="text-base font-semibold text-white">Target companies</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Choose the company archetypes your students are placed into. These drive the per-company
          hiring-probability bars in their reports.
        </p>
        <div className="flex flex-wrap gap-2">
          {companies.map(name => {
            const selected = targetCompanies.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggle(targetCompanies, setTargetCompanies, name)}
                className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${selected
                  ? 'border-blue-500/40 bg-blue-500/15 text-blue-300'
                  : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200'}`}
              >
                {selected && <CheckIcon size={11} className="inline mr-1.5" />}
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Readiness threshold */}
      <div className="card !p-5 fade-in">
        <h2 className="text-base font-semibold text-white mb-1">Placement-ready threshold</h2>
        <p className="text-xs text-slate-500 mb-4">
          The 0–100 readiness score at which a student counts as “placement ready” on your cohort dashboards.
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={100}
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="flex-1 accent-blue-500"
          />
          <span className="w-14 text-right text-lg font-bold text-white tabular-nums">{threshold}</span>
        </div>
      </div>

      {/* Focus pillars */}
      <div className="card !p-5 fade-in">
        <h2 className="text-base font-semibold text-white mb-1">Focus pillars</h2>
        <p className="text-xs text-slate-500 mb-4">
          The competency pillars your college wants to emphasise. Advisory — surfaced alongside readiness.
        </p>
        <div className="flex flex-wrap gap-2">
          {pillars.map(p => {
            const selected = focusPillars.includes(p.key);
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => toggle(focusPillars, setFocusPillars, p.key)}
                className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${selected
                  ? 'border-violet-500/40 bg-violet-500/15 text-violet-300'
                  : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200'}`}
              >
                {selected && <CheckIcon size={11} className="inline mr-1.5" />}
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div className="card !p-5 fade-in">
        <h2 className="text-base font-semibold text-white mb-1">Notes</h2>
        <p className="text-xs text-slate-500 mb-3">Optional — internal context for your placement team.</p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="e.g. 'Priority this season: service-based mass recruiters for 3rd-year cohort.'"
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
        />
      </div>
    </div>
  );
}
