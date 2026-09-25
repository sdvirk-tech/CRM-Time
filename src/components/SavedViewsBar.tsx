"use client";

import { FormEvent, useEffect, useState } from "react";

type Props = {
  screen: "inbox" | "leads";
  currentQuery: Record<string, unknown>;
  onApply: (query: Record<string, unknown>) => void;
};

type Saved = { id: string; name: string; query: Record<string, unknown> };

export function SavedViewsBar({ screen, currentQuery, onApply }: Props) {
  const [items, setItems] = useState<Saved[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const d = await fetch(`/api/saved-views?screen=${screen}`).then((r) => r.json());
    setItems(d.items ?? []);
  }

  useEffect(() => {
    load();
  }, [screen]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await fetch("/api/saved-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screen, name: trimmed, query: currentQuery }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setMsg(d.error || "Ошибка");
    else {
      setMsg("Сохранили вид");
      setName("");
      await load();
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded border border-line bg-mist p-3 text-sm">
      <label className="block">
        <span className="text-muted">Сохранённые виды</span>
        <select
          className="mt-1 block min-w-[12rem] rounded-xl border border-line bg-paper px-3 py-2"
          defaultValue=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            const v = items.find((x) => x.id === id);
            if (v) onApply(v.query);
            e.target.value = "";
          }}
        >
          <option value="">Выберите вид…</option>
          {items.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <form onSubmit={save} className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-muted">Имя вида</span>
          <input
            className="mt-1 rounded-xl border border-line bg-paper px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="например: Telegram"
          />
        </label>
        <button type="submit" className="rounded-xl bg-accent px-3 py-2 text-ink">
          Сохранить текущий
        </button>
      </form>
      {items.length > 0 && (
        <button
          type="button"
          className="rounded-xl border border-line px-3 py-2"
          onClick={async () => {
            const id = items[items.length - 1]?.id;
            if (!id) return;
            const pick = prompt("ID вида для удаления (скопируйте из списка):", id);
            if (!pick) return;
            await fetch(`/api/saved-views?id=${encodeURIComponent(pick)}`, { method: "DELETE" });
            await load();
          }}
        >
          Удалить…
        </button>
      )}
      {msg && <p className="w-full text-xs text-muted">{msg}</p>}
    </div>
  );
}
