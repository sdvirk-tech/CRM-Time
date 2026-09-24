"use client";

import { FormEvent, useEffect, useState } from "react";

type Item = { id: string; title: string; body: string };

export function CannedManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const d = await fetch("/api/canned").then((r) => r.json());
    setItems(d.items || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/canned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setMsg(d.error || "Ошибка");
    else {
      setTitle("");
      setBody("");
      setMsg("Шаблон сохранён");
      await load();
    }
  }

  async function remove(id: string) {
    await fetch(`/api/canned/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <section className="mt-12 max-w-xl">
      <h2 className="text-xl font-semibold">Шаблоны ответов</h2>
      <p className="mt-1 text-sm text-muted">Вставляются в черновик на карточке диалога. Клиенту сами не уходят.</p>
      <ul className="mt-3 space-y-2">
        {items.map((i) => (
          <li key={i.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-slot px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{i.title}</span>
              <span className="mt-0.5 block text-xs text-muted">{i.body.slice(0, 160)}</span>
            </span>
            <button type="button" className="link text-xs" onClick={() => remove(i.id)}>
              Удалить
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={save} className="mt-4 space-y-2">
        <input
          className="w-full rounded-xl border border-line bg-slot px-3 py-2 text-sm"
          placeholder="Название"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="w-full rounded-xl border border-line bg-slot p-3 text-sm"
          rows={3}
          placeholder="Текст шаблона"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button className="rounded-xl bg-accent px-4 py-2 text-sm text-ink">Добавить шаблон</button>
        {msg && <p className="ok-banner rounded px-2 py-1 text-sm">{msg}</p>}
      </form>
    </section>
  );
}
