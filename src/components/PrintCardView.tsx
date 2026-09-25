"use client";

import { useEffect } from "react";

type Row = { label: string; value: string };

export function PrintCardView(opts: { title: string; meta: string[]; rows: Row[] }) {
  const rows = opts.rows.filter((r) => r.value.trim() || r.label === "Курс ЦБ");
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <main className="print-card mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">{opts.title}</h1>
      {opts.meta.map((m) => (
        <p key={m} className="mt-1 text-sm text-muted">
          {m}
        </p>
      ))}
      <table className="mt-6 w-full border-collapse text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line">
              <th className="w-2/5 bg-mist px-3 py-2 text-left font-medium">{r.label}</th>
              <td className="px-3 py-2 whitespace-pre-wrap">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-8 text-xs text-muted">CRM-Time · {new Date().toLocaleString("ru-RU")}</p>
    </main>
  );
}
