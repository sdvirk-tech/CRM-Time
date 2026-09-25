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
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [members, setMembers] = useState<{ userId: string; name: string }[]>([]);
  const [bulkTag, setBulkTag] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkStatus, setBulkStatus] = useState("in_progress");
  const [bulkMsg, setBulkMsg] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null);
  const [kanbanMsg, setKanbanMsg] = useState("");

  async function load(filter = tag) {
    const q = filter ? `?tag=${encodeURIComponent(filter)}` : "";
    const [d, day, t, team] = await Promise.all([
      fetch("/api/leads" + q).then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/tags").then((r) => r.json()),
      fetch("/api/team").then((r) => r.json()),
    ]);
    setItems(d.items ?? []);
    setNewCount(d.newCount ?? 0);
    setStats(day);
    setTags(t.items ?? []);
    setMembers((team.members || []).map((m: { userId: string; name: string }) => ({ userId: m.userId, name: m.name })));
    setSelected((prev) => {
      const next: Record<string, boolean> = {};
      for (const l of d.items ?? []) if (prev[l.id]) next[l.id] = true;
      return next;
    });
  }

  useEffect(() => {
    load();
  }, []);

  async function claim(id: string) {
    await fetch(`/api/leads/${id}/claim`, { method: "POST" });
    await load();
  }

  async function moveLead(id: string, status: string, rejectReason?: string) {
    const body: Record<string, unknown> = { status };
    if (status === "rejected") body.rejectReason = rejectReason || "не указана";
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setKanbanMsg(d.error || "Не удалось сменить статус");
      return false;
    }
    setKanbanMsg("");
    await load();
    return true;
  }

  async function onDropColumn(colKey: string) {
    if (!dragId) return;
    const lead = items.find((l) => l.id === dragId);
    setDragId(null);
    if (!lead || lead.status === colKey || (colKey === "rejected" && lead.status === "lost")) return;
    if (colKey === "rejected") {
      setRejectModal({ id: lead.id, reason: "" });
      return;
    }
    await moveLead(lead.id, colKey);
  }

  const picked = items.filter((l) => selected[l.id]).map((l) => l.id);

  async function bulk(action: "tag" | "assign" | "status") {
    if (picked.length === 0) {
      setBulkMsg("Отметьте хотя бы один лид");
      return;
    }
    const body: Record<string, unknown> = { leadIds: picked, action };
    if (action === "tag") body.tagName = bulkTag.trim();
    if (action === "assign") body.assigneeId = bulkAssignee || null;
    if (action === "status") body.status = bulkStatus;
    const res = await fetch("/api/leads/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setBulkMsg(d.error || "Ошибка");
    else {
      setBulkMsg(`Обновили ${d.updated} лид(ов)`);
      setSelected({});
      await load();
    }
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
      <p className="mt-2 text-sm text-muted">Перетащите карточку между колонками — статус сохранится на сервере.</p>
      {kanbanMsg && <p className="mt-2 text-sm text-urgent">{kanbanMsg}</p>}
      <DayOverview stats={stats} onSla={load} />
      <section className="mt-6 max-w-3xl rounded-2xl border border-accent bg-mist p-4">
        <h2 className="text-lg font-semibold">Массовые действия</h2>
        <p className="mt-1 text-sm text-muted">Отметьте лиды в колонках — метка, назначение или статус. Удалить все нельзя.</p>
        <p className="mt-2 text-sm">Выбрано: {picked.length}</p>
        <div className="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <label className="block">
            Метка
            <input
              className="mt-1 rounded-xl border border-line bg-paper px-3 py-2"
              value={bulkTag}
              onChange={(e) => setBulkTag(e.target.value)}
              placeholder="VIP"
            />
          </label>
          <button type="button" className="rounded-xl bg-accent px-3 py-2 text-ink" onClick={() => bulk("tag")}>
            Поставить метку
          </button>
          <label className="block">
            Менеджер
            <select
              className="mt-1 rounded-xl border border-line bg-paper px-3 py-2"
              value={bulkAssignee}
              onChange={(e) => setBulkAssignee(e.target.value)}
            >
              <option value="">снять</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="rounded-xl border border-line px-3 py-2" onClick={() => bulk("assign")}>
            Назначить
          </button>
          <label className="block">
            Статус
            <select
              className="mt-1 rounded-xl border border-line bg-paper px-3 py-2"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
            >
              <option value="new">Новый</option>
              <option value="in_progress">В работе</option>
              <option value="qualified">Квалифицирован</option>
            </select>
          </label>
          <button type="button" className="rounded-xl border border-line px-3 py-2" onClick={() => bulk("status")}>
            Сменить статус
          </button>
        </div>
        {bulkMsg && <p className="ok-banner mt-2 rounded px-3 py-2 text-sm">{bulkMsg}</p>}
      </section>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => (
          <section
            key={col.key}
            className="rounded-2xl border border-accent bg-mist p-3"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              void onDropColumn(col.key);
            }}
          >
            <h2 className="px-2 text-lg font-semibold">{col.title}</h2>
            <ul className="mt-3 min-h-[4rem] space-y-2">
              {items
                .filter((l) => l.status === col.key || (col.key === "rejected" && l.status === "lost"))
                .map((l) => (
                  <li
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`cursor-grab rounded-xl border border-line bg-paper p-3 active:cursor-grabbing ${
                      dragId === l.id ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={Boolean(selected[l.id])}
                          onChange={(e) => setSelected((s) => ({ ...s, [l.id]: e.target.checked }))}
                        />
                        <Link href={`/leads/${l.id}`} className="font-medium">
                          {l.contact.name}
                        </Link>
                      </label>
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
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-paper p-4 shadow-lg">
            <h3 className="text-lg font-semibold">Причина отказа</h3>
            <p className="mt-1 text-sm text-muted">Короткий текст обязателен для колонки «Отказ».</p>
            <textarea
              className="mt-3 w-full rounded-xl border border-line bg-slot p-2 text-sm"
              rows={3}
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              placeholder="Например: не наш профиль"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => setRejectModal(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="rounded-xl bg-accent px-3 py-2 text-sm text-ink"
                onClick={async () => {
                  const ok = await moveLead(rejectModal.id, "rejected", rejectModal.reason.trim());
                  if (ok) setRejectModal(null);
                }}
              >
                Перенести в «Отказ»
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
