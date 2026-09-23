"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Msg = { id: string; direction: string; body: string };

export default function PublicChatPage() {
  const params = useParams<{ key: string }>();
  const [sessionId, setSessionId] = useState("");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const key = `crm-time-chat-${params.key}`;
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    setSessionId(id);
  }, [params.key]);

  async function load() {
    if (!sessionId) return;
    const res = await fetch(`/api/ingest/web-chat/${params.key}?sessionId=${encodeURIComponent(sessionId)}`);
    const data = await res.json();
    setMessages(data.messages ?? []);
  }

  useEffect(() => {
    if (!sessionId) return;
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, params.key]);

  const visible = useMemo(() => messages, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const res = await fetch(`/api/ingest/web-chat/${params.key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, name: name || undefined, text }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "Ошибка");
      return;
    }
    setText("");
    setStatus("");
    await load();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-8">
      <p className="w-fit rounded bg-mist px-2 py-1 text-xs uppercase tracking-[0.2em] text-ink">CRM-Time</p>
      <h1 className="mt-2 text-2xl font-semibold">Чат</h1>
      <input
        className="mt-4 rounded border border-line bg-slot px-3 py-2"
        placeholder="Имя (необязательно)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <ol className="mt-4 flex-1 space-y-2 overflow-auto rounded border border-accent bg-paper p-3">
        {visible.length === 0 && <li className="text-sm text-muted">Напишите — ответим здесь.</li>}
        {visible.map((m) => (
          <li
            key={m.id}
            className={`max-w-[90%] rounded px-3 py-2 text-sm ${
              m.direction === "inbound" ? "ml-auto bg-accent text-ink" : "bg-mist text-ink"
            }`}
          >
            {m.body}
          </li>
        ))}
      </ol>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded border border-line bg-slot px-3 py-2"
          placeholder="Сообщение"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="rounded bg-accent px-4 py-2 text-ink">Отправить</button>
      </form>
      {status && <p className="mt-2 text-sm text-urgent">{status}</p>}
    </main>
  );
}
