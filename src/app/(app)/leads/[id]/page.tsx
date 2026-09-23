"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function LeadPage() {
  const params = useParams<{ id: string }>();
  const [lead, setLead] = useState<{
    id: string;
    status: string;
    source: string;
    urgent: boolean;
    comment: string;
    contact: { id: string; name: string; phone: string | null };
    assignee: { name: string } | null;
    conversation: { id: string } | null;
  } | null>(null);
  const [comment, setComment] = useState("");

  async function load() {
    const d = await fetch(`/api/leads/${params.id}`).then((r) => r.json());
    setLead(d);
    setComment(d.comment ?? "");
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function save(status?: string) {
    await fetch(`/api/leads/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment, status }),
    });
    await load();
  }

  async function claim() {
    await fetch(`/api/leads/${params.id}/claim`, { method: "POST" });
    await load();
  }

  if (!lead?.id) return <div className="p-8 text-muted">Загрузка…</div>;

  return (
    <main className="p-8">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-semibold">Лид · {lead.contact.name}</h1>
        {lead.urgent && <span className="urgent-badge">срочно</span>}
      </div>
      <p className="mt-2 text-muted">
        Источник: {lead.source === "web_form" ? "форма сайта" : "Telegram"} · статус {lead.status} ·{" "}
        {lead.assignee ? lead.assignee.name : "без ответственного"}
      </p>
      <p className="mt-4">
        <Link className="text-pine underline" href={`/contacts/${lead.contact.id}`}>
          Контакт
        </Link>
        {lead.conversation && (
          <>
            {" · "}
            <Link className="text-pine underline" href={`/inbox/${lead.conversation.id}`}>
              Диалог
            </Link>
          </>
        )}
      </p>
      <textarea className="mt-6 w-full max-w-xl rounded-2xl border border-line bg-slot p-3" rows={5} value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => save()} className="rounded-xl border border-line px-4 py-2">
          Сохранить комментарий
        </button>
        <button onClick={claim} className="rounded-xl bg-pine px-4 py-2 text-paper">
          Взять
        </button>
        <button onClick={() => save("in_progress")} className="rounded-xl border px-4 py-2">
          В работе
        </button>
        <button onClick={() => save("qualified")} className="rounded-xl border px-4 py-2">
          Квалифицирован
        </button>
        <button onClick={() => save("rejected")} className="rounded-xl border px-4 py-2">
          Отказ
        </button>
      </div>
    </main>
  );
}
