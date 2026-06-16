export default function Loading() {
  return (
    <div className="min-h-screen surface-primary">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8 fade-in">
          <div className="h-6 w-32 animate-pulse rounded-md bg-blue-100 dark:bg-blue-900/30 mb-3" />
          <div className="h-10 w-64 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
          <div className="mt-4 h-5 w-96 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800/50" />
        </div>
        <div className="card p-8 animate-pulse">
          <div className="flex items-center gap-6">
            <div className="h-24 w-24 rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="space-y-3 flex-1">
              <div className="h-8 w-64 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-5 w-48 rounded bg-slate-100 dark:bg-slate-800/50" />
            </div>
          </div>
          <div className="mt-8 space-y-4">
            <div className="h-12 w-full rounded bg-slate-100 dark:bg-slate-800/30" />
            <div className="h-12 w-full rounded bg-slate-100 dark:bg-slate-800/30" />
          </div>
        </div>
      </div>
    </div>
  );
}
