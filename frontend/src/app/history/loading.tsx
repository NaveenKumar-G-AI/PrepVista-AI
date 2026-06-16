export default function Loading() {
  return (
    <div className="min-h-screen surface-primary">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8 fade-in">
          <div className="h-6 w-32 animate-pulse rounded-md bg-blue-100 dark:bg-blue-900/30 mb-3" />
          <div className="h-10 w-64 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
          <div className="mt-4 h-5 w-96 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800/50" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-6 flex flex-col gap-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-slate-200 dark:bg-slate-800" />
                <div className="space-y-2 flex-1">
                  <div className="h-5 w-48 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-4 w-32 rounded bg-slate-100 dark:bg-slate-800/50" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
