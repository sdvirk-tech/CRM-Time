import { useState, type FormEvent } from "react";
import { CONTACT_STATUSES, type Contact, type ContactInput } from "./types";

interface Props {
  initial?: Contact;
  onSubmit: (input: ContactInput) => Promise<void>;
  onCancel: () => void;
}

export function ContactForm({ initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<ContactInput>({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    company: initial?.company ?? "",
    phone: initial?.phone ?? "",
    status: initial?.status ?? "lead",
    value: initial?.value ?? 0,
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof ContactInput>(key: K, value: ContactInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? "Edit contact" : "New contact"}</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Name<span className="required">*</span>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Jane Doe"
            />
          </label>
          <div className="form-row">
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="jane@company.com"
              />
            </label>
            <label>
              Phone
              <input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="+1 555 000 0000"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Company
              <input
                value={form.company}
                onChange={(e) => update("company", e.target.value)}
                placeholder="Acme Inc."
              />
            </label>
            <label>
              Deal value ($)
              <input
                type="number"
                min={0}
                value={form.value}
                onChange={(e) => update("value", Number(e.target.value))}
              />
            </label>
          </div>
          <label>
            Status
            <select
              value={form.status}
              onChange={(e) => update("status", e.target.value as ContactInput["status"])}
            >
              {CONTACT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Context, next steps, etc."
            />
          </label>

          {error && <p className="error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Saving..." : initial ? "Save changes" : "Create contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
