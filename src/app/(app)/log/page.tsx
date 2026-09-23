"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  actor: string;
  event: string;
  message: string;
  createdAt: string;
};

export default function LogPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/log")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
  }, []);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((i) => `${i.actor} ${i.event} ${i.message}`.toLowerCase().includes(s));
  }, [items, q]);

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Журнал</h1>
      <p className="mt-2 text-muted">События линии: вход, handoff, взять, ошибки. Без CSV.</p>
      <input
        className="mt-4 max-w-md rounded border border-line bg-slot px-3 py-2"
        placeholder="Поиск"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-mist text-left text-ink">
            <th className="py-2 pr-3 font-medium">Время</th>
            <th className="py-2 pr-3 font-medium">Событие</th>
            <th className="py-2 pr-3 font-medium">Кто</th>
            <th className="py-2 font-medium">Сообщение</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td className="py-4 text-muted" colSpan={4}>
                Пока пусто.
              </td>
            </tr>
          )}
          {visible.map((i) => (
            <tr key={i.id} className="border-b border-line">
              <td className="py-2 pr-3 text-muted">{new Date(i.createdAt).toLocaleString("ru")}</td>
              <td className="py-2 pr-3">{i.event}</td>
              <td className="py-2 pr-3">{i.actor}</td>
              <td className="py-2">{i.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
