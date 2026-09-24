"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

type Dup = { id: string; name: string; phone: string | null; telegram: string | null; reason: string };

export function MergeDuplicates({ items }: { items: Dup[] }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  if (!items?.length) return null;

  async function merge(otherId: string, name: string) {
    if (!window.confirm(`Склеить «${name}» с этой карточкой? Диалоги и лиды переедут сюда, вторая карточка удалится.`)) {
      return;
    }
    setBusy(otherId);
    setMsg("");
    const res = await fetch(`/api/contacts/${params.id}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otherId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error || "Не удалось склеить");
      return;
    }
    setMsg("Склеили");
    router.refresh();
    window.location.reload();
  }

  return (
    <section className="mt-8 max-w-xl rounded-xl border border-line bg-slot p-4">
      <h2 className="text-xl font-semibold">Похожие контакты</h2>
      <p className="mt-1 text-sm text-muted">Тот же телефон или Telegram. Склеить — подтвердите, карточки сойдутся сюда.</p>
      <ul className="mt-3 space-y-2">
        {items.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
            <span>
              <Link className="link" href={`/contacts/${d.id}`}>
                {d.name}
              </Link>
              {d.phone ? ` · ${d.phone}` : ""}
              {d.telegram ? ` · @${d.telegram.replace(/^@/, "")}` : ""}
              {" · "}
              {d.reason === "telegram" ? "Telegram" : "телефон"}
            </span>
            <button
              type="button"
              disabled={busy === d.id}
              onClick={() => merge(d.id, d.name)}
              className="rounded-xl bg-accent px-3 py-1 text-ink"
            >
              Склеить
            </button>
          </li>
        ))}
      </ul>
      {msg && <p className="ok-banner mt-3 rounded px-2 py-1 text-sm">{msg}</p>}
    </section>
  );
}
