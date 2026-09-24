"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Member = { userId: string; name: string };
type Task = {
  id: string;
  title: string;
  dueAt: string;
  doneAt: string | null;
  overdue: boolean;
  leadId: string;
  assigneeId: string | null;
  assignee: { id: string; name: string } | null;
};

export function FollowUps(opts: { leadId: string; initial?: Task[] }) {
  const [items, setItems] = useState<Task[]>(opts.initial || []);
  const [members, setMembers] = useState<Member[]>([]);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const [t, team] = await Promise.all([
      fetch(`/api/tasks?leadId=${opts.leadId}`).then((r) => r.json()),
      fetch("/api/team").then((r) => r.json()),
    ]);
    setItems(t.items || []);
    setMembers(team.members || []);
    if (!assigneeId && team.members?.[0]) setAssigneeId(team.members[0].userId);
  }

  useEffect(() => {
    load();
    if (!dueAt) {
      const d = new Date(Date.now() + 86400000);
      const pad = (n: number) => String(n).padStart(2, "0");
      setDueAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.leadId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: opts.leadId,
        title,
        dueAt: dueAt ? new Date(dueAt).toISOString() : "",
        assigneeId: assigneeId || undefined,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setMsg(d.error || "Ошибка");
    else {
      setTitle("");
      setMsg("Задачу поставили");
      await load();
    }
  }

  async function done(id: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    await load();
  }

  return (
    <section className="mt-8 max-w-xl">
      <h2 className="text-xl font-semibold">Задачи</h2>
      <p className="mt-1 text-sm text-muted">Срок, название и менеджер. Просроченные видны во входящих.</p>
      <ul className="mt-3 space-y-2">
        {items.map((t) => (
          <li key={t.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-slot px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{t.title}</span>
              {t.overdue && !t.doneAt && <span className="urgent-badge ml-2">просрочено</span>}
              {t.doneAt && <span className="ml-2 rounded bg-ok px-2 py-0.5 text-xs">готово</span>}
              <span className="mt-0.5 block text-xs text-muted">
                {new Date(t.dueAt).toLocaleString("ru-RU")}
                {t.assignee ? ` · ${t.assignee.name}` : ""}
              </span>
            </span>
            {!t.doneAt && (
              <button type="button" className="link text-xs" onClick={() => done(t.id)}>
                Готово
              </button>
            )}
          </li>
        ))}
        {!items.length && <li className="text-sm text-muted">Пока нет задач на этом лиде.</li>}
      </ul>
      <form onSubmit={save} className="mt-4 space-y-2">
        <input
          className="w-full rounded-xl border border-line bg-slot px-3 py-2 text-sm"
          placeholder="Название"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className="block text-sm">
          Срок
          <input
            className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2 text-sm"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Менеджер
          <select
            className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2 text-sm"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded-xl bg-accent px-4 py-2 text-sm text-ink">Поставить задачу</button>
        {msg && <p className="ok-banner rounded px-2 py-1 text-sm">{msg}</p>}
      </form>
    </section>
  );
}

export function OverdueList(opts: {
  items?: {
    id: string;
    title: string;
    dueAt: string;
    leadId: string;
    contactName?: string;
    assignee?: { name: string } | null;
  }[];
}) {
  const items = opts.items || [];
  if (!items.length) return null;
  return (
    <section className="mt-4 rounded border border-urgent/40 bg-paper p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-urgent">Просроченные задачи</p>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((t) => (
          <li key={t.id}>
            <Link className="link" href={`/leads/${t.leadId}`}>
              {t.contactName || "Лид"} · {t.title}
            </Link>
            <span className="ml-2 text-xs text-muted">
              {new Date(t.dueAt).toLocaleString("ru-RU")}
              {t.assignee ? ` · ${t.assignee.name}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
