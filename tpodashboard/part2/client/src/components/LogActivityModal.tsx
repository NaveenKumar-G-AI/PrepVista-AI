import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client.js";
import { Modal } from "./Modal.js";
import { TextAreaField, SelectField, TextField } from "./Field.js";
import { Button } from "./ui.js";

const ACTIVITY_TYPES = [
  ["CALL", "Call"],
  ["EMAIL", "Email"],
  ["MEETING", "Meeting"],
  ["VISIT", "Campus visit"],
  ["RECRUITER_REQUEST", "Recruiter request"],
  ["REQUIREMENT_RECEIVED", "Requirement received"],
  ["DRIVE_DISCUSSION", "Drive discussion"],
  ["NOTE", "Note"],
  ["OTHER", "Other"],
];

interface Props {
  companyId: string;
  contacts: any[];
  onClose: () => void;
  onSaved: () => void;
}

export function LogActivityModal({ companyId, contacts, onClose, onSaved }: Props) {
  const [type, setType] = useState("CALL");
  const [contactId, setContactId] = useState(contacts.find((c) => c.is_primary)?.id ?? "");
  const [subject, setSubject] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.logActivity(companyId, { type, contactId: contactId || null, subject: subject || null, summary: summary || null });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't log the interaction.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Log an interaction" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value)}>
            {ACTIVITY_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <SelectField label="Contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Not specific to a contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
        <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Intro call" />
        <TextAreaField label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What was discussed…" />
        {error && <p className="text-sm text-signal-risk">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Saving…" : "Log interaction"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
