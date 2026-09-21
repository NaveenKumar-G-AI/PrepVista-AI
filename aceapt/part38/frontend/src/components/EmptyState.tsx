interface Props {
  title: string;
  body: string;
  cta: string;
  onAction?: () => void;
}

export function EmptyState({ title, body, cta, onAction }: Props) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
      <button className="cta-secondary" onClick={onAction}>
        {cta}
      </button>
    </div>
  );
}
