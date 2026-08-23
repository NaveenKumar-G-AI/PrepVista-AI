import { useEffect, useRef, type FC, type ReactNode } from "react";
import { X } from "lucide-react";

export const Modal: FC<{ title: string; onClose: () => void; children: ReactNode; wide?: boolean }> = ({
  title,
  onClose,
  children,
  wide,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.querySelector<HTMLElement>("input, textarea, select, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`max-h-[90vh] w-full ${wide ? "max-w-2xl" : "max-w-md"} overflow-y-auto rounded-lg bg-surface shadow-xl`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 id="modal-title" className="font-display text-lg font-medium text-ink">
            {title}
          </h2>
          <button onClick={onClose} aria-label="Close dialog" className="rounded p-1 text-ink-soft hover:bg-paper hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
};
