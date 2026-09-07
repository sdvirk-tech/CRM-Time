import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createContact,
  deleteContact,
  fetchContacts,
  fetchStats,
  updateContact,
} from "./api";
import { CONTACT_STATUSES, type Contact, type ContactInput, type Stats } from "./types";
import { ContactForm } from "./ContactForm";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, s] = await Promise.all([
        fetchContacts(search, statusFilter),
        fetchStats(),
      ]);
      setContacts(c);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  async function handleCreate(input: ContactInput) {
    await createContact(input);
    setShowForm(false);
    await load();
  }

  async function handleUpdate(input: ContactInput) {
    if (!editing) return;
    await updateContact(editing.id, input);
    setEditing(null);
    await load();
  }

  async function handleDelete(contact: Contact) {
    if (!window.confirm(`Delete ${contact.name}?`)) return;
    await deleteContact(contact.id);
    await load();
  }

  const statCards = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Total contacts", value: String(stats.total) },
      { label: "Pipeline value", value: currency.format(stats.pipelineValue) },
      { label: "Active", value: String(stats.byStatus.active ?? 0) },
      { label: "Won", value: String(stats.byStatus.won ?? 0) },
    ];
  }, [stats]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">◷</span>
          <div>
            <div className="brand-name">CRM-Time</div>
            <div className="brand-sub">Relationships, on time</div>
          </div>
        </div>
        <nav>
          <a className="nav-item active">Contacts</a>
          <a className="nav-item">Pipeline</a>
          <a className="nav-item">Reports</a>
        </nav>
        <div className="sidebar-footer">v0.1.0</div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h1>Contacts</h1>
            <p className="subtitle">Track leads, deals, and follow-ups.</p>
          </div>
          <button className="btn primary" onClick={() => setShowForm(true)}>
            + New contact
          </button>
        </header>

        <section className="stats">
          {statCards.map((c) => (
            <div className="stat-card" key={c.label}>
              <div className="stat-value">{c.value}</div>
              <div className="stat-label">{c.label}</div>
            </div>
          ))}
        </section>

        <section className="toolbar">
          <input
            className="search"
            placeholder="Search by name, email or company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="filters">
            <button
              className={`chip ${statusFilter === "" ? "active" : ""}`}
              onClick={() => setStatusFilter("")}
            >
              All
            </button>
            {CONTACT_STATUSES.map((s) => (
              <button
                key={s}
                className={`chip ${statusFilter === s ? "active" : ""}`}
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        {error && <p className="error banner">{error}</p>}

        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Status</th>
                <th>Value</th>
                <th>Last contacted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="empty">
                    Loading…
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No contacts yet. Click “New contact” to add one.
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="cell-name">{c.name}</div>
                      <div className="cell-sub">{c.email || "—"}</div>
                    </td>
                    <td>{c.company || "—"}</td>
                    <td>
                      <span className={`status status-${c.status}`}>{c.status}</span>
                    </td>
                    <td>{currency.format(c.value)}</td>
                    <td>{formatDate(c.lastContactedAt)}</td>
                    <td className="row-actions">
                      <button className="btn ghost sm" onClick={() => setEditing(c)}>
                        Edit
                      </button>
                      <button className="btn danger sm" onClick={() => handleDelete(c)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </main>

      {showForm && (
        <ContactForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      )}
      {editing && (
        <ContactForm
          initial={editing}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
