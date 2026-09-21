'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="empty"><h1>This workspace could not load.</h1><p>Your saved browser data is still available. Retry this section.</p><button className="button" onClick={reset}>Try again</button></div>; }
