import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Building2 } from "lucide-react";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { HealthDot } from "../components/RelationshipHealthChip.js";
import { StageBadge, STAGE_LABELS, Button } from "../components/ui.js";
import { EmptyState } from "../components/EmptyState.js";
import { AddCompanyModal } from "../components/AddCompanyModal.js";
import { formatDueDate, formatRelativeDays } from "../api/formatters.js";

type SortKey = "name" | "relationship" | "lastContact" | "nextFollowup" | "health";

export default function CompanyListPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [followupStatus, setFollowupStatus] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    const handle = setTimeout(load, 250); // debounce search
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, stage, repeatOnly, followupStatus, sort, sortDir]);

  async function load() {
    setLoading(true);
    setErrored(false);
    try {
      const res = await api.listCompanies({
        search: search || undefined,
        stage: stage || undefined,
        repeatRecruiter: repeatOnly ? "true" : undefined,
        followupStatus: followupStatus || undefined,
        sort,
        sortDir,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setErrored(true);
    } finally {
      setLoading(false);
    }
  }

  const toggleSort = (key: SortKey) => {
    if (sort === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setSortDir("asc");
    }
  };

  const hasActiveFilters = search || stage || repeatOnly || followupStatus;

  return (
    <AppShell>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium text-ink">Companies &amp; Recruiters</h1>
          <p className="text-sm text-ink-soft">{loading ? "Loading…" : `${total} compan${total === 1 ? "y" : "ies"}`}</p>
        </div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Add company
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, website, city, or contact…"
            className="w-full rounded-md border border-line bg-surface py-1.5 pl-8 pr-3 text-sm focus:border-harbor"
          />
        </div>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-soft"
        >
          <option value="">All stages</option>
          {Object.entries(STAGE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={followupStatus}
          onChange={(e) => setFollowupStatus(e.target.value)}
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-soft"
        >
          <option value="">Any follow-up status</option>
          <option value="OVERDUE">Overdue follow-up</option>
          <option value="OPEN">Has open follow-up</option>
          <option value="NONE">No open follow-up</option>
        </select>
        <label className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-soft">
          <input type="checkbox" checked={repeatOnly} onChange={(e) => setRepeatOnly(e.target.checked)} />
          Repeat recruiter
        </label>
      </div>

      {loading ? (
        <div className="rounded-lg border border-line bg-surface p-10 text-center text-sm text-ink-soft">Loading companies…</div>
      ) : errored ? (
        <EmptyState
          title="Couldn't load companies"
          description="There was a problem reaching the server. Check your connection and try again."
          action={<Button onClick={load}>Retry</Button>}
        />
      ) : items.length === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={<Building2 size={28} />}
          title="No recruiter records yet"
          description="Import your recruiter list or add your first company to start tracking relationships."
          action={
            <Button variant="primary" onClick={() => setShowAdd(true)}>
              <Plus size={16} /> Add your first company
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState title="No companies match these filters" description="Try clearing a filter or broadening your search." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-faint">
                <Th label="Company" active={sort === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
                <th className="px-3 py-2 font-medium">Industry / Location</th>
                <Th label="Relationship" active={sort === "relationship"} dir={sortDir} onClick={() => toggleSort("relationship")} />
                <Th label="Health" active={sort === "health"} dir={sortDir} onClick={() => toggleSort("health")} />
                <th className="px-3 py-2 font-medium">Drives / Hired</th>
                <Th label="Last contact" active={sort === "lastContact"} dir={sortDir} onClick={() => toggleSort("lastContact")} />
                <Th label="Next follow-up" active={sort === "nextFollowup"} dir={sortDir} onClick={() => toggleSort("nextFollowup")} />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const due = formatDueDate(c.nextFollowupAt);
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/companies/${c.id}`)}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-paper"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-ink">{c.name}</div>
                      {c.isRepeatRecruiter && <div className="text-xs text-gold">Repeat recruiter</div>}
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">
                      {c.industryName ?? "—"}
                      {c.headquarters_city ? ` · ${c.headquarters_city}` : ""}
                    </td>
                    <td className="px-3 py-2.5">
                      <StageBadge stage={c.relationship_stage} />
                    </td>
                    <td className="px-3 py-2.5">
                      <HealthDot health={c.relationshipHealth.health} reason={c.relationshipHealth.reason} />
                    </td>
                    <td className="px-3 py-2.5 tabular text-ink-soft">
                      {c.drivesCount} / {c.studentsHiredCount}
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">{formatRelativeDays(c.daysSinceLastContact)}</td>
                    <td className="px-3 py-2.5">
                      {c.nextFollowupAt ? (
                        <span className={`font-medium ${due.overdue ? "text-signal-risk" : due.urgent ? "text-gold" : "text-ink"}`}>
                          {due.text}
                        </span>
                      ) : (
                        <span className="text-ink-faint">Not scheduled</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddCompanyModal onClose={() => setShowAdd(false)} onCreated={(id) => navigate(`/companies/${id}`)} />
      )}
    </AppShell>
  );
}

function Th({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <th className="px-3 py-2 font-medium">
      <button onClick={onClick} className={`flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""}`}>
        {label}
        {active && <span aria-hidden="true">{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}
