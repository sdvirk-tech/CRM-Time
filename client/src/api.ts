import type { Contact, ContactInput, Stats } from "./types";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function fetchContacts(search: string, status: string): Promise<Contact[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  const qs = params.toString();
  return handle<Contact[]>(await fetch(`/api/contacts${qs ? `?${qs}` : ""}`));
}

export async function fetchStats(): Promise<Stats> {
  return handle<Stats>(await fetch("/api/stats"));
}

export async function createContact(input: ContactInput): Promise<Contact> {
  return handle<Contact>(
    await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateContact(id: number, input: Partial<ContactInput>): Promise<Contact> {
  return handle<Contact>(
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteContact(id: number): Promise<void> {
  await handle<void>(await fetch(`/api/contacts/${id}`, { method: "DELETE" }));
}
