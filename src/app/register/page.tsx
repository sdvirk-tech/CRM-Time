"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function RegisterPage() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.deployMode === "box" && d.registrationOpen === false) setBlocked(true);
      });
  }, []);

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
      <form method="POST" action="/api/auth/register/form" className="mt-8 space-y-4">
        <label className="block text-sm">
          Ваше имя
          <input className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2" name="name" required />
        </label>
        <label className="block text-sm">
          Почта
          <input className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2" type="email" name="email" required />
        </label>
        <label className="block text-sm">
          Пароль
          <input className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2" type="password" name="password" required minLength={6} />
        </label>
        <button type="submit" className="w-full rounded-xl bg-ink px-4 py-2.5 text-paper">
          Создать
        </button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Уже есть вход?{" "}
        <Link className="text-pine underline" href="/login">
          Войти
        </Link>
      </p>
    </main>
  );
}
