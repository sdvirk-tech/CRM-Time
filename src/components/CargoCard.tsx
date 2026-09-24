"use client";

import { CARGO_FIELDS, isCardComplete, isGenericName, missingCardSlots, snapshotFromBag } from "@/lib/sales";

type FieldVal = { value: string; field: { key: string; name: string } };

export function CargoCard(opts: {
  name?: string | null;
  phone?: string | null;
  values?: FieldVal[];
}) {
  const byKey = new Map((opts.values ?? []).map((v) => [v.field.key, v.value]));
  const bag: Record<string, string> = {};
  for (const [k, v] of byKey) bag[k] = v;
  const snap = snapshotFromBag(bag, opts.name, opts.phone);
  const complete = isCardComplete(snap);
  const missing = missingCardSlots(snap);
  const rows: { label: string; value: string }[] = [
    { label: "Имя", value: opts.name && !isGenericName(opts.name) ? opts.name : "" },
    { label: "Телефон", value: opts.phone || "" },
    ...CARGO_FIELDS.map((f) => ({ label: f.name, value: byKey.get(f.key) || "" })),
  ];
  const shown = complete ? rows : rows.filter((r) => r.value.trim());
  return (
    <section className="mt-8 max-w-xl">
      <h2 className="text-xl font-semibold">{complete ? "Итоговые данные" : "Собираем в чате"}</h2>
      {!complete && (
        <p className="mt-1 text-sm text-muted">Пустые поля не пишем. Спросим в чате, пока карточка не полная.</p>
      )}
      <table className="mt-3 w-full border-collapse text-sm">
        <tbody>
          {shown.map((r) => (
            <tr key={r.label} className="border-b border-line">
              <th className="w-2/5 bg-mist px-3 py-2 text-left font-medium text-ink">{r.label}</th>
              <td className="px-3 py-2">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!complete && missing.length > 0 && (
        <p className="mt-2 text-xs text-muted">Ещё: {missing.join(", ")}</p>
      )}
    </section>
  );
}
