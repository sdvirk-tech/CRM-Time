"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Lead = {
  id: string;
  status: string;
  source: string;
  urgent: boolean;
  comment: string;
  createdAt: string;
  contact: { id: string; name: string; phone: string | null };
  assignee: { id: string; name: string } | null;
};

const columns = [
  { key: "new", title: "Новый" },
  { key: "in_progress", title: "В работе" },
  { key: "qualified", title: "Квалифицирован" },
  { key: "rejected", title: "Отказ" },
];

export default function LeadsPage() {
  const [items, setItems] = useState<Lead[]>([]);
  const [newCount, setNewCount] = useState(0);

  async function load() {
    const d = await fetch("/api/leads").then((r) => r.json());
    setItems(d.items ?? []);
    setNewCount(d.newCount ?? 0);
  }

  useEffect(() => {
    load();
  }, []);

  async function claim(id: string) {
    await fetch(`/api/leads/${id}/claim`, { method: "POST" });
    await load();
  }

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Очередь лидов</h1>
      <p className="mt-2 text-muted">Новые: {newCount}</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => (
          <section key={col.key} className="rounded-2xl border border-accent bg-mist p-3">
            <h2 className="px-2 text-lg font-semibold">{col.title}</h2>
            <ul className="mt-3 space-y-2">
              {items
                .filter((l) => l.status === col.key)
                .map((l) => (
                  <li key={l.id} className="rounded-xl border border-line bg-paper p-3">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/leads/${l.id}`} className="font-medium">
                        {l.contact.name}
                      </Link>
                      {l.urgent && <span className="urgent-badge">срочно</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {l.source === "web_form" ? "сайт" : "Telegram"}
                      {l.assignee ? ` · ${l.assignee.name}` : " · никто"}
                    </p>
                    {col.key === "new" && (
                      <button onClick={() => claim(l.id)} className="mt-2 text-sm link">
                        Взять
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
