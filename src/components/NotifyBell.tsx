"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Note = {
  id: string;
  title: string;
  body: string;
  href?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export function NotifyBell() {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  async function load() {
    const d = await fetch("/api/notifications").then((r) => r.json());
    setUnread(d.unread ?? 0);
    setItems(d.items ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function hide(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", hide);
    return () => document.removeEventListener("mousedown", hide);
  }, []);

  async function mark(id?: string, all?: boolean) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all ? { all: true } : { id }),
    });
    await load();
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className="relative rounded-xl border border-line bg-paper px-3 py-2 text-sm"
        onClick={() => setOpen((v) => !v)}
        aria-label="Уведомления"
      >
        Колокольчик
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 rounded bg-urgent px-1.5 text-[11px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-80 max-h-96 overflow-auto rounded-xl border border-line bg-paper shadow-sm">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-sm font-medium">Уведомления</p>
            {unread > 0 && (
              <button type="button" className="link text-xs" onClick={() => mark(undefined, true)}>
                Прочитать все
              </button>
            )}
          </div>
          {!items.length && <p className="px-3 py-3 text-sm text-muted">Пока тихо</p>}
          <ul>
            {items.map((n) => (
              <li key={n.id} className={`border-b border-line ${n.readAt ? "" : "bg-mist/60"}`}>
                <Link
                  href={n.href || "/leads"}
                  className="block px-3 py-2 text-sm"
                  onClick={() => {
                    if (!n.readAt) mark(n.id);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{n.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{n.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
