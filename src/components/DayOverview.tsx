"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

export type DayStats = {
  unread: number;
  newLeads: number;
  urgent: number;
  stale: number;
  slaMinutes: number;
  today: { inbound: number; leads: number; outbound: number };
  funnel?: { new: number; in_progress: number; qualified: number; rejected: number };
  conversion?: number;
  taken?: number;
  managers?: { userId?: string; name: string; taken: number; qualified: number; conversion: number; assigned: number }[];
  role?: string;
};

export function DayOverview({ stats, onSla }: { stats: DayStats | null; onSla?: () => void }) {
  const [sla, setSla] = useState(String(stats?.slaMinutes ?? 15));
  const [msg, setMsg] = useState("");
  const owner = stats?.role === "owner";

  useEffect(() => {
    if (stats) setSla(String(stats.slaMinutes));
  }, [stats]);

  async function saveSla(e: FormEvent) {
    e.preventDefault();
    const slaMinutes = Number(sla);
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slaMinutes }),
    });
    const data = await res.json();
    if (!res.ok) setMsg(data.error || "Ошибка");
    else {
      setMsg("SLA сохранён");
      onSla?.();
    }
  }

  if (!stats) return null;
  const f = stats.funnel;
  return (
    <section className="mt-4 rounded border border-accent bg-paper p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink">За сутки</p>
      <p className="mt-2 text-sm">
        Входящих {stats.today.inbound} · лидов {stats.today.leads} · ответов {stats.today.outbound}
      </p>
      <p className="mt-1 text-sm text-muted">
        Сейчас: без ответа {stats.unread} · новые лиды {stats.newLeads} · срочно {stats.urgent} · завис {stats.stale}
        <span className="block text-xs">Молчит клиент после нашего ответа — тоже завис. Черновик пинга — по кнопке «Отправить», если нет явной модели на слоте пинга.</span>
      </p>
      {f && (
        <p className="mt-2 text-sm">
          Воронка: новый {f.new} · в работе {f.in_progress} · квалиф. {f.qualified} · отказ {f.rejected}
          {" · "}
          взяли→квалиф. {stats.conversion ?? 0}%
          {" · "}
          <Link className="link" href="/stats">
            KPI
          </Link>
        </p>
      )}
      {stats.managers && stats.managers.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          Менеджеры:{" "}
          {stats.managers
            .filter((m) => m.assigned > 0 || m.taken > 0)
            .map((m) => `${m.name} ${m.qualified}/${m.taken || m.assigned}`)
            .join(" · ") || "пока без взятых"}
        </p>
      )}
      {owner && (
        <form onSubmit={saveSla} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <label>
            Завис после, мин
            <input
              className="ml-2 w-20 rounded border border-line bg-slot px-2 py-1"
              type="number"
              min={0}
              max={1440}
              value={sla}
              onChange={(e) => setSla(e.target.value)}
            />
          </label>
          <button className="rounded bg-accent px-3 py-1 text-ink">Ок</button>
          {msg && <span className={msg.includes("сохран") ? "ok-banner rounded px-2 py-1" : "text-urgent"}>{msg}</span>}
        </form>
      )}
    </section>
  );
}
