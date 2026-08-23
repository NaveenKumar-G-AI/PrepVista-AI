import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client.js";
import { Modal } from "./Modal.js";
import { TextField } from "./Field.js";
import { Button } from "./ui.js";
import { AlertTriangle } from "lucide-react";

interface Props {
  onClose: () => void;
  onCreated: (companyId: string) => void;
}

export function AddCompanyModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<any[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (allowDuplicate: boolean) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.createCompany({ name, website: website || null, headquartersCity: city || null }, allowDuplicate);
      onCreated(res.company.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.duplicates) {
        setDuplicates(err.duplicates as any[]);
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't create the company.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(false);
  };

  return (
    <Modal title="Add company" onClose={onClose}>
      {duplicates ? (
        <div>
          <div className="flex items-start gap-2 rounded-md bg-gold/10 px-3 py-2.5 text-sm text-ink">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-gold" />
            <span>
              A matching company already exists. Nothing was created — review below and decide whether this is really a new
              company.
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {duplicates.map((d, i) => (
              <li key={i} className="rounded-md border border-line px-3 py-2 text-sm">
                <p className="font-medium text-ink">{d.company.name}</p>
                <p className="text-xs text-ink-soft">
                  {d.matchType === "EXACT_DOMAIN" ? "Same website domain" : "Exact name match"}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => submit(true)} disabled={submitting}>
              Create anyway — it's a different company
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <TextField label="Company name" required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <TextField label="Website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} />
          {error && <p className="text-sm text-signal-risk">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting || !name.trim()}>
              {submitting ? "Creating…" : "Create company"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
