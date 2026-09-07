import type { DB } from "./db.js";

export const CONTACT_STATUSES = ["lead", "active", "won", "churned"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export interface Contact {
  id: number;
  name: string;
  email: string;
  company: string;
  phone: string;
  status: ContactStatus;
  value: number;
  notes: string;
  createdAt: string;
  lastContactedAt: string | null;
}

export interface ContactInput {
  name: string;
  email?: string;
  company?: string;
  phone?: string;
  status?: ContactStatus;
  value?: number;
  notes?: string;
  lastContactedAt?: string | null;
}

interface ContactRow {
  id: number;
  name: string;
  email: string;
  company: string;
  phone: string;
  status: string;
  value: number;
  notes: string;
  created_at: string;
  last_contacted_at: string | null;
}

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    phone: row.phone,
    status: row.status as ContactStatus,
    value: row.value,
    notes: row.notes,
    createdAt: row.created_at,
    lastContactedAt: row.last_contacted_at,
  };
}

export class ValidationError extends Error {}

function normalize(input: ContactInput, existing?: Contact): Contact {
  const name = (input.name ?? existing?.name ?? "").trim();
  if (!name) {
    throw new ValidationError("name is required");
  }

  const status = input.status ?? existing?.status ?? "lead";
  if (!CONTACT_STATUSES.includes(status)) {
    throw new ValidationError(
      `status must be one of: ${CONTACT_STATUSES.join(", ")}`,
    );
  }

  const value = input.value ?? existing?.value ?? 0;
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new ValidationError("value must be a non-negative number");
  }

  return {
    id: existing?.id ?? 0,
    name,
    email: (input.email ?? existing?.email ?? "").trim(),
    company: (input.company ?? existing?.company ?? "").trim(),
    phone: (input.phone ?? existing?.phone ?? "").trim(),
    status,
    value,
    notes: (input.notes ?? existing?.notes ?? "").trim(),
    createdAt: existing?.createdAt ?? "",
    lastContactedAt:
      input.lastContactedAt !== undefined
        ? input.lastContactedAt
        : (existing?.lastContactedAt ?? null),
  };
}

export class ContactsRepository {
  constructor(private readonly db: DB) {}

  list(search?: string, status?: string): Contact[] {
    const clauses: string[] = [];
    const params: Record<string, string> = {};

    if (search && search.trim()) {
      clauses.push(
        "(name LIKE @q OR email LIKE @q OR company LIKE @q)",
      );
      params.q = `%${search.trim()}%`;
    }
    if (status && status.trim()) {
      clauses.push("status = @status");
      params.status = status.trim();
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `SELECT * FROM contacts ${where} ORDER BY datetime(created_at) DESC, id DESC`,
      )
      .all(params) as ContactRow[];
    return rows.map(toContact);
  }

  get(id: number): Contact | undefined {
    const row = this.db
      .prepare("SELECT * FROM contacts WHERE id = ?")
      .get(id) as ContactRow | undefined;
    return row ? toContact(row) : undefined;
  }

  create(input: ContactInput): Contact {
    const c = normalize(input);
    const info = this.db
      .prepare(
        `INSERT INTO contacts (name, email, company, phone, status, value, notes, last_contacted_at)
         VALUES (@name, @email, @company, @phone, @status, @value, @notes, @lastContactedAt)`,
      )
      .run({
        name: c.name,
        email: c.email,
        company: c.company,
        phone: c.phone,
        status: c.status,
        value: c.value,
        notes: c.notes,
        lastContactedAt: c.lastContactedAt,
      });
    return this.get(Number(info.lastInsertRowid))!;
  }

  update(id: number, input: ContactInput): Contact | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const c = normalize(input, existing);
    this.db
      .prepare(
        `UPDATE contacts
         SET name = @name, email = @email, company = @company, phone = @phone,
             status = @status, value = @value, notes = @notes, last_contacted_at = @lastContactedAt
         WHERE id = @id`,
      )
      .run({
        id,
        name: c.name,
        email: c.email,
        company: c.company,
        phone: c.phone,
        status: c.status,
        value: c.value,
        notes: c.notes,
        lastContactedAt: c.lastContactedAt,
      });
    return this.get(id);
  }

  remove(id: number): boolean {
    const info = this.db.prepare("DELETE FROM contacts WHERE id = ?").run(id);
    return info.changes > 0;
  }

  stats() {
    const total = (
      this.db.prepare("SELECT COUNT(*) AS n FROM contacts").get() as {
        n: number;
      }
    ).n;
    const byStatus = this.db
      .prepare("SELECT status, COUNT(*) AS n FROM contacts GROUP BY status")
      .all() as { status: string; n: number }[];
    const pipelineValue = (
      this.db
        .prepare(
          "SELECT COALESCE(SUM(value), 0) AS v FROM contacts WHERE status IN ('lead','active','won')",
        )
        .get() as { v: number }
    ).v;

    const statusCounts: Record<string, number> = {};
    for (const s of CONTACT_STATUSES) statusCounts[s] = 0;
    for (const r of byStatus) statusCounts[r.status] = r.n;

    return { total, byStatus: statusCounts, pipelineValue };
  }
}
