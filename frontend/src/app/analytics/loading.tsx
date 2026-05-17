export default function Loading() {
  return (
    <div className="min-h-screen surface-primary">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8 fade-in">
          <div className="h-6 w-32 animate-pulse rounded-md bg-blue-100 dark:bg-blue-900/30 mb-3" />
          <div className="h-10 w-64 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
          <div className="mt-4 h-5 w-96 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800/50" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-6 h-32 animate-pulse flex flex-col gap-3">
              <div className="h-8 w-8 rounded-lg bg-slate-200 dark:bg-slate-800" />
              <div className="h-6 w-24 rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          ))}
        </div>
        <div className="mt-8 card h-96 w-full animate-pulse bg-slate-100 dark:bg-slate-800/30" />
      </div>
    </div>
  );
}
