"use client";

import { FormEvent, useEffect, useState } from "react";

export default function TeamPage() {
  const [members, setMembers] = useState<{ id: string; userId: string; role: string; name: string; email: string; telegram?: string }[]>([]);
  const [invites, setInvites] = useState<{ id: string; url: string; email: string | null }[]>([]);
  const [routingMode, setRoutingMode] = useState<"pool" | "round_robin">("pool");
  const [role, setRole] = useState("manager");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const d = await fetch("/api/team").then((r) => r.json());
    setMembers(d.members ?? []);
    setInvites(d.invites ?? []);
    if (d.routingMode === "round_robin" || d.routingMode === "pool") setRoutingMode(d.routingMode);
    if (d.role) setRole(d.role);
  }

  useEffect(() => {
    load();
  }, []);

  async function invite(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email || undefined }),
    });
    const data = await res.json();
    if (!res.ok) setMsg(data.error);
    else {
      setMsg(data.invite.url);
      setEmail("");
      await load();
    }
  }

  async function saveRouting(mode: "pool" | "round_robin") {
    setRoutingMode(mode);
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routingMode: mode }),
    });
    const data = await res.json();
    if (!res.ok) setMsg(data.error || "Ошибка");
    else setMsg(mode === "pool" ? "Свободный пул" : "По кругу");
  }

  const owner = role === "owner";

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Команда</h1>
      <p className="mt-2 text-muted">Владелец кладёт слоты. Менеджер берёт входящие и лиды, без токенов каналов.</p>
      {owner && (
        <fieldset className="mt-6 max-w-xl space-y-2 text-sm">
          <legend className="font-medium">Назначение, если менеджеров несколько</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="routing"
              checked={routingMode === "pool"}
              onChange={() => saveRouting("pool")}
            />
            Свободный пул — меньше открытых лидов
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="routing"
              checked={routingMode === "round_robin"}
              onChange={() => saveRouting("round_robin")}
            />
            По кругу
          </label>
          <p className="text-xs text-muted">Кнопка «взять» по-прежнему ставит того, кто нажал.</p>
        </fieldset>
      )}
      <ul className="mt-6 space-y-2">
        {members.map((m) => (
          <li key={m.id} className="rounded-xl border border-line bg-slot px-4 py-3">
            <p>
              {m.name} · {m.email} · {m.role === "owner" ? "владелец" : "менеджер"}
            </p>
            <label className="mt-2 flex items-center gap-2 text-sm">
              Telegram
              <input
                className="flex-1 rounded border border-line bg-paper px-2 py-1"
                placeholder="chat id или @username"
                defaultValue={m.telegram || ""}
                onBlur={async (e) => {
                  const telegram = e.target.value.trim();
                  const res = await fetch("/api/team", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ memberId: m.id, telegram }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) setMsg(data.error || "Ошибка");
                  else setMsg("Telegram сохранён");
                }}
              />
            </label>
          </li>
        ))}
      </ul>
      <form onSubmit={invite} className="mt-8 flex max-w-lg gap-2">
        <input className="flex-1 rounded-xl border border-line bg-slot px-3 py-2" placeholder="почта менеджера (необязательно)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="rounded-xl bg-accent px-4 py-2 text-ink">Пригласить</button>
      </form>
      {msg && <p className="ok-banner mt-3 break-all rounded px-3 py-2 text-sm">{msg}</p>}
      <ul className="mt-4 space-y-1 text-sm">
        {invites.map((i) => (
          <li key={i.id} className="break-all">
            {i.url}
          </li>
        ))}
      </ul>
    </main>
  );
}
