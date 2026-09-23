"use client";

import { FormEvent, useEffect, useState } from "react";

export default function TeamPage() {
  const [members, setMembers] = useState<{ id: string; role: string; name: string; email: string }[]>([]);
  const [invites, setInvites] = useState<{ id: string; url: string; email: string | null }[]>([]);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const d = await fetch("/api/team").then((r) => r.json());
    setMembers(d.members ?? []);
    setInvites(d.invites ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function invite(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email || undefined }),
    });
    const data = await res.json();
    if (!res.ok) setMsg(data.error);
    else {
      setMsg(data.invite.url);
      setEmail("");
      await load();
    }
  }

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Команда</h1>
      <p className="mt-2 text-muted">Владелец кладёт слоты. Менеджер берёт входящие и лиды, без токенов каналов.</p>
      <ul className="mt-6 space-y-2">
        {members.map((m) => (
          <li key={m.id} className="rounded-xl border border-line bg-slot px-4 py-3">
            {m.name} · {m.email} · {m.role === "owner" ? "владелец" : "менеджер"}
          </li>
        ))}
      </ul>
      <form onSubmit={invite} className="mt-8 flex max-w-lg gap-2">
        <input className="flex-1 rounded-xl border border-line bg-slot px-3 py-2" placeholder="почта менеджера (необязательно)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="rounded-xl bg-accent px-4 py-2 text-ink">Пригласить</button>
      </form>
      {msg && <p className="ok-banner mt-3 break-all rounded px-3 py-2 text-sm">{msg}</p>}
      <ul className="mt-4 space-y-1 text-sm">
        {invites.map((i) => (
          <li key={i.id} className="break-all">
            {i.url}
          </li>
        ))}
      </ul>
    </main>
  );
}
