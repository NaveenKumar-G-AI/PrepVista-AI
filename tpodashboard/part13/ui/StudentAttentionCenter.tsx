// ui/StudentAttentionCenter.tsx
//
// USAGE
//   const { data } = useSWR('/api/proactive/student/attention-center', fetcher);
//   <StudentAttentionCenter items={data?.important ?? []} />
//
// Personal-only by construction (section 36): this component only ever
// renders what the API already scoped to the logged-in student. There is
// no prop, no state, and no code path here that could show another
// student's data, an institutional number, or a TPO-only signal — those
// never arrive in `items` to begin with.

import './theme.css';

interface StudentAttentionItem {
  id: string;
  title: string;
  summary: string;
}

export default function StudentAttentionCenter({ items }: { items: StudentAttentionItem[] }) {
  return (
    <div className="radar-root" style={{ minHeight: '100%', padding: '24px 20px' }}>
      <div style={{ fontSize: 13, color: 'var(--radar-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Important</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {items.length === 0 ? (
          <div style={{ color: 'var(--radar-text-faint)', fontSize: 14, padding: '16px 0' }}>Nothing needs your attention right now.</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              style={{
                background: 'var(--radar-surface)',
                border: '1px solid var(--radar-border)',
                borderLeft: '3px solid var(--radar-accent)',
                borderRadius: 8,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: 'var(--radar-text-muted)', marginTop: 4 }}>{item.summary}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
