export default function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="border border-dashed border-hairline-strong px-6 py-10 text-center">
      <p className="font-display text-base font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">{description}</p>
    </div>
  );
}
