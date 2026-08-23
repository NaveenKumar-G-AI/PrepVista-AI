import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client.js";
import { Modal } from "./Modal.js";
import { TextField, SelectField } from "./Field.js";
import { Button } from "./ui.js";

interface Props {
  companyId: string;
  contacts: any[];
  onClose: () => void;
  onSaved: () => void;
}

function defaultDueAt() {
  const d = new Date(Date.now() + 86_400_000);
  d.setHours(10, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export function CreateFollowupModal({ companyId, contacts, onClose, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState(defaultDueAt());
  const [priority, setPriority] = useState("MEDIUM");
  const [contactId, setContactId] = useState(contacts.find((c) => c.is_primary)?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createFollowup(companyId, {
        title,
        dueAt: new Date(dueAt).toISOString(),
        priority,
        contactId: contactId || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the follow-up.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Schedule a follow-up" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Send placement brochure" autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Due" type="datetime-local" required value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          <SelectField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </SelectField>
        </div>
        <SelectField label="Contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">Not specific to a contact</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        {error && <p className="text-sm text-signal-risk">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting || !title.trim()}>
            {submitting ? "Scheduling…" : "Schedule follow-up"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
