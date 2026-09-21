import { useState } from 'react';
import { api } from '../../api/client.js';
import { Button } from '../shared/UI.jsx';

export default function AddOpportunityModal({ onClose, onAdded }) {
  const [mode, setMode] = useState('paste');
  const [sourceUrl, setSourceUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState(null);
  const [duplicate, setDuplicate] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setNote(null);
    setDuplicate(null);
    setSubmitting(true);
    try {
      const payload = {
        source_url: mode === 'url' ? sourceUrl.trim() || undefined : undefined,
        raw_jd_text: rawText.trim() || undefined,
        company: company.trim() || undefined,
        role: role.trim() || undefined,
        deadline: deadline.trim() || undefined,
      };
      const result = await api.addOpportunity(payload);
      if (result.needs_jd_text) {
        setMode('paste');
        setNote(result.fetch_note);
        setSubmitting(false);
        return;
      }
      onAdded(result.opportunity);
    } catch (err) {
      if (err.status === 409) {
        setDuplicate(err.data?.existing_opportunity);
      } else {
        setNote(err.message);
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-2xl border border-border-soft max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-lg">Add opportunity</h2>
            <button onClick={onClose} className="text-ink-faint hover:text-ink text-2xl leading-none">&times;</button>
          </div>

          <div className="flex gap-1 mb-4 rounded-full bg-ink/5 p-1 w-fit">
            <button type="button" onClick={() => setMode('paste')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${mode === 'paste' ? 'bg-surface shadow-sm text-ink' : 'text-ink-soft'}`}>
              Paste description
            </button>
            <button type="button" onClick={() => setMode('url')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${mode === 'url' ? 'bg-surface shadow-sm text-ink' : 'text-ink-soft'}`}>
              Job URL
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'url' ? (
              <div>
                <label className="text-xs font-medium text-ink-soft">Job posting URL</label>
                <input
                  value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} type="url" required
                  placeholder="https://company.com/careers/backend-developer"
                  className="mt-1 w-full rounded-xl border border-border-soft px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink/10"
                />
                <p className="text-xs text-ink-faint mt-1">Many job sites block automated reading -- if that happens, we'll ask you to paste the text instead.</p>
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-ink-soft">Job description text</label>
                <textarea
                  value={rawText} onChange={(e) => setRawText(e.target.value)} required rows={8}
                  placeholder="Paste the full job description here..."
                  className="mt-1 w-full rounded-xl border border-border-soft px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ink/10"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-ink-soft">Company (optional)</label>
                <input value={company} onChange={(e) => setCompany(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-soft px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink/10" />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-soft">Role (optional)</label>
                <input value={role} onChange={(e) => setRole(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border-soft px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink/10" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">Deadline (optional)</label>
              <input value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder="e.g. 2026-09-15 or Rolling"
                className="mt-1 w-full rounded-xl border border-border-soft px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink/10" />
            </div>

            {note && <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-3 py-2">{note}</p>}
            {duplicate && (
              <div className="text-sm bg-denim-50 text-denim-700 rounded-xl px-3 py-2">
                This looks like one you already added: <strong>{duplicate.role} at {duplicate.company}</strong>.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Analyzing...' : 'Add & analyze'}</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
