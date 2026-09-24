"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function PublicFormPage() {
  const params = useParams<{ key: string }>();
  const [chatUrl, setChatUrl] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/public-form/${params.key}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.chatUrl) setChatUrl(d.chatUrl);
      })
      .catch(() => {});
  }, [params.key]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("");
    setError("");
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const res = await fetch(`/api/ingest/web-form/${params.key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    setStatus("Приняли контакт. Продолжим в чате.");
    e.currentTarget.reset();
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <p className="w-fit rounded bg-mist px-2 py-1 text-xs uppercase tracking-[0.2em] text-ink">CRM-Time</p>
      <h1 className="mt-2 text-3xl font-semibold">Имя и телефон</h1>
      <p className="mt-2 text-sm text-muted">Код ТН ВЭД и груз собираем в чате, не этой формой.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <input name="name" required placeholder="Имя" className="w-full rounded-xl border border-line bg-slot px-3 py-2" />
        <input name="phone" required placeholder="Телефон" className="w-full rounded-xl border border-line bg-slot px-3 py-2" />
        <button className="w-full rounded-xl bg-accent px-4 py-2 text-ink">Оставить контакт</button>
      </form>
      {chatUrl && (
        <p className="mt-4">
          <a className="link" href={chatUrl}>
            Написать в чат
          </a>
        </p>
      )}
      {status && <p className="ok-banner mt-4 rounded px-3 py-2 text-sm">{status}</p>}
      {error && <p className="mt-4 text-sm text-urgent">{error}</p>}
    </main>
  );
}
