"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function PublicFormPage() {
  const params = useParams<{ key: string }>();
  const [fields, setFields] = useState<{ key: string; name: string; fieldType: string; required: boolean }[]>([
    { key: "tnved", name: "ТН ВЭД", fieldType: "tnved", required: true },
    { key: "incoterms", name: "Incoterms", fieldType: "incoterms", required: false },
  ]);
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/public-form/${params.key}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.fields) setFields(d.fields);
      })
      .catch(() => {});
  }, [params.key]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("");
    setErrors({});
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const res = await fetch(`/api/ingest/web-form/${params.key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErrors(data.errors ?? {});
      setStatus(data.error || "Ошибка");
      return;
    }
    setStatus("Заявка принята");
    e.currentTarget.reset();
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <p className="text-xs uppercase tracking-[0.2em] text-pine">CRM-Time</p>
      <h1 className="mt-2 font-serif text-4xl">Оставить заявку</h1>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <input name="name" required placeholder="Имя" className="w-full rounded-xl border border-line bg-slot px-3 py-2" />
        <input name="phone" required placeholder="Телефон" className="w-full rounded-xl border border-line bg-slot px-3 py-2" />
        {fields.map((f) => (
          <label key={f.key} className="block text-sm">
            {f.name}
            {f.required ? " *" : ""}
            <input name={f.key} required={f.required} className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2" />
            {errors[f.key] && <span className="text-urgent">{errors[f.key]}</span>}
          </label>
        ))}
        <textarea name="comment" placeholder="Комментарий" className="w-full rounded-xl border border-line bg-slot px-3 py-2" rows={4} />
        <button className="w-full rounded-xl bg-ink px-4 py-2 text-paper">Отправить</button>
      </form>
      {status && <p className="mt-4 text-sm">{status}</p>}
    </main>
  );
}
