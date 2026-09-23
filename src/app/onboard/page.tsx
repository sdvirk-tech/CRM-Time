"use client";

import { FormEvent, useState } from "react";

export default function OnboardPage() {
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [ved, setVed] = useState(true);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, tradeDescription: trade, vedTemplate: ved, defaultModel: "mock:ok" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    window.location.assign("/flow");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <p className="text-sm uppercase tracking-[0.2em] text-ink">Онбординг</p>
      <h1 className="mt-3 text-3xl font-semibold">Чем торгуем и куда класть</h1>
      <p className="mt-2 text-muted">После этого на холсте пустая цепочка: положите канал.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm">
          Название воркспейса
          <input className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block text-sm">
          Чем торгуем
          <textarea className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2" rows={3} value={trade} onChange={(e) => setTrade(e.target.value)} required />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ved} onChange={(e) => setVed(e.target.checked)} />
          Шаблон полей ВЭД (ТН ВЭД, Incoterms, контейнер)
        </label>
        {error && <p className="text-sm text-urgent">{error}</p>}
        <button type="submit" className="rounded-xl bg-accent px-5 py-2.5 text-ink">
          Открыть холст
        </button>
      </form>
    </main>
  );
}
