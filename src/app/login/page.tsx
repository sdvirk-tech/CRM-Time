"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [box, setBox] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setBox(d.deployMode === "box");
        if (d.user?.onboarded) window.location.replace("/flow");
        else if (d.user) window.location.replace("/onboard");
      })
      .catch(() => {});
  }, []);

  async function login() {
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка входа");
        setPending(false);
        return;
      }
      window.location.assign(data.needsOnboarding ? "/onboard" : "/flow");
    } catch {
      setError("Сеть недоступна");
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-sm uppercase tracking-[0.2em] text-pine">CRM-Time</p>
      <h1 className="mt-3 font-serif text-4xl">Вход в нож</h1>
      <p className="mt-2 text-muted">Канал → AI → действие. Входящие и лиды рядом.</p>
      <div className="mt-8 space-y-4">
        <label className="block text-sm">
          Почта
          <input
            className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="off"
            onKeyDown={(e) => e.key === "Enter" && login()}
          />
        </label>
        <label className="block text-sm">
          Пароль
          <input
            className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="off"
            onKeyDown={(e) => e.key === "Enter" && login()}
          />
        </label>
        {error && <p className="text-sm text-urgent">{error}</p>}
        <button
          type="button"
          disabled={pending}
          onClick={login}
          className="w-full rounded-xl bg-ink px-4 py-2.5 text-paper disabled:opacity-60"
        >
          {pending ? "Входим…" : "Войти"}
        </button>
      </div>
      {!box && (
        <p className="mt-6 text-sm text-muted">
          Нет воркспейса?{" "}
          <Link className="text-pine underline" href="/register">
            Регистрация
          </Link>
        </p>
      )}
      {box && <p className="mt-6 text-sm text-muted">Режим коробки: регистрация закрыта.</p>}
    </main>
  );
}
