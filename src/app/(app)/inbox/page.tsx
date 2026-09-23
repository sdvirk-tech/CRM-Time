"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  unread: boolean;
  urgent: boolean;
  urgentReason: string | null;
  aiError: string | null;
  contact: { id: string; name: string; phone: string | null };
  channel: { type: string; name: string };
  lastMessage: string;
  updatedAt: string;
};

export default function InboxPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread" | "urgent">("all");
  const [channel, setChannel] = useState<"all" | "web_form" | "telegram">("all");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("filter");
    if (q === "urgent" || q === "unread") setFilter(q);
    fetch("/api/inbox")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setUnread(d.unread ?? 0);
      });
  }, []);

  const visible = useMemo(() => {
    return items.filter((i) => {
      if (filter === "unread" && !i.unread) return false;
      if (filter === "urgent" && !i.urgent) return false;
      if (channel !== "all" && i.channel.type !== channel) return false;
      return true;
    });
  }, [items, filter, channel]);

  return (
    <main className="p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pine">Рабочий стол</p>
      <h1 className="mt-2 text-3xl font-semibold">Входящие</h1>
      <p className="mt-2 text-muted">Без ответа: {unread}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(["all", "unread", "urgent"] as const).map((f) => (
          <button key={f} className={filter === f ? "chip chip-on" : "chip"} onClick={() => setFilter(f)}>
            {f === "all" ? "все" : f === "unread" ? "без ответа" : "срочно"}
          </button>
        ))}
        {(["all", "web_form", "telegram"] as const).map((c) => (
          <button key={c} className={channel === c ? "chip chip-on" : "chip"} onClick={() => setChannel(c)}>
            {c === "all" ? "все каналы" : c === "web_form" ? "сайт" : "Telegram"}
          </button>
        ))}
      </div>
      <ul className="mt-6 divide-y divide-line overflow-hidden rounded border border-line bg-slot">
        {visible.length === 0 && <li className="p-6 text-muted">Нет заявок в этом фильтре.</li>}
        {visible.map((item) => (
          <li key={item.id}>
            <Link href={`/inbox/${item.id}`} className="flex items-start justify-between gap-4 p-4 hover:bg-white/5">
              <div>
                <p className="font-medium">
                  {item.contact.name}
                  {item.unread && <span className="ml-2 text-xs text-pine">новое</span>}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{item.lastMessage}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded border border-line px-2 py-0.5 text-xs">{item.channel.type === "web_form" ? "сайт" : "Telegram"}</span>
                {item.urgent && <span className="urgent-badge">срочно</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
