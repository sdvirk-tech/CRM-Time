"use client";

import { CARGO_FIELDS } from "@/lib/sales";

type FieldVal = { value: string; field: { key: string; name: string } };

export function CargoCard(opts: {
  name?: string | null;
  phone?: string | null;
  values?: FieldVal[];
}) {
  const byKey = new Map((opts.values ?? []).map((v) => [v.field.key, v.value]));
  const rows: { label: string; value: string }[] = [
    { label: "Имя", value: opts.name || "" },
    { label: "Телефон", value: opts.phone || "" },
    ...CARGO_FIELDS.map((f) => ({ label: f.name, value: byKey.get(f.key) || "" })),
  ];
  return (
    <section className="mt-8 max-w-xl">
      <h2 className="text-xl font-semibold">Карточка груза</h2>
      <table className="mt-3 w-full border-collapse text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line">
              <th className="w-2/5 bg-mist px-3 py-2 text-left font-medium text-ink">{r.label}</th>
              <td className="px-3 py-2">{r.value || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
