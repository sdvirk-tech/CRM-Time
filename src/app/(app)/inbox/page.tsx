"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DayOverview, DayStats } from "@/components/DayOverview";

type Item = {
  id: string;
  unread: boolean;
  pinned?: boolean;
  archived?: boolean;
  snoozedUntil?: string | null;
  urgent: boolean;
  stale?: boolean;
  urgentReason: string | null;
  status: string;
  aiError: string | null;
  cardReady?: boolean;
  pingDrafted?: boolean;
  pingSent?: boolean;
  contact: { id: string; name: string; phone: string | null };
  channel: { type: string; name: string };
  lastMessage: string;
  updatedAt: string;
};

export default function InboxPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [stats, setStats] = useState<DayStats | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "urgent" | "stale">("all");
  const [channel, setChannel] = useState<"all" | "web_form" | "telegram" | "web_chat" | "email">("all");
  const [status, setStatus] = useState<"all" | "ai" | "manager" | "closed">("all");
  const [view, setView] = useState<"active" | "archived" | "snoozed">("active");

  async function load(nextView = view) {
    const q = new URLSearchParams(window.location.search).get("filter");
    if (q === "urgent" || q === "unread" || q === "stale") setFilter(q);
    const [inbox, day] = await Promise.all([
      fetch(`/api/inbox?view=${nextView}`).then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
    ]);
    setItems(inbox.items ?? []);
    setUnread(inbox.unread ?? 0);
    setStats(day);
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    return items.filter((i) => {
      if (filter === "unread" && !i.unread) return false;
      if (filter === "urgent" && !i.urgent) return false;
      if (filter === "stale" && !i.stale) return false;
      if (channel !== "all" && i.channel.type !== channel) return false;
      if (status !== "all" && i.status !== status) return false;
      return true;
    });
  }, [items, filter, channel, status]);

  return (
    <main className="p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink">Рабочий стол</p>
      <h1 className="mt-2 text-3xl font-semibold">Входящие</h1>
      <p className="mt-2 text-muted">Без ответа: {unread}</p>
      <DayOverview stats={stats} onSla={load} />
      <div className="mt-4 flex flex-wrap gap-2">
        {(["active", "archived", "snoozed"] as const).map((v) => (
          <button
            key={v}
            className={view === v ? "chip chip-on" : "chip"}
            onClick={() => {
              setView(v);
              load(v);
            }}
          >
            {v === "active" ? "активные" : v === "archived" ? "архив" : "отложенные"}
          </button>
        ))}
        {(["all", "unread", "urgent", "stale"] as const).map((f) => (
          <button key={f} className={filter === f ? "chip chip-on" : "chip"} onClick={() => setFilter(f)}>
            {f === "all" ? "все" : f === "unread" ? "без ответа" : f === "urgent" ? "срочно" : "завис"}
          </button>
        ))}
        {(["all", "web_form", "web_chat", "telegram", "email"] as const).map((c) => (
          <button key={c} className={channel === c ? "chip chip-on" : "chip"} onClick={() => setChannel(c)}>
            {c === "all" ? "все каналы" : c === "web_form" ? "форма" : c === "web_chat" ? "чат" : c === "email" ? "почта" : "Telegram"}
          </button>
        ))}
        {(["all", "ai", "manager", "closed"] as const).map((s) => (
          <button key={s} className={status === s ? "chip chip-on" : "chip"} onClick={() => setStatus(s)}>
            {s === "all" ? "все статусы" : s === "ai" ? "ИИ" : s === "manager" ? "менеджер" : "закрыто"}
          </button>
        ))}
      </div>
      <ul className="mt-6 divide-y divide-line overflow-hidden rounded border border-accent bg-paper">
        {visible.length === 0 && <li className="p-6 text-muted">Нет заявок в этом фильтре.</li>}
        {visible.map((item) => (
          <li key={item.id} className="flex items-stretch">
            <Link href={`/inbox/${item.id}`} className="flex flex-1 items-start justify-between gap-4 p-4 hover:bg-mist">
              <div>
                <p className="font-medium">
                  {item.pinned && <span className="mr-2 text-xs font-semibold">закреплено</span>}
                  {item.snoozedUntil && <span className="mr-2 text-xs font-semibold">отложено</span>}
                  {item.contact.name}
                  {item.unread && <span className="ml-2 text-xs font-semibold">новое</span>}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{item.lastMessage}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded border border-line px-2 py-0.5 text-xs">
                  {item.channel.type === "web_form"
                    ? "форма"
                    : item.channel.type === "web_chat"
                      ? "чат"
                      : item.channel.type === "email"
                        ? "почта"
                        : "Telegram"}
                  {item.status === "manager" ? " · менеджер" : item.status === "closed" ? " · закрыто" : ""}
                </span>
                {item.urgent && <span className="urgent-badge">срочно</span>}
                {item.urgentReason === "silent_client" && <span className="urgent-badge">пинг</span>}
                {item.stale && <span className="urgent-badge">завис</span>}
                {item.pingDrafted && !item.pingSent && (
                  <span className="rounded border border-dashed border-accent px-2 py-0.5 text-xs">черновик пинга</span>
                )}
                {item.cardReady && <span className="rounded bg-ok px-2 py-0.5 text-xs">карточка</span>}
              </div>
            </Link>
            <div className="flex shrink-0 flex-col border-l border-line">
              <button
                type="button"
                className="px-3 py-2 text-xs hover:bg-mist"
                onClick={async () => {
                  await fetch(`/api/conversations/${item.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: item.pinned ? "unpin" : "pin" }),
                  });
                  await load();
                }}
              >
                {item.pinned ? "Открепить" : "Закрепить"}
              </button>
              {view === "active" && (
                <button
                  type="button"
                  className="border-t border-line px-3 py-2 text-xs hover:bg-mist"
                  onClick={async () => {
                    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
                    await fetch(`/api/conversations/${item.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "snooze", until }),
                    });
                    await load();
                  }}
                >
                  Отложить 1 ч
                </button>
              )}
              {view === "snoozed" && (
                <button
                  type="button"
                  className="border-t border-line px-3 py-2 text-xs hover:bg-mist"
                  onClick={async () => {
                    await fetch(`/api/conversations/${item.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "unsnooze" }),
                    });
                    await load("snoozed");
                  }}
                >
                  Вернуть
                </button>
              )}
              {view !== "archived" ? (
                <button
                  type="button"
                  className="border-t border-line px-3 py-2 text-xs hover:bg-mist"
                  onClick={async () => {
                    await fetch(`/api/conversations/${item.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "archive" }),
                    });
                    await load();
                  }}
                >
                  В архив
                </button>
              ) : (
                <button
                  type="button"
                  className="border-t border-line px-3 py-2 text-xs hover:bg-mist"
                  onClick={async () => {
                    await fetch(`/api/conversations/${item.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "unarchive" }),
                    });
                    await load("archived");
                  }}
                >
                  Из архива
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
