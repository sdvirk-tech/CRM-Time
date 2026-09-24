"use client";

import { FormEvent, useEffect, useState } from "react";

type Tag = { id: string; name: string };

export function LeadTags({ leadId, initial }: { leadId: string; initial?: Tag[] }) {
  const [tags, setTags] = useState<Tag[]>(initial || []);
  const [all, setAll] = useState<Tag[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setTags(initial || []);
  }, [initial]);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setAll(d.items || []))
      .catch(() => {});
  }, []);

  async function add(raw: string) {
    const value = raw.trim();
    if (!value) return;
    const res = await fetch(`/api/leads/${leadId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: value }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setMsg(d.error || "Ошибка");
    else {
      setTags(d.tags || []);
      setName("");
      setMsg("");
      const list = await fetch("/api/tags").then((r) => r.json());
      setAll(list.items || []);
    }
  }

  async function remove(tagId: string) {
    const res = await fetch(`/api/leads/${leadId}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setTags(d.tags || []);
  }

  return (
    <section className="mt-8 max-w-xl">
      <h2 className="text-xl font-semibold">Метки</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => remove(t.id)}
            className="rounded-full bg-mist px-3 py-1 text-sm"
            title="Снять метку"
          >
            {t.name} ×
          </button>
        ))}
        {!tags.length && <p className="text-sm text-muted">Пока нет</p>}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          add(name);
        }}
      >
        <input
          className="flex-1 rounded-xl border border-line bg-slot px-3 py-2 text-sm"
          list={`tags-${leadId}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Новая или существующая"
        />
        <datalist id={`tags-${leadId}`}>
          {all.map((t) => (
            <option key={t.id} value={t.name} />
          ))}
        </datalist>
        <button className="rounded-xl bg-accent px-3 py-2 text-sm text-ink">Поставить</button>
      </form>
      {msg && <p className="mt-2 text-sm text-urgent">{msg}</p>}
    </section>
  );
}
