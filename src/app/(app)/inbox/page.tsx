"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    fetch("/api/inbox")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setUnread(d.unread ?? 0);
      });
  }, []);

  return (
    <main className="p-8">
      <p className="text-xs uppercase tracking-[0.2em] text-pine">Рабочий стол</p>
      <h1 className="mt-2 font-serif text-4xl">Входящие</h1>
      <p className="mt-2 text-muted">Без ответа: {unread}</p>
      <ul className="mt-8 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-slot">
        {items.length === 0 && <li className="p-6 text-muted">Пока тихо. Положите канал и примите заявку.</li>}
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/inbox/${item.id}`} className="flex items-start justify-between gap-4 p-4 hover:bg-paper">
              <div>
                <p className="font-medium">
                  {item.contact.name}
                  {item.unread && <span className="ml-2 text-xs text-pine">новое</span>}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{item.lastMessage}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full bg-[#efe8db] px-2 py-0.5 text-xs">{item.channel.type === "web_form" ? "сайт" : "Telegram"}</span>
                {item.urgent && <span className="urgent-badge">срочно</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
