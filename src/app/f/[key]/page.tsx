"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function PublicFormPage() {
  const params = useParams<{ key: string }>();
  const [chatUrl, setChatUrl] = useState("");
  const [workspaceTitle, setWorkspaceTitle] = useState("");
  const [accentColor, setAccentColor] = useState("#99CCFF");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [consentText, setConsentText] = useState("Согласен на обработку персональных данных (152-ФЗ)");
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    fetch(`/api/public-form/${params.key}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setBlocked(true);
          setError(d.error || "Форма недоступна");
          return;
        }
        if (d.chatUrl) setChatUrl(d.chatUrl);
        if (d.branding?.workspaceTitle) setWorkspaceTitle(d.branding.workspaceTitle);
        if (d.branding?.accentColor) setAccentColor(d.branding.accentColor);
        if (d.consentText) setConsentText(d.consentText);
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

  const title = workspaceTitle || "CRM-Time";

  if (blocked) {
    return (
      <main className="public-widget mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-urgent">{error}</p>
      </main>
    );
  }

  return (
    <main className="public-widget mx-auto max-w-md px-4 py-8 sm:px-6 sm:py-16">
      <p className="w-fit rounded px-2 py-1 text-xs uppercase tracking-[0.2em] text-ink" style={{ backgroundColor: accentColor }}>
        {title}
      </p>
      <h1 className="mt-2 text-3xl font-semibold">Имя и телефон</h1>
      <p className="mt-2 text-sm text-muted">Код ТН ВЭД и груз собираем в чате, не этой формой.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <input name="name" required placeholder="Имя" className="w-full rounded-xl border border-line bg-slot px-3 py-3" />
        <input name="phone" required placeholder="Телефон" className="w-full rounded-xl border border-line bg-slot px-3 py-3" />
        <label className="flex items-start gap-2 text-sm">
          <input name="consent" type="checkbox" required value="yes" className="mt-1" />
          <span>{consentText}</span>
        </label>
        <button type="submit" className="public-widget-btn w-full rounded-xl px-4 py-3 text-ink" style={{ backgroundColor: accentColor }}>
          Оставить контакт
        </button>
      </form>
      <p className="mt-4">
        {chatUrl ? (
          <a className="link" href={chatUrl} style={{ color: accentColor }}>
            Написать в чат
          </a>
        ) : (
          <span className="text-sm text-muted">Написать в чат — откройте виджет на сайте или Telegram.</span>
        )}
      </p>
      {status && <p className="ok-banner mt-4 rounded px-3 py-2 text-sm">{status}</p>}
      {error && <p className="mt-4 text-sm text-urgent">{error}</p>}
    </main>
  );
}
