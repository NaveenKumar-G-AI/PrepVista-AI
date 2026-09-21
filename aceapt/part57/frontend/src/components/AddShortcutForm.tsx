import { useState } from 'react';
import { api, type DevIdentity } from '../api/client';
import { STRATEGY_TYPES, type ShortcutDetail, type ValidateResult } from '../types';

const inputClass = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-[15px] text-ink placeholder:text-inksoft/70 focus:border-focus focus:outline-none';
const labelClass = 'mb-1 block text-sm text-inksoft';

export function AddShortcutForm({ identity, onCreated, onCancel }: { identity: DevIdentity; onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [strategyType, setStrategyType] = useState<(typeof STRATEGY_TYPES)[number]>('PERSONAL_METHOD');
  const [whenToUse, setWhenToUse] = useState('');
  const [whenNotTo, setWhenNotTo] = useState('');
  const [expression, setExpression] = useState('');
  const [canonicalExpression, setCanonicalExpression] = useState('');
  const [domainMin, setDomainMin] = useState('0');
  const [domainMax, setDomainMax] = useState('1000');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ShortcutDetail | null>(null);
  const [testResult, setTestResult] = useState<ValidateResult | null>(null);
  const [testing, setTesting] = useState(false);

  const hasMathCheck = expression.trim() !== '' && canonicalExpression.trim() !== '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        canonicalName: name,
        description,
        strategyType,
        whenToUse,
        whenNotTo,
        steps: description ? [description] : [],
      };
      if (hasMathCheck) {
        body.expression = expression;
        body.canonicalExpression = canonicalExpression;
        body.validationDomain = { variables: { x: { min: Number(domainMin), max: Number(domainMax) } } };
      }
      const dto = await api.post<ShortcutDetail>('/api/shortcuts', identity, body);
      setCreated(dto);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving this.');
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    if (!created) return;
    setTesting(true);
    try {
      const result = await api.post<ValidateResult>(`/api/shortcuts/${created.shortcutId}/test`, identity);
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  }

  if (created) {
    return (
      <div className="rounded-xl border border-line bg-white p-6">
        <h3 className="font-display text-xl text-ink">Saved as unverified</h3>
        <p className="mt-1 text-sm text-inksoft">
          "{created.canonicalName}" is in your library now. Saving it doesn't make it trusted — that's earned through testing and
          real use (sec. 21).
        </p>

        {hasMathCheck && !testResult && (
          <button
            onClick={runTest}
            disabled={testing}
            className="mt-4 rounded-full bg-ink px-5 py-2 text-sm text-paper hover:opacity-90 disabled:opacity-50"
          >
            {testing ? 'Testing…' : 'Test my shortcut'}
          </button>
        )}

        {testResult && (
          <div className="mt-4 rounded-lg bg-paper p-4">
            <p className="text-[15px] text-ink">
              Result:{' '}
              <span className={testResult.overallStatus === 'PASS' ? 'text-verified' : 'text-caution'}>{testResult.overallStatus}</span>
            </p>
            {testResult.propertyTest && (
              <p className="mt-1 text-sm text-inksoft">Checked against {testResult.propertyTest.samplesTested} cases.</p>
            )}
          </div>
        )}

        <button onClick={onCancel} className="mt-6 text-sm text-focus hover:underline">
          Back to library
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-white p-6">
      <h3 className="font-display text-xl text-ink">Add a personal shortcut</h3>
      <p className="mt-1 text-sm text-inksoft">This starts unverified. If you give it a formula, you can test it immediately.</p>

      <div className="mt-5 space-y-4">
        <div>
          <label className={labelClass}>Name</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My way of solving ratio questions" required />
        </div>
        <div>
          <label className={labelClass}>What you do</label>
          <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the method in your own words" />
        </div>
        <div>
          <label className={labelClass}>Strategy type</label>
          <select className={inputClass} value={strategyType} onChange={(e) => setStrategyType(e.target.value as (typeof STRATEGY_TYPES)[number])}>
            {STRATEGY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>When it works</label>
            <input className={inputClass} value={whenToUse} onChange={(e) => setWhenToUse(e.target.value)} placeholder="e.g. exactly 25%" />
          </div>
          <div>
            <label className={labelClass}>When it doesn't</label>
            <input className={inputClass} value={whenNotTo} onChange={(e) => setWhenNotTo(e.target.value)} placeholder="e.g. any other percentage" />
          </div>
        </div>

        <details className="rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-sm text-inksoft">Optional: give it a formula so it can be tested automatically</summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Your shortcut, as a formula in x</label>
                <input className={`${inputClass} font-mono`} value={expression} onChange={(e) => setExpression(e.target.value)} placeholder="x / 4" />
              </div>
              <div>
                <label className={labelClass}>Standard formula, as a check</label>
                <input className={`${inputClass} font-mono`} value={canonicalExpression} onChange={(e) => setCanonicalExpression(e.target.value)} placeholder="x * 25 / 100" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Test range: min x</label>
                <input className={`${inputClass} font-mono`} value={domainMin} onChange={(e) => setDomainMin(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Test range: max x</label>
                <input className={`${inputClass} font-mono`} value={domainMax} onChange={(e) => setDomainMax(e.target.value)} />
              </div>
            </div>
          </div>
        </details>
      </div>

      {error && <p className="mt-4 text-sm text-caution">{error}</p>}

      <div className="mt-6 flex gap-3">
        <button type="submit" disabled={saving} className="rounded-full bg-ink px-5 py-2 text-sm text-paper hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-full border border-line px-5 py-2 text-sm text-ink hover:bg-paper">
          Cancel
        </button>
      </div>
    </form>
  );
}
