"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.deployMode === "box" && d.registrationOpen === false) setBlocked(true);
      });
  }, []);

  async function create() {
    setError("");
    setPending(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка");
      setPending(false);
      return;
    }
    window.location.assign("/onboard");
  }

  if (blocked) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="font-serif text-3xl">Регистрация выключена</h1>
        <p className="mt-3 text-muted">DEPLOY_MODE=box — войдите или примите приглашение.</p>
        <Link className="mt-6 inline-block text-pine underline" href="/login">
          Ко входу
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-sm uppercase tracking-[0.2em] text-pine">CRM-Time</p>
      <h1 className="mt-3 font-serif text-4xl">Собрать воркспейс</h1>
      <div className="mt-8 space-y-4">
        <label className="block text-sm">
          Ваше имя
          <input className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>
        <label className="block text-sm">
          Почта
          <input className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </label>
        <label className="block text-sm">
          Пароль
          <input className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        </label>
        {error && <p className="text-sm text-urgent">{error}</p>}
        <button type="button" disabled={pending} onClick={create} className="w-full rounded-xl bg-ink px-4 py-2.5 text-paper disabled:opacity-60">
          {pending ? "Создаём…" : "Создать"}
        </button>
      </div>
      <p className="mt-6 text-sm text-muted">
        Уже есть вход?{" "}
        <Link className="text-pine underline" href="/login">
          Войти
        </Link>
      </p>
    </main>
  );
}
