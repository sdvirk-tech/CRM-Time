"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [box, setBox] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err) setError(err);
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setBox(d.deployMode === "box");
        if (d.user?.onboarded) window.location.replace("/flow");
        else if (d.user) window.location.replace("/onboard");
      })
      .catch(() => {});
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink">CRM-Time</p>
      <h1 className="mt-3 text-3xl font-semibold">Вход</h1>
      <p className="mt-2 text-muted">Канал → AI → действие. Входящие и лиды рядом.</p>
      <form method="POST" action="/api/auth/login/form" className="mt-8 space-y-4">
        <label className="block text-sm">
          Почта
          <input className="mt-1 w-full rounded border border-line bg-slot px-3 py-2" name="email" type="email" required />
        </label>
        <label className="block text-sm">
          Пароль
          <input className="mt-1 w-full rounded border border-line bg-slot px-3 py-2" name="password" type="password" required />
        </label>
        <button type="submit" className="w-full rounded bg-accent px-4 py-2.5 text-ink">
          Войти
        </button>
        {error && <p className="text-sm text-urgent">{error}</p>}
      </form>
      {!box && (
        <p className="mt-6 text-sm text-muted">
          Нет воркспейса?{" "}
          <Link className="link" href="/register">
            Регистрация
          </Link>
        </p>
      )}
      {box && (
        <p className="mt-6 text-sm text-muted">Режим коробки: данные на этой машине. Публичная регистрация выключена.</p>
      )}
    </main>
  );
}
