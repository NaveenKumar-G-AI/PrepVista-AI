'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { AuthHeader } from '@/components/auth-header';
import { ChartIcon, CreditCardIcon, FeedbackIcon, GiftIcon, ShieldIcon, UserIcon } from '@/components/icons';
import { api, ApiAdminLaunchOfferItem, ApiAdminOverview } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type AdminSection = 'overview' | 'approvals' | 'users' | 'referrals' | 'feedback' | 'revenue' | 'grants' | 'support';

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Not available';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatPlanName(plan?: string | null) {
  if (!plan) {
    return 'Free';
  }
  return `${plan.charAt(0).toUpperCase()}${plan.slice(1)}`;
}

function statusBadgeClass(status: string) {
  if (status === 'approved' || status === 'active' || status === 'joined') {
    return 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20';
  }
  if (status === 'pending' || status === 'queued') {
    return 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20';
  }
  if (status === 'expired') {
    return 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20';
  }
  return 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/20';
}

/* ─── Section tab metadata ─── */
const ADMIN_SECTIONS: Array<{
  id: AdminSection;
  label: string;
  helper: string;
  icon: typeof ShieldIcon;
}> = [
  { id: 'overview', label: 'Overview', helper: 'Live platform counts', icon: ShieldIcon },
  { id: 'support', label: 'Support Chat', helper: 'Manage user threads', icon: FeedbackIcon },
  { id: 'grants', label: 'Access Grants', helper: 'Override user limits', icon: GiftIcon },
  { id: 'users', label: 'Users', helper: 'Plans and offer status', icon: UserIcon },
  { id: 'revenue', label: 'Revenue', helper: 'Global LTV tracking', icon: CreditCardIcon },
  { id: 'referrals', label: 'Referrals', helper: 'Joined referral activity', icon: FeedbackIcon },
  { id: 'feedback', label: 'Feedback', helper: 'User product feedback', icon: FeedbackIcon },
];

/* ─────────────────── Stat Card ─────────────────── */
function StatCard({
  label,
  value,
  helper,
  accent = 'blue',
}: {
  label: string;
  value: string | number;
  helper: string;
  accent?: 'blue' | 'emerald' | 'violet' | 'amber';
}) {
  const ring: Record<string, string> = {
    blue: 'from-blue-500/20 to-blue-600/5 ring-blue-500/15',
    emerald: 'from-emerald-500/20 to-emerald-600/5 ring-emerald-500/15',
    violet: 'from-violet-500/20 to-violet-600/5 ring-violet-500/15',
    amber: 'from-amber-500/20 to-amber-600/5 ring-amber-500/15',
  };
  const textAccent: Record<string, string> = {
    blue: 'text-blue-400',
    emerald: 'text-emerald-400',
    violet: 'text-violet-400',
    amber: 'text-amber-400',
  };
  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${ring[accent]} p-6 ring-1 backdrop-blur-xl transition-transform duration-300 hover:scale-[1.02]`}
    >
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/[0.03]" />
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className={`mt-3 text-4xl font-bold tracking-tight ${textAccent[accent]}`}>{value}</div>
      <div className="mt-2 text-[13px] text-slate-500">{helper}</div>
    </div>
  );
}

/* ─────────────────── Overview Section ─────────────────── */
function OverviewSection({ data }: { data: ApiAdminOverview | null }) {
  const remaining = data?.launch_offer.remaining_slots ?? 0;
  const slotsAreOpen = remaining > 0;

  return (
    <div className="space-y-8 fade-in">
      {/* ── User counts (always visible) ── */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white/90">Platform Overview</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Total users"
            value={data?.platform_stats.total_users_count ?? 0}
            helper="Accurate live platform total"
            accent="blue"
          />
          <StatCard
            label="Active users"
            value={data?.platform_stats.active_users_count ?? 0}
            helper={`Seen in the last ${data?.platform_stats.live_window_minutes ?? 10} min`}
            accent="emerald"
          />
          <StatCard
            label="Inactive users"
            value={data?.platform_stats.inactive_users_count ?? 0}
            helper="Outside the live activity window"
            accent="violet"
          />
        </div>
      </div>

      {/* ── Launch offer summary (hidden once all 10 slots are used) ── */}
      {slotsAreOpen ? (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-white/90">Launch Offer Status</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Claimed slots"
              value={data?.launch_offer.approved_count ?? 0}
              helper={`Out of ${data?.launch_offer.max_slots ?? 100} total`}
              accent="emerald"
            />
            <StatCard
              label="Remaining slots"
              value={remaining}
              helper="Each new eligible signup consumes one slot"
              accent="amber"
            />
            <StatCard
              label="Trial duration"
              value={`${data?.launch_offer.offer_duration_days ?? 7} days`}
              helper="Auto-granted Pro access window"
              accent="blue"
            />
            <StatCard
              label="Offer started"
              value={formatDateTime(data?.launch_offer.eligible_after)}
              helper="Users before this are treated as normal"
              accent="violet"
            />
          </div>
        </div>
      ) : null}

      <div className="text-right text-xs text-slate-600">
        Last updated {formatDateTime(data?.platform_stats.updated_at)}
      </div>
    </div>
  );
}

/* ─────────────────── Approvals Section ─────────────────── */
function ApprovalsSection({
  data,
  workingId,
  onApprove,
  onReject,
}: {
  data: ApiAdminOverview | null;
  workingId: number | null;
  onApprove: (item: ApiAdminLaunchOfferItem) => void;
  onReject: (item: ApiAdminLaunchOfferItem) => void;
}) {
  const remaining = data?.launch_offer.remaining_slots ?? 0;
  const pendingApprovals = useMemo(
    () => data?.launch_offer.items.filter(item => item.status === 'pending') || [],
    [data],
  );

  return (
    <div className="fade-in">
      {remaining <= 0 ? (
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
              <GiftIcon size={18} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white/90">Launch Offer Completed</h2>
              <p className="text-sm text-slate-400">All {data?.launch_offer.max_slots ?? 10} launch premium slots have been filled. The system is operating normally.</p>
            </div>
          </div>
          <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 text-sm text-emerald-400/90 backdrop-blur-sm">
            ✓ All launch premium slots are filled. Approvals are paused, but you can still review and reject pending requests below.
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 mb-5">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-400">
            <GiftIcon size={18} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white/90">Approve Launch Premium Access</h2>
            <p className="text-sm text-slate-400">
              Approve pending users to unlock the first 5 Career slots, then the next 5 Pro slots.
              Rejecting keeps the user on their current plan without any notification.
            </p>
          </div>
        </div>
      )}

      {pendingApprovals.length ? (
        <div className="space-y-3">
          {pendingApprovals.map(item => (
            <div key={item.id} className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-sm transition-all hover:border-white/10 hover:bg-white/[0.05]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white/90">{item.full_name || 'PrepVista user'}</div>
                  <div className="text-xs text-slate-400">{item.email}</div>
                  <div className="mt-2 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                    Queue order: {item.overall_position || item.queue_position || 'Pending'}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Requested: {formatDateTime(item.requested_at)}</div>
                  <div className="text-xs text-slate-500">Reviewed: {formatDateTime(item.reviewed_at)}</div>
                  <div className="mt-1 text-sm text-slate-400">
                    {item.approval_preview_plan
                      ? `If approved now, this user receives ${formatPlanName(item.approval_preview_plan)} free for 1 month as slot ${item.approval_preview_slot}.`
                      : `This user is beyond the first ${data?.launch_offer.max_slots ?? 10} slots — premium chance is lower.`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={workingId === item.id || !item.approval_preview_plan}
                    onClick={() => onApprove(item)}
                    className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-500 hover:shadow-blue-500/30 disabled:opacity-50 disabled:shadow-none"
                  >
                    {workingId === item.id ? 'Working…' : 'Approve premium'}
                  </button>
                  <button
                    type="button"
                    disabled={workingId === item.id}
                    onClick={() => onReject(item)}
                    className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-300 transition-all hover:border-white/15 hover:bg-white/10 disabled:opacity-50"
                  >
                    {workingId === item.id ? 'Working…' : 'Reject'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-5 text-sm text-slate-500 backdrop-blur-sm">
          No pending launch-offer approvals right now.
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Users Section ─────────────────── */
function GrantsSection({ data, loadOverview }: { data: ApiAdminOverview | null, loadOverview: () => Promise<void> }) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [model, setModel] = useState('free');
  const [value, setValue] = useState('normal');
  const [action, setAction] = useState('activate');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!data) return <div className="text-slate-500">Loading grants data...</div>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError('Please select a user.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.grantAdminAccess(selectedUserId, model, value, action);
      setSuccess(res.message || 'Grant applied successfully.');
      await loadOverview();
    } catch (err: any) {
      setError(err?.message || 'Failed to apply grant.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in space-y-6">
      <div className="flex items-center gap-3 border-b border-white/[0.06] pb-4">
        <GiftIcon className="text-emerald-400" size={24} />
        <div>
          <h2 className="text-lg font-semibold text-white">Manual Access Grants</h2>
          <p className="text-sm text-slate-400">Inject custom quotas or explicitly unlock premium tiers for any user.</p>
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-sm text-rose-400">{error}</div>}
      {success && <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-400">{success}</div>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Email (User)</label>
          <select 
            value={selectedUserId} 
            onChange={e => setSelectedUserId(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 [&>option]:bg-slate-900 [&>option]:text-slate-200"
          >
            <option value="" disabled className="bg-slate-900">Search or select user...</option>
            {data.users.map(u => (
              <option key={u.id} value={u.id} className="bg-slate-900 text-slate-200">{u.email} ({u.selected_plan})</option>
            ))}
          </select>
        </div>
        
        <div className="w-full sm:w-32 space-y-2">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Model</label>
          <select 
            value={model} 
            onChange={e => setModel(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 [&>option]:bg-slate-900 [&>option]:text-slate-200"
          >
            <option value="free" className="bg-slate-900 text-slate-200">Free</option>
            <option value="pro" className="bg-slate-900 text-slate-200">Pro</option>
            <option value="career" className="bg-slate-900 text-slate-200">Career</option>
          </select>
        </div>

        <div className="w-full sm:w-32 space-y-2">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Value</label>
          <select 
            value={value} 
            onChange={e => setValue(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 [&>option]:bg-slate-900 [&>option]:text-slate-200"
          >
            <option value="normal" className="bg-slate-900 text-slate-200">Normal</option>
            <option value="unlimited" className="bg-slate-900 text-slate-200">Unlimited</option>
          </select>
        </div>

        <div className="w-full sm:w-36 space-y-2">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Action</label>
          <select 
            value={action} 
            onChange={e => setAction(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 [&>option]:bg-slate-900 [&>option]:text-slate-200"
          >
            <option value="activate" className="bg-slate-900 text-slate-200">Activate</option>
            <option value="deactivate" className="bg-slate-900 text-slate-200">Deactivate</option>
          </select>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full sm:w-auto rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50"
        >
          {loading ? 'Applying...' : 'Apply Action'}
        </button>
      </form>
      
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 mt-6">
        <h3 className="text-sm font-semibold text-blue-400 mb-2">How it works:</h3>
        <ul className="list-disc leading-relaxed text-slate-400 text-xs pl-5 space-y-1">
          <li><strong>Unlimited:</strong> Automatically overrides standard quotas to grant endless interviews dynamically tailored to the selected plan tier.</li>
          <li><strong>Normal:</strong> Bestows exact baseline allocations (e.g. +2 Free, +15 Pro, 1mo Career) gracefully appending to existing metrics.</li>
          <li><strong>Expiration:</strong> All bonuses natively expire aligned strictly with the user&apos;s 30-day billing rollover, ensuring mathematically stable regressions.</li>
        </ul>
      </div>
    </div>
  );
}

function SupportChatSection() {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [thread, setThread] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchUsers = async () => {
    try {
      const res: any = await api.getAdminSupportUsers();
      setUsers(res.users || []);
    } catch (err) {
      console.error('Failed to load support users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    const fetchThread = async () => {
      if (!selectedUserId) return;
      setLoadingThread(true);
      try {
        const res: any = await api.getAdminSupportThread(selectedUserId);
        setThread(res.messages || []);
      } catch (err) {
        console.error('Failed to load user thread:', err);
      } finally {
        setLoadingThread(false);
      }
    };
    fetchThread();
  }, [selectedUserId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread]);

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Image is too large. Max 10MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.floor(height * (MAX_WIDTH / width));
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6);
          setBase64Image(compressedBase64);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || (!text.trim() && !base64Image)) return;

    setSending(true);
    try {
      const res: any = await api.sendAdminSupportReply(selectedUserId, text, base64Image);
      setThread(prev => [...prev, res.message]);
      setText('');
      setBase64Image(null);
      await fetchUsers();
    } catch (err) {
      console.error('Failed to send reply:', err);
      alert('Failed to send reply.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fade-in space-y-6">
      <div className="flex items-center gap-3 border-b border-white/[0.06] pb-4">
        <FeedbackIcon className="text-blue-400" size={24} />
        <div>
          <h2 className="text-lg font-semibold text-white">Global Support Operations</h2>
          <p className="text-sm text-slate-400">Respond to user inquiries directly in real-time natively.</p>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row h-[600px]">
        {/* Left pane: Active users query */}
        <div className="flex w-full flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 lg:w-1/3 overflow-hidden">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Target Support Queue</label>
          <select 
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 [&>option]:bg-slate-900 [&>option]:text-slate-200"
          >
            <option value="" disabled className="bg-slate-900">Select an active user thread...</option>
            {users.map(u => (
              <option key={u.id} value={u.id} className="bg-slate-900">
                {u.unread_count > 0 ? `(🔴 ${u.unread_count}) ` : ''}{u.email}
              </option>
            ))}
          </select>

          <div className="flex-1 overflow-y-auto space-y-1">
             {loadingUsers ? <p className="text-sm text-slate-500">Scanning threads...</p> : 
               users.map(u => (
                 <button 
                   key={u.id}
                   onClick={() => setSelectedUserId(u.id)}
                   className={`flex w-full flex-col items-start gap-1 rounded-xl px-3 py-2.5 text-left transition-colors ${
                     selectedUserId === u.id ? 'bg-blue-600 shadow-md' : 'hover:bg-white/10'
                   }`}
                 >
                   <span className="text-sm font-medium text-white break-all">{u.email}</span>
                   <div className="flex w-full justify-between opacity-70">
                     <span className="text-[10px] tracking-wider uppercase">Active</span>
                     {u.unread_count > 0 && <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{u.unread_count} Unread</span>}
                   </div>
                 </button>
               ))
             }
          </div>
        </div>

        {/* Right pane: Chat thread execution */}
        <div className="flex w-full flex-col rounded-2xl border border-white/10 bg-[#0f172a] overflow-hidden lg:w-2/3">
          {!selectedUserId ? (
            <div className="flex h-full items-center justify-center text-slate-500">
              Select a user thread from the left menu to view and reply.
            </div>
          ) : (
            <>
              {/* Thread History */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
                {loadingThread ? (
                  <div className="animate-pulse text-sm text-slate-500">Decrypting thread vectors...</div>
                ) : thread.length === 0 ? (
                  <div className="text-sm text-slate-500 text-center mt-10">No messages found.</div>
                ) : (
                  thread.map((m, i) => {
                    const isAdmin = m.sender_role === 'admin';
                    return (
                      <div key={i} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                          isAdmin 
                            ? 'bg-blue-600 text-white rounded-tr-none' 
                            : 'bg-white/10 text-slate-200 rounded-tl-none border border-white/5'
                        }`}>
                          <div className="text-[10px] uppercase tracking-wider mb-1 opacity-60 font-medium">
                            {isAdmin ? 'Admin (You)' : 'User'}
                          </div>
                          {m.attachment_data && (
                            <img 
                              src={m.attachment_data} 
                              alt="Attachment" 
                              className="mb-2 max-h-64 rounded-lg object-contain"
                            />
                          )}
                          {m.content && <div className="whitespace-pre-wrap">{m.content}</div>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Input Area */}
              <div className="border-t border-white/10 bg-black/20 p-4">
                {base64Image && (
                  <div className="mb-2 flex items-center justify-between rounded-lg bg-blue-500/10 px-3 py-1.5 border border-blue-500/20">
                    <span className="text-xs text-blue-400 truncate flex-1">Image attached</span>
                    <button onClick={() => setBase64Image(null)} className="ml-2 text-rose-400 hover:text-rose-300">
                      ✕
                    </button>
                  </div>
                )}
                <form onSubmit={handleSend} className="flex gap-2">
                  <input type="file" accept="image/*" hidden ref={fileInputRef} onChange={handleImageFile} />
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 text-slate-400 hover:bg-white/10 hover:text-blue-400 transition-colors"
                    title="Attach an image"
                  >
                    📎
                  </button>
                  <textarea
                    rows={2}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Type official reply..."
                    className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e);
                      }
                    }}
                  />
                  <button 
                    type="submit" 
                    disabled={sending || (!text.trim() && !base64Image)}
                    className="flex-shrink-0 rounded-xl bg-blue-600 px-6 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-500 active:scale-95 disabled:opacity-50"
                  >
                    Reply
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function UsersSection({ data }: { data: ApiAdminOverview | null }) {
  const [searchQuery, setSearchQuery] = useState('');
  const launchOfferDuration = data?.launch_offer.offer_duration_days ?? 7;

  const filteredUsers = useMemo(() => {
    if (!data?.users) return [];
    if (!searchQuery.trim()) return data.users;

    const query = searchQuery.toLowerCase().trim();
    return data.users.filter(user => {
      // 1. Text match (Email or Name)
      if (user.email.toLowerCase().includes(query)) return true;
      if (user.full_name?.toLowerCase().includes(query)) return true;

      // 2. Exact keyword match
      if (query === 'pro' && user.pro_status !== 'not_purchased') return true;
      if (query === 'career' && user.career_status !== 'not_purchased') return true;
      if (query === 'launch offer' || query === 'launch') {
        if (user.launch_offer.status) return true;
      }
      if (query === 'free') return true; // Everyone has free
      if (query === 'admin' && user.is_admin) return true;
      
      // 3. Partial keyword fallback
      if ('pro'.includes(query) && user.pro_status !== 'not_purchased') return true;
      if ('career'.includes(query) && user.career_status !== 'not_purchased') return true;
      if ('launch offer'.includes(query) && user.launch_offer.status) return true;

      return false;
    });
  }, [data?.users, searchQuery]);

  return (
    <div className="fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-400">
            <UserIcon size={18} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white/90">User Subscription Analytics</h2>
            <p className="text-sm text-slate-400">Deep granular visibility into billing cycles and interview usage per account.</p>
          </div>
        </div>

        <div className="w-full sm:w-72 relative">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search email, pro, career..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-400 focus:border-blue-500 focus:bg-white/[0.08] focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
      </div>

      <div className="space-y-4">
        {filteredUsers.map(item => (
          <div key={item.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden backdrop-blur-sm transition-all hover:border-white/10 hover:bg-white/[0.03]">
            {/* Top row: Identity */}
            <div className="border-b border-white/[0.06] bg-slate-800/30 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
               <div>
                  <h3 className="text-base font-semibold text-white/90">{item.full_name || 'PrepVista user'}</h3>
                  <div className="mt-0.5 text-sm text-slate-400">
                    {item.email} | Status: <span className="text-white">{item.subscription_status}</span> | Plan: <span className="text-white">{formatPlanName(item.selected_plan)}</span>
                    {item.is_admin && <span className="ml-2 rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-400 ring-1 ring-inset ring-rose-500/20">Admin</span>}
                  </div>
               </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                 <thead className="border-b border-white/[0.06] bg-white/[0.01] text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                   <tr>
                     <th className="px-6 py-3">Plan</th>
                     <th className="px-6 py-3">Status</th>
                     <th className="px-6 py-3">Start Date</th>
                     <th className="px-6 py-3">End Date</th>
                     <th className="px-6 py-3 whitespace-nowrap">Used</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-white/[0.04]">
                    <tr className="hover:bg-white/[0.02]">
                       <td className="px-6 py-3 font-medium">Free</td>
                       <td className="px-6 py-3 text-emerald-400">Active</td>
                       <td className="px-6 py-3">{formatDateTime(item.free_cycle_start)}</td>
                       <td className="px-6 py-3">{item.free_cycle_end ? formatDateTime(item.free_cycle_end) : 'Never'}</td>
                       <td className="px-6 py-3">{item.free_interviews} interviews</td>
                    </tr>
                    <tr className="hover:bg-white/[0.02]">
                       <td className="px-6 py-3 font-medium">Pro</td>
                       <td className="px-6 py-3">{item.pro_status !== 'not_purchased' ? <span className="text-blue-400 uppercase text-xs font-bold">{item.pro_status}</span> : 'Not Purchased'}</td>
                       <td className="px-6 py-3 text-slate-400">{item.pro_status !== 'not_purchased' ? formatDateTime(item.pro_activated_at) : '-'}</td>
                       <td className="px-6 py-3 text-slate-400">{item.pro_status !== 'not_purchased' ? formatDateTime(item.pro_expires_at) : '-'}</td>
                       <td className="px-6 py-3 text-slate-400">{item.pro_status !== 'not_purchased' ? `${item.pro_interviews} interviews` : '-'}</td>
                    </tr>
                    <tr className="hover:bg-white/[0.02]">
                       <td className="px-6 py-3 font-medium">Career</td>
                       <td className="px-6 py-3">{item.career_status !== 'not_purchased' ? <span className="text-violet-400 uppercase text-xs font-bold">{item.career_status}</span> : 'Not Purchased'}</td>
                       <td className="px-6 py-3 text-slate-400">{item.career_status !== 'not_purchased' ? formatDateTime(item.career_activated_at) : '-'}</td>
                       <td className="px-6 py-3 text-slate-400">{item.career_status !== 'not_purchased' ? formatDateTime(item.career_expires_at) : '-'}</td>
                       <td className="px-6 py-3 text-slate-400">{item.career_status !== 'not_purchased' ? `${item.career_interviews} interviews` : '-'}</td>
                    </tr>
                 </tbody>
              </table>
            </div>

            {/* Launch Offer Row */}
            {item.launch_offer.status && (
              <div className="border-t border-white/[0.06] px-6 py-3 bg-rose-500/10">
                 <div className="text-sm">
                   <span className="font-bold text-rose-400 tracking-wider">LAUNCH OFFER: {item.launch_offer.status.toUpperCase()}</span>
                   <span className="text-rose-400/80 ml-2 font-medium">[{formatPlanName(item.launch_offer.plan || 'pro')}]</span>
                   <span className="text-slate-300 ml-4 hidden sm:inline">
                      (Duration: {launchOfferDuration} days | Start: {formatDateTime(item.launch_offer.approved_at || item.launch_offer.requested_at)} 
                      {item.launch_offer.expires_at ? ` | End: ${formatDateTime(item.launch_offer.expires_at)}` : ''})
                   </span>
                   <div className="text-slate-300 mt-1 sm:hidden">
                      (Duration: {launchOfferDuration} days | Start: {formatDateTime(item.launch_offer.approved_at || item.launch_offer.requested_at)} 
                      {item.launch_offer.expires_at ? ` | End: ${formatDateTime(item.launch_offer.expires_at)}` : ''})
                   </div>
                 </div>
              </div>
            )}
          </div>
        ))}
        {filteredUsers.length === 0 && (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-center text-sm text-slate-500 backdrop-blur-sm">
            {searchQuery.trim() ? `No users matched the search "${searchQuery}".` : 'No users found.'}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── Referrals Section ─────────────────── */
function ReferralsSection({ data }: { data: ApiAdminOverview | null }) {
  return (
    <div className="fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-400">
          <CreditCardIcon size={18} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white/90">Referral Activity</h2>
          <p className="text-sm text-slate-400">Track who referred whom, whether they joined, and whether rewards were granted.</p>
        </div>
      </div>

      <div className="space-y-3 max-h-[760px] overflow-y-auto pr-1">
        {data?.referrals.length ? data.referrals.map(item => (
          <div key={item.id} className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-sm transition-all hover:border-white/10 hover:bg-white/[0.05]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white/90">{item.referrer_name || 'PrepVista user'} referred {item.invited_email}</div>
                <div className="mt-1 text-xs text-slate-400">Referrer: {item.referrer_email}</div>
                <div className="mt-1 text-xs text-slate-400">Joined member: {item.invited_user_email || 'Not joined yet'}</div>
                <div className="mt-2 text-xs text-slate-500">Queued: {formatDateTime(item.created_at)}</div>
                <div className="text-xs text-slate-500">Joined: {formatDateTime(item.joined_at)}</div>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusBadgeClass(item.status)}`}>
                {item.status}
              </div>
            </div>
          </div>
        )) : (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-5 text-sm text-slate-500 backdrop-blur-sm">
            No referral data yet.
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── Feedback Section ─────────────────── */
function FeedbackSection({ data }: { data: ApiAdminOverview | null }) {
  return (
    <div className="fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-400">
          <FeedbackIcon size={18} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white/90">All User Feedback</h2>
          <p className="text-sm text-slate-400">Review the latest product feedback coming in from users.</p>
        </div>
      </div>

      <div className="space-y-3 max-h-[760px] overflow-y-auto pr-1">
        {data?.feedback.length ? data.feedback.map(item => (
          <div key={item.id} className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-sm transition-all hover:border-white/10 hover:bg-white/[0.05]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white/90">{item.full_name || 'PrepVista user'}</div>
                <div className="text-xs text-slate-400">{item.email}</div>
              </div>
              <div className="text-xs text-slate-500">{formatDateTime(item.created_at)}</div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-300">{item.feedback_text}</p>
          </div>
        )) : (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-5 text-sm text-slate-500 backdrop-blur-sm">
            No feedback yet.
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Admin Page
   ═══════════════════════════════════════════════════════════ */


/* ─────────────────── Revenue Section ─────────────────── */
function RevenueSection({ data }: { data: ApiAdminOverview | null }) {
  const rev = data?.revenue_analytics;
  if (!rev) return null;

  const formatINR = (paise: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(paise / 100);
  };

  return (
    <div className="fade-in space-y-8">
      {/* ── Global Totals ── */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white/90">Global Revenue Statistics</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Total Platform Revenue"
            value={formatINR(rev.global_total_revenue)}
            helper="All time sum across all tiers"
            accent="emerald"
          />
          <StatCard
            label="Pro Tier Revenue"
            value={formatINR(rev.global_pro_revenue)}
            helper="Total from Pro purchases"
            accent="blue"
          />
          <StatCard
            label="Career Tier Revenue"
            value={formatINR(rev.global_career_revenue)}
            helper="Total from Career purchases"
            accent="violet"
          />
        </div>
      </div>

      {/* ── User LTV Table ── */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white/90">User Lifetime Value (LTV)</h2>
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-white/[0.06] bg-slate-800/50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Customer</th>
                  <th className="px-6 py-4 font-medium">Pro Value (Count)</th>
                  <th className="px-6 py-4 font-medium">Career Value (Count)</th>
                  <th className="px-6 py-4 font-medium">Total LTV</th>
                  <th className="px-6 py-4 font-medium text-right">Last Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {rev.user_metrics.map(user => (
                  <tr key={user.user_id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-6 py-4">
                      <div className="font-medium text-white/90">{user.full_name || 'Anonymous'}</div>
                      <div className="text-xs text-slate-400">{user.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white/80">{formatINR(user.pro_revenue_paise)}</div>
                      <div className="text-xs text-slate-500">{user.pro_purchase_count} {user.pro_purchase_count === 1 ? 'purchase' : 'purchases'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white/80">{formatINR(user.career_revenue_paise)}</div>
                      <div className="text-xs text-slate-500">{user.career_purchase_count} {user.career_purchase_count === 1 ? 'purchase' : 'purchases'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="inline-flex rounded-full bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-400 border border-emerald-500/20 shadow-sm shadow-emerald-500/10">
                        {formatINR(user.total_revenue_paise)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-slate-400">
                      {formatDateTime(user.last_payment_date)}
                    </td>
                  </tr>
                ))}
                {rev.user_metrics.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">No revenue data available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<ApiAdminOverview | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSection>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [workingId, setWorkingId] = useState<number | null>(null);

  const loadOverview = async () => {
    setError('');
    const response = await api.getAdminOverview<ApiAdminOverview>();
    setData(response);
  };

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user) {
      router.push('/login');
      return;
    }
    if (!user.is_admin && !user.premium_override) {
      router.push('/dashboard');
      return;
    }

    loadOverview()
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Admin data could not be loaded.');
      })
      .finally(() => setLoading(false));
  }, [authLoading, router, user]);

  const handleApprove = async (item: ApiAdminLaunchOfferItem) => {
    if (workingId !== null) {
      return;
    }
    setWorkingId(item.id);
    setActionMessage('');
    setError('');
    try {
      const result = await api.approveLaunchOffer(item.id);
      setActionMessage(`${result.email} was approved for ${formatPlanName(result.plan)} access at ${formatDateTime(result.approved_at)}.`);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setWorkingId(null);
    }
  };

  const handleReject = async (item: ApiAdminLaunchOfferItem) => {
    if (workingId !== null) {
      return;
    }
    setWorkingId(item.id);
    setActionMessage('');
    setError('');
    try {
      const result = await api.rejectLaunchOffer(item.id);
      setActionMessage(`${item.email} was rejected from the launch premium offer at ${formatDateTime(result.reviewed_at)}.`);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed.');
    } finally {
      setWorkingId(null);
    }
  };

  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center surface-primary">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-800 border-t-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen surface-primary">
      <AuthHeader backHref="/dashboard" backLabel="Back to main" />

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* ── Alert banners ── */}
        {error ? (
          <div className="mb-5 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400 backdrop-blur-sm">
            {error}
          </div>
        ) : null}
        {actionMessage ? (
          <div className="mb-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 backdrop-blur-sm">
            {actionMessage}
          </div>
        ) : null}

        {/* ── Header ── */}
        <div className="mb-8 fade-in">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400 ring-1 ring-blue-500/20">
            <ShieldIcon size={14} />
            Admin workspace
          </div>
          <h1 className="text-3xl font-bold text-white">Admin Console</h1>
          <p className="mt-2 max-w-3xl text-slate-400">
            Manage users, monitor launch-offer metrics, inspect referrals, and review feedback from one protected workspace.
          </p>
        </div>

        {/* ── Top navigation tabs ── */}
        <nav className="mb-8 flex flex-wrap gap-2 rounded-3xl border border-white/[0.06] bg-white/[0.02] p-2 backdrop-blur-xl">
          {ADMIN_SECTIONS.map(section => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`group flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                }`}
              >
                <Icon size={16} />
                <span>{section.label}</span>
                <span className={`hidden text-[11px] font-normal sm:inline ${isActive ? 'text-blue-200' : 'text-slate-500 group-hover:text-slate-400'}`}>
                  {section.helper}
                </span>
              </button>
            );
          })}
        </nav>

        {/* ── Section content ── */}
        <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-xl lg:p-8">
          {activeSection === 'overview' && <OverviewSection data={data} />}
          {activeSection === 'approvals' && (
            <ApprovalsSection
              data={data}
              workingId={workingId}
              onApprove={item => void handleApprove(item)}
              onReject={item => void handleReject(item)}
            />
          )}
          {activeSection === 'support' && <SupportChatSection />}
          {activeSection === 'grants' && <GrantsSection data={data} loadOverview={loadOverview} />}
          {activeSection === 'users' && <UsersSection data={data} />}
          {activeSection === 'revenue' && <RevenueSection data={data} />}
          {activeSection === 'referrals' && <ReferralsSection data={data} />}
          {activeSection === 'feedback' && <FeedbackSection data={data} />}
        </div>
      </div>
    </div>
  );
}
