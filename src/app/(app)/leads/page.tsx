"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DayOverview, DayStats } from "@/components/DayOverview";
import { sourceLabel } from "@/lib/labels";

type Lead = {
  id: string;
  status: string;
  source: string;
  urgent: boolean;
  comment: string;
  createdAt: string;
  contact: { id: string; name: string; phone: string | null };
  assignee: { id: string; name: string } | null;
  tags?: { id: string; name: string }[];
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
  const [stats, setStats] = useState<DayStats | null>(null);
  const [tag, setTag] = useState("");
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);

  async function load(filter = tag) {
    const q = filter ? `?tag=${encodeURIComponent(filter)}` : "";
    const [d, day, t] = await Promise.all([
      fetch("/api/leads" + q).then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/tags").then((r) => r.json()),
    ]);
    setItems(d.items ?? []);
    setNewCount(d.newCount ?? 0);
    setStats(day);
    setTags(t.items ?? []);
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
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Метка:</span>
        <button
          type="button"
          className={`rounded-full px-3 py-1 ${!tag ? "bg-accent text-ink" : "bg-slot"}`}
          onClick={() => {
            setTag("");
            load("");
          }}
        >
          все
        </button>
        {tags.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-full px-3 py-1 ${tag === t.name ? "bg-accent text-ink" : "bg-slot"}`}
            onClick={() => {
              setTag(t.name);
              load(t.name);
            }}
          >
            {t.name}
          </button>
        ))}
      </div>
      <a className="mt-3 inline-block rounded border border-accent bg-paper px-3 py-2 text-sm" href="/api/leads?format=csv">
        Скачать CSV
      </a>
      <DayOverview stats={stats} onSla={load} />
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => (
          <section key={col.key} className="rounded-2xl border border-accent bg-mist p-3">
            <h2 className="px-2 text-lg font-semibold">{col.title}</h2>
            <ul className="mt-3 space-y-2">
              {items
                .filter((l) => l.status === col.key || (col.key === "rejected" && l.status === "lost"))
                .map((l) => (
                  <li key={l.id} className="rounded-xl border border-line bg-paper p-3">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/leads/${l.id}`} className="font-medium">
                        {l.contact.name}
                      </Link>
                      {l.urgent && <span className="urgent-badge">срочно</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {sourceLabel(l.source)}
                      {l.assignee ? ` · ${l.assignee.name}` : " · никто"}
                    </p>
                    {l.tags && l.tags.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {l.tags.map((t) => (
                          <span key={t.id} className="rounded-full bg-mist px-2 py-0.5 text-[11px]">
                            {t.name}
                          </span>
                        ))}
                      </p>
                    )}
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
