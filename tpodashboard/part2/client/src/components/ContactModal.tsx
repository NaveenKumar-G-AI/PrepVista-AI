import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client.js";
import { Modal } from "./Modal.js";
import { TextField, SelectField } from "./Field.js";
import { Button } from "./ui.js";

interface Props {
  companyId: string;
  existing?: any;
  onClose: () => void;
  onSaved: () => void;
}

export function ContactModal({ companyId, existing, onClose, onSaved }: Props) {
  const [name, setName] = useState(existing?.name ?? "");
  const [designation, setDesignation] = useState(existing?.designation ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [preferredChannel, setPreferredChannel] = useState(existing?.preferred_channel ?? "EMAIL");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const input = { name, designation: designation || null, email: email || null, phone: phone || null, preferredChannel };
      if (existing) await api.updateContact(existing.id, input);
      else await api.createContact(companyId, input);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the contact.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={existing ? "Edit contact" : "Add recruiter contact"} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <TextField label="Designation" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="HR Manager" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <SelectField label="Preferred channel" value={preferredChannel} onChange={(e) => setPreferredChannel(e.target.value)}>
          <option value="EMAIL">Email</option>
          <option value="PHONE">Phone</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="LINKEDIN">LinkedIn</option>
          <option value="OTHER">Other</option>
        </SelectField>
        {error && <p className="text-sm text-signal-risk">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting || !name.trim()}>
            {submitting ? "Saving…" : existing ? "Save changes" : "Add contact"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
