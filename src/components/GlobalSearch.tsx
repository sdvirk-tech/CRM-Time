"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Hit = { kind: string; id: string; href: string; title: string; subtitle: string };

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ contacts: Hit[]; leads: Hit[]; conversations: Hit[] }>({
    contacts: [],
    leads: [],
    conversations: [],
  });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setData({ contacts: [], leads: [], conversations: [] });
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((d) => {
          setData({
            contacts: d.contacts || [],
            leads: d.leads || [],
            conversations: d.conversations || [],
          });
          setOpen(true);
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function hide(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", hide);
    return () => document.removeEventListener("mousedown", hide);
  }, []);

  const empty = !data.contacts.length && !data.leads.length && !data.conversations.length;

  function group(title: string, items: Hit[]) {
    if (!items.length) return null;
    return (
      <div>
        <p className="px-3 py-1 text-xs uppercase tracking-[0.12em] text-muted">{title}</p>
        <ul>
          {items.map((h) => (
            <li key={h.kind + h.id}>
              <Link
                href={h.href}
                className="block px-3 py-2 text-sm hover:bg-mist"
                onClick={() => {
                  setOpen(false);
                  setQ("");
                }}
              >
                <span className="font-medium">{h.title}</span>
                {h.subtitle && <span className="mt-0.5 block text-xs text-muted">{h.subtitle}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div ref={box} className="relative min-w-[12rem] flex-1">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => q.trim().length >= 2 && setOpen(true)}
        placeholder="Поиск: имя, телефон, Telegram, груз"
        className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-line bg-paper shadow-sm">
          {empty && <p className="px-3 py-3 text-sm text-muted">Ничего не нашли</p>}
          {group("Контакты", data.contacts)}
          {group("Лиды", data.leads)}
          {group("Диалоги", data.conversations)}
        </div>
      )}
    </div>
  );
}
