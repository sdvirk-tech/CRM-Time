"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Msg = { id: string; direction: string; body: string };

export default function PublicChatPage() {
  const params = useParams<{ key: string }>();
  const [sessionId, setSessionId] = useState("");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [workspaceTitle, setWorkspaceTitle] = useState("");
  const [accentColor, setAccentColor] = useState("#99CCFF");
  const [status, setStatus] = useState("");
  const [consentText, setConsentText] = useState("Согласен на обработку персональных данных (152-ФЗ)");
  const [blocked, setBlocked] = useState(false);

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
    if (!res.ok) {
      setBlocked(true);
      setStatus(data.error || "Чат недоступен");
      return;
    }
    setMessages(data.messages ?? []);
    if (data.consentText) setConsentText(data.consentText);
    if (typeof data.needsConsent === "boolean") setNeedsConsent(data.needsConsent);
    if (data.branding?.workspaceTitle) setWorkspaceTitle(data.branding.workspaceTitle);
    if (data.branding?.accentColor) setAccentColor(data.branding.accentColor);
  }

  useEffect(() => {
    if (!sessionId) return;
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, params.key]);

  useEffect(() => {
    document.getElementById("chat-end")?.scrollIntoView({ block: "end" });
  }, [messages]);

  const visible = useMemo(() => messages, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() && !photo) return;
    if (needsConsent && !consent) {
      setStatus("Нужно согласие на обработку персональных данных (152-ФЗ)");
      return;
    }
    let res: Response;
    if (photo) {
      const form = new FormData();
      form.set("sessionId", sessionId);
      if (name) form.set("name", name);
      if (text.trim()) form.set("text", text.trim());
      form.set("photo", photo);
      if (consent) form.set("consent", "yes");
      res = await fetch(`/api/ingest/web-chat/${params.key}`, { method: "POST", body: form });
    } else {
      res = await fetch(`/api/ingest/web-chat/${params.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, name: name || undefined, text, consent: consent || undefined }),
      });
    }
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "Ошибка");
      return;
    }
    setText("");
    setPhoto(null);
    setStatus("");
    await load();
  }

  const title = workspaceTitle || "CRM-Time";

  if (blocked) {
    return (
      <main className="public-widget mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-urgent">{status}</p>
      </main>
    );
  }

  return (
    <main className="public-widget mx-auto flex min-h-screen max-w-md flex-col px-3 py-6 sm:px-4 sm:py-8">
      <p className="w-fit rounded px-2 py-1 text-xs uppercase tracking-[0.2em] text-ink" style={{ backgroundColor: accentColor }}>
        {title}
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Чат</h1>
      <input
        className="mt-4 w-full rounded border border-line bg-slot px-3 py-3"
        placeholder="Имя (необязательно)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <ol className="mt-4 max-h-[55vh] flex-1 space-y-2 overflow-auto rounded border bg-paper p-3" style={{ borderColor: accentColor }}>
        {visible.length === 0 && <li className="text-sm text-muted">Напишите — ответим здесь.</li>}
        {visible.map((m) => (
          <li
            key={m.id}
            className={`max-w-[90%] rounded px-3 py-2 text-sm ${
              m.direction === "inbound" ? "ml-auto text-ink" : "bg-mist text-ink"
            }`}
            style={m.direction === "inbound" ? { backgroundColor: accentColor } : undefined}
          >
            {m.body}
          </li>
        ))}
        <li id="chat-end" className="h-0 list-none p-0" />
      </ol>
      <form onSubmit={send} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="min-w-[12rem] flex-1 rounded border border-line bg-slot px-3 py-3"
          placeholder="Сообщение"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <label className="public-widget-btn flex cursor-pointer items-center rounded border border-line px-3 py-2 text-sm">
          Фото
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
        </label>
        {photo && <span className="text-xs text-muted">{photo.name}</span>}
        {needsConsent && (
          <label className="flex w-full items-start gap-2 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
            <span>{consentText}</span>
          </label>
        )}
        <button type="submit" className="public-widget-btn rounded px-4 py-3 text-ink" style={{ backgroundColor: accentColor }}>
          Отправить
        </button>
      </form>
      {status && <p className="mt-2 text-sm text-urgent">{status}</p>}
    </main>
  );
}
