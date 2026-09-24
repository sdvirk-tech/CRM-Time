"use client";

import { CARGO_FIELDS, isCardComplete, isGenericName, missingCardSlots, snapshotFromBag } from "@/lib/sales";
import { extractPhotoRefs, type PhotoRef } from "@/lib/photos";
import { LeadQuickStatus } from "@/components/LeadQuickStatus";

type FieldVal = { value: string; field: { key: string; name: string } };
type Fx = { asOfLabel?: string; usd?: string; cny?: string; eur?: string };

export function CargoCard(opts: {
  name?: string | null;
  phone?: string | null;
  values?: FieldVal[];
  fx?: Fx | null;
  photos?: PhotoRef[] | { href: string; kind: string; label: string }[];
  leadId?: string | null;
  leadStatus?: string;
  onStatus?: () => void;
  consentAt?: string | null;
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
  const photos = opts.photos?.length ? opts.photos : extractPhotoRefs(byKey.get("cargo") || "");
  const fxLine = opts.fx && (opts.fx.usd || opts.fx.cny || opts.fx.eur)
    ? `Курс ЦБ РФ на ${opts.fx.asOfLabel || "сегодня"}: USD ${opts.fx.usd || "—"} · CNY ${opts.fx.cny || "—"} · EUR ${opts.fx.eur || "—"}`
    : "";
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
          {fxLine && (
            <tr className="border-b border-line">
              <th className="w-2/5 bg-mist px-3 py-2 text-left font-medium text-ink">Курс ЦБ</th>
              <td className="px-3 py-2">{fxLine}</td>
            </tr>
          )}
        </tbody>
      </table>
      {photos.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium">Фото груза</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {photos.map((p) => (
              <li key={p.href} className="w-24">
                {p.kind === "telegram" ? (
                  <a className="link text-xs" href={p.href} target="_blank" rel="noreferrer">
                    Скачать Telegram
                  </a>
                ) : (
                  <a href={p.href} target="_blank" rel="noreferrer" download className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.href} alt={p.label} className="h-20 w-24 rounded border border-line object-cover" />
                    <span className="mt-1 block text-xs link">Скачать</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {opts.consentAt && (
        <p className="mt-2 text-xs text-muted">Согласие 152-ФЗ: {new Date(opts.consentAt).toLocaleString("ru-RU")}</p>
      )}
      {opts.leadId && (
        <LeadQuickStatus leadId={opts.leadId} status={opts.leadStatus || "new"} onDone={opts.onStatus} />
      )}
      {!complete && missing.length > 0 && (
        <p className="mt-2 text-xs text-muted">Ещё: {missing.join(", ")}</p>
      )}
    </section>
  );
}
