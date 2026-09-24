"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { channelLabel, leadStatusLabel, urgentReasonLabel } from "@/lib/labels";
import { CargoCard } from "@/components/CargoCard";
import { LeadQuickStatus } from "@/components/LeadQuickStatus";

type Msg = { id: string; direction: string; body: string; aiError: string | null; createdAt: string };
type Operator = { userId: string; name: string; role: string };
type FieldVal = { value: string; field: { key: string; name: string } };
type Data = {
  id: string;
  urgent: boolean;
  urgentReason: string | null;
  status: string;
  aiError: string | null;
  pingDraftedAt?: string | null;
  pingSentAt?: string | null;
  assignee?: { id: string; name: string } | null;
  operators?: Operator[];
  contact: {
    id: string;
    name: string;
    phone: string | null;
    consentAt?: string | null;
    leads: { id: string }[];
    fieldValues?: FieldVal[];
  };
  channel: { type: string; name: string };
  messages: Msg[];
  leads?: { id: string; status: string }[];
  fx?: { asOfLabel?: string; usd?: string; cny?: string; eur?: string };
  photos?: { href: string; kind: string; label: string }[];
};

export default function ConversationPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [target, setTarget] = useState("");

  async function load() {
    const res = await fetch(`/api/conversations/${params.id}`);
    const json = await res.json();
    setData(json);
    const draft = [...(json.messages ?? [])].reverse().find((m: Msg) => m.direction === "draft");
    if (draft) setText(draft.body);
    if (!target && json.operators?.[0]) setTarget(json.operators[0].userId);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function send(e: FormEvent, sendOut: boolean) {
    e.preventDefault();
    const res = await fetch(`/api/conversations/${params.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, send: sendOut }),
    });
    const json = await res.json();
    if (!res.ok) setMsg(json.error);
    else {
      setMsg(sendOut ? "Отправлено" : "Черновик сохранён");
      await load();
    }
  }

  async function createLead() {
    const res = await fetch(`/api/conversations/${params.id}/create-lead`, { method: "POST" });
    const json = await res.json();
    if (res.ok) setMsg("Лид в очереди");
    else setMsg(json.error);
    await load();
  }

  async function act(action: "take" | "reset" | "close" | "ai" | "redirect") {
    const res = await fetch(`/api/conversations/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, userId: action === "redirect" ? target : undefined }),
    });
    const json = await res.json();
    if (!res.ok) setMsg(json.error);
    else if (action === "ai") setMsg(json.resent ? "Вернули ИИ, последний ответ ушёл клиенту" : "Вернули ИИ");
    else if (action === "redirect") setMsg("Перенаправили");
    else if (action === "take") setMsg("Взяли в работу, ИИ молчит");
    else if (action === "reset") setMsg("Сессия сброшена, клиенту ничего не ушло");
    else setMsg("Диалог закрыт");
    await load();
    if (res.ok && action === "ai") setMsg(json.resent ? "Вернули ИИ, последний ответ ушёл клиенту" : "Вернули ИИ");
    if (res.ok && action === "redirect") setMsg("Перенаправили");
  }

  if (!data?.id) return <div className="p-8 text-muted">Загрузка…</div>;
  const draft = [...data.messages].reverse().find((m) => m.direction === "draft");
  const others = (data.operators ?? []).filter((o) => o.userId !== data.assignee?.id);
  const leadId = data.leads?.[0]?.id || data.contact.leads[0]?.id;
  const leadStatus = data.leads?.[0]?.status || "new";
  const cardValues = data.contact.fieldValues ?? [];

  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_280px]">
      <section className="p-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold">{data.contact.name}</h1>
          {data.urgent && <span className="urgent-badge">срочно</span>}
        </div>
        <p className="mt-1 text-sm text-muted">
          {channelLabel(data.channel.type)}
          {data.assignee && ` · ${data.assignee.name}`}
          {urgentReasonLabel(data.urgentReason) && ` · ${urgentReasonLabel(data.urgentReason)}`}
          {data.pingDraftedAt && !data.pingSentAt && " · черновик пинга"}
          {data.pingSentAt && " · пинг ушёл"}
          {data.status === "manager" && " · у менеджера"}
          {data.status === "closed" && " · закрыто"}
        </p>
        {msg && <p className="ok-banner mt-3 inline-block rounded px-2 py-1 text-sm">{msg}</p>}
        {data.aiError && <p className="mt-3 rounded border border-urgent/40 bg-urgent/15 p-3 text-sm">{data.aiError}</p>}
        {(cardValues.length > 0 || (data.photos?.length ?? 0) > 0) && (
          <CargoCard
            name={data.contact.name}
            phone={data.contact.phone}
            values={cardValues}
            fx={data.fx}
            photos={data.photos}
            leadId={leadId}
            leadStatus={leadStatus}
            onStatus={load}
            consentAt={data.contact.consentAt}
          />
        )}
        {leadId && (
          <p className="mt-2 text-sm">
            Лид{" "}
            <Link className="link" href={`/leads/${leadId}`}>
              {leadStatusLabel(leadStatus)}
            </Link>
            {" · "}диалог привязан, писать можно здесь
          </p>
        )}
        {leadId && <LeadQuickStatus leadId={leadId} status={leadStatus} onDone={load} />}
        <ol className="mt-6 space-y-3">
          {data.messages.map((m) => (
            <li
              key={m.id}
              className={`max-w-xl rounded-lg px-4 py-3 text-sm ${
                m.direction === "inbound"
                  ? "bg-mist"
                  : m.direction === "draft"
                    ? "border border-dashed border-accent bg-paper"
                    : m.direction === "system"
                      ? m.aiError
                        ? "border border-urgent/40 bg-urgent/15 text-ink"
                        : "bg-slot text-muted"
                      : "ml-auto bg-accent text-ink"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wider opacity-70">
                {m.direction === "inbound"
                  ? "клиент"
                  : m.direction === "draft"
                    ? data.pingDraftedAt && !data.pingSentAt
                      ? "пинг"
                      : "черновик"
                    : m.direction === "system"
                      ? m.aiError
                        ? "ошибка"
                        : "система"
                      : "вы"}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ol>
        <form className="mt-8 space-y-3">
          <textarea className="w-full rounded-2xl border border-line bg-slot p-3" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ответ клиенту…" />
          <div className="flex flex-wrap gap-2">
            <button onClick={(e) => send(e, false)} className="rounded-xl border border-line px-4 py-2">
              Сохранить черновик
            </button>
            <button onClick={(e) => send(e, true)} className="rounded-xl bg-accent px-4 py-2 text-ink">
              Отправить
            </button>
          </div>
          {draft && (
            <p className="text-xs text-muted">
              {data.pingDraftedAt && !data.pingSentAt
                ? "Черновик пинга: клиент молчит дольше SLA. В чат уйдёт только после «Отправить», если на слоте пинга нет явной модели."
                : cardValues.length
                ? "Коммерческий черновик по карточке. В чат сайта и Telegram уйдёт только после «Отправить»."
                : data.channel.type === "web_chat"
                  ? "Пока карточка собирается, явная модель может отвечать в чате. Коммерческий ответ после карточки — кнопкой «Отправить»."
                  : "Черновик модели уже подставлен. В Telegram уйдёт только после «Отправить»."}
            </p>
          )}
        </form>
      </section>
      <aside className="border-t border-line bg-mist p-6 lg:border-l lg:border-t-0">
        <p className="text-xs uppercase tracking-widest text-muted">Контакт</p>
        <Link className="mt-2 block text-xl font-semibold link" href={`/contacts/${data.contact.id}`}>
          Открыть карточку
        </Link>
        <p className="mt-2 text-sm">{data.contact.phone || "нет телефона"}</p>
        <button onClick={createLead} className="mt-6 w-full rounded-xl bg-accent px-4 py-2 text-ink">
          Создать лид
        </button>
        <div className="mt-4 grid gap-2">
          {data.status !== "manager" && (
            <button onClick={() => act("take")} className="rounded border border-accent bg-mist px-4 py-2 text-sm">
              Взять
            </button>
          )}
          <button onClick={() => act("ai")} className="rounded border border-line px-4 py-2 text-sm">
            Вернуть ИИ (повтор ответа)
          </button>
          <button onClick={() => act("reset")} className="rounded border border-line px-4 py-2 text-sm">
            Сбросить сессию
          </button>
          {data.status !== "closed" && (
            <button onClick={() => act("close")} className="rounded border border-line px-4 py-2 text-sm">
              Закрыть
            </button>
          )}
        </div>
        {others.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted">Перенаправить</p>
            <select className="w-full rounded border border-line bg-paper px-2 py-1 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
              {data.operators?.map((o) => (
                <option key={o.userId} value={o.userId}>
                  {o.name}
                </option>
              ))}
            </select>
            <button onClick={() => act("redirect")} className="w-full rounded border border-accent bg-paper px-4 py-2 text-sm">
              Перенаправить
            </button>
          </div>
        )}
        {data.contact.leads[0] && (
          <Link className="mt-3 block text-sm underline" href={`/leads/${data.contact.leads[0].id}`}>
            К лиду
          </Link>
        )}
      </aside>
    </main>
  );
}
