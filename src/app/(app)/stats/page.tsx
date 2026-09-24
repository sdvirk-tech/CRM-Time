"use client";

import { useEffect, useState } from "react";
import { DayOverview, DayStats } from "@/components/DayOverview";

export default function StatsPage() {
  const [stats, setStats] = useState<DayStats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  const f = stats?.funnel;
  return (
    <main className="p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink">Рабочий стол</p>
      <h1 className="mt-2 text-3xl font-semibold">Воронка и KPI</h1>
      <p className="mt-2 max-w-xl text-muted">Не BI: статусы лидов, без ответа, доля взяли→квалифицирован.</p>
      <DayOverview stats={stats} onSla={() => fetch("/api/stats").then((r) => r.json()).then(setStats)} />
      {f && (
        <section className="mt-8 max-w-xl">
          <h2 className="text-xl font-semibold">Воронка</h2>
          <table className="mt-3 w-full border-collapse text-sm">
            <tbody>
              {[
                ["Новый", f.new],
                ["В работе", f.in_progress],
                ["Квалифицирован", f.qualified],
                ["Отказ", f.rejected],
                ["Взяли", stats?.taken ?? 0],
                ["Взяли→квалиф.", `${stats?.conversion ?? 0}%`],
                ["Без ответа", stats?.unread ?? 0],
              ].map(([k, v]) => (
                <tr key={String(k)} className="border-b border-line">
                  <th className="bg-mist px-3 py-2 text-left font-medium">{k}</th>
                  <td className="px-3 py-2">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="mt-8 max-w-xl">
        <h2 className="text-xl font-semibold">Менеджеры</h2>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-mist text-left">
              <th className="px-3 py-2 font-medium">Имя</th>
              <th className="px-3 py-2 font-medium">Назначено</th>
              <th className="px-3 py-2 font-medium">Взяли</th>
              <th className="px-3 py-2 font-medium">Квалиф.</th>
              <th className="px-3 py-2 font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {(stats?.managers ?? []).map((m, i) => (
              <tr key={m.userId || m.name + i} className="border-b border-line">
                <td className="px-3 py-2">{m.name}</td>
                <td className="px-3 py-2">{m.assigned}</td>
                <td className="px-3 py-2">{m.taken}</td>
                <td className="px-3 py-2">{m.qualified}</td>
                <td className="px-3 py-2">{m.conversion}%</td>
              </tr>
            ))}
            {!(stats?.managers ?? []).length && (
              <tr>
                <td className="px-3 py-3 text-muted" colSpan={5}>
                  Пока нет сотрудников в воронке.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
