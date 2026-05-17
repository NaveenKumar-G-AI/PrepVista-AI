'use client';
/**
 * PrepVista — College Admin: Department CRUD
 */

import { useEffect, useState, useCallback } from 'react';
import { BuildingIcon, EditIcon, PlusIcon, XIcon } from '@/components/icons';
import { api } from '@/lib/api';

interface Department {
  id: string; department_name: string; department_code: string | null; notes: string | null; status: string; created_at: string;
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', code: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listCollegeDepartments<{ departments: Department[] }>();
      setDepartments(res.departments || []);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditId(null); setForm({ name: '', code: '', notes: '' }); setShowForm(true); };
  const openEdit = (d: Department) => { setEditId(d.id); setForm({ name: d.department_name, code: d.department_code || '', notes: d.notes || '' }); setShowForm(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); if (!form.name.trim()) return;
    setSaving(true); setError('');
    try {
      if (editId) {
        await api.updateCollegeDepartment(editId, { name: form.name.trim(), code: form.code || null, notes: form.notes || null });
      } else {
        await api.createCollegeDepartment({ name: form.name.trim(), code: form.code || null, notes: form.notes || null });
      }
      setShowForm(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (d: Department) => {
    if (!confirm(`Delete "${d.department_name}"? Cannot delete if students are assigned.`)) return;
    try { await api.deleteCollegeDepartment(d.id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed.'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between fade-in">
        <div>
          <h1 className="text-2xl font-bold text-white">Departments</h1>
          <p className="text-sm text-slate-400">{departments.length} department{departments.length !== 1 ? 's' : ''} configured</p>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary !px-4 !py-2 text-sm">
          <span className="inline-flex items-center gap-2"><PlusIcon size={15} />Add Department</span>
        </button>
      </div>

      {error && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{error}</div>}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">{editId ? 'Edit' : 'Create'} Department</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><XIcon size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Code</label>
                <input value={form.code} onChange={e => setForm(f => ({...f, code: e.target.value}))} placeholder="e.g. CSE, ECE"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={2}
                  className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1 !py-2.5">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 !py-2.5">{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-200 border-t-blue-600" /></div>
      ) : departments.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-12 text-center text-slate-500">
          No departments yet. Add your first department to organize students.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 slide-up">
          {departments.map(d => (
            <div key={d.id} className="card !p-5 group hover:border-blue-500/20 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-400">
                    <BuildingIcon size={16} />
                  </div>
                  <div>
                    <div className="font-semibold text-white">{d.department_name}</div>
                    {d.department_code && <div className="text-xs text-slate-400 font-mono">{d.department_code}</div>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={() => openEdit(d)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><EditIcon size={14} /></button>
                  <button type="button" onClick={() => handleDelete(d)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400"><XIcon size={14} /></button>
                </div>
              </div>
              {d.notes && <p className="mt-2 text-xs text-slate-500 leading-relaxed">{d.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
