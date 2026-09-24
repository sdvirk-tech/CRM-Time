"use client";

import { FormEvent, useEffect, useState } from "react";

type Note = { id: string; body: string; author: string; createdAt: string };

export function InternalNotes(opts: { leadId?: string; conversationId?: string }) {
  const [items, setItems] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const q = opts.leadId ? `leadId=${opts.leadId}` : `conversationId=${opts.conversationId}`;
    const d = await fetch(`/api/notes?${q}`).then((r) => r.json());
    setItems(d.items || []);
  }

  useEffect(() => {
    if (opts.leadId || opts.conversationId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.leadId, opts.conversationId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text, leadId: opts.leadId, conversationId: opts.conversationId }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setMsg(d.error || "Ошибка");
    else {
      setText("");
      setMsg("Заметку сохранили — клиенту не уйдёт");
      await load();
    }
  }

  return (
    <section className="mt-8 max-w-xl">
      <h2 className="text-xl font-semibold">Внутренние заметки</h2>
      <p className="mt-1 text-xs text-muted">Только владелец и менеджер. В чат клиента не попадает.</p>
      <ul className="mt-3 space-y-2">
        {items.map((n) => (
          <li key={n.id} className="rounded-xl border border-line bg-mist px-3 py-2 text-sm">
            <p className="text-xs text-muted">
              {n.author} · {new Date(n.createdAt).toLocaleString("ru-RU")}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={save} className="mt-3 space-y-2">
        <textarea
          className="w-full rounded-xl border border-line bg-slot p-3 text-sm"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Заметка коллегам…"
        />
        <button className="rounded-xl border border-line bg-paper px-3 py-1.5 text-sm">Добавить заметку</button>
        {msg && <p className="ok-banner rounded px-2 py-1 text-sm">{msg}</p>}
      </form>
    </section>
  );
}
