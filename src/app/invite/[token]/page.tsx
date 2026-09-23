"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [workspaceName, setWorkspaceName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/invite/${params.token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setWorkspaceName(d.workspaceName);
          if (d.email) setEmail(d.email);
        }
      });
  }, [params.token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/invite/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else router.push("/inbox");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold">Приглашение</h1>
      <p className="mt-2 text-muted">{workspaceName ? `Воркспейс «${workspaceName}», роль менеджер` : "…"}</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <input className="w-full rounded-xl border border-line bg-slot px-3 py-2" placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="w-full rounded-xl border border-line bg-slot px-3 py-2" placeholder="Почта" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full rounded-xl border border-line bg-slot px-3 py-2" placeholder="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {error && <p className="text-sm text-urgent">{error}</p>}
        <button className="w-full rounded-xl bg-ink px-4 py-2 text-paper">Присоединиться</button>
      </form>
    </main>
  );
}
