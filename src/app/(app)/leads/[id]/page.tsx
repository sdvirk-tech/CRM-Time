"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { leadStatusLabel, sourceLabel } from "@/lib/labels";
import { CargoCard } from "@/components/CargoCard";
import { LeadTags } from "@/components/LeadTags";
import { InternalNotes } from "@/components/InternalNotes";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { FollowUps } from "@/components/FollowUps";

export default function LeadPage() {
  const params = useParams<{ id: string }>();
  const [lead, setLead] = useState<{
    id: string;
    status: string;
    source: string;
    urgent: boolean;
    comment: string;
    contact: { id: string; name: string; phone: string | null; consentAt?: string | null };
    assignee: { name: string } | null;
    conversation: { id: string } | null;
    fieldValues?: { value: string; field: { key: string; name: string } }[];
    fx?: { asOfLabel?: string; usd?: string; cny?: string; eur?: string };
    photos?: { href: string; kind: string; label: string }[];
    tags?: { id: string; name: string }[];
    rejectReason?: string | null;
    followUps?: { id: string; title: string; dueAt: string; doneAt: string | null; overdue: boolean; leadId: string; assigneeId: string | null; assignee: { id: string; name: string } | null }[];
    timeline?: { id: string; event: string; label: string; actor: string; message: string; createdAt: string }[];
  } | null>(null);
  const [comment, setComment] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectErr, setRejectErr] = useState("");

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
    const body: { comment: string; status?: string; rejectReason?: string } = { comment, status };
    if (status === "rejected") body.rejectReason = rejectReason.trim();
    const res = await fetch(`/api/leads/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRejectErr(d.error || "Ошибка");
      return;
    }
    setRejectErr("");
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
        Источник: {sourceLabel(lead.source, "long")} · статус {leadStatusLabel(lead.status)} ·{" "}
        {lead.assignee ? lead.assignee.name : "без ответственного"}
      </p>
      <p className="mt-4">
        <Link className="link" href={`/contacts/${lead.contact.id}`}>
          Контакт
        </Link>
        {lead.conversation && (
          <>
            {" · "}
            <Link className="link" href={`/inbox/${lead.conversation.id}`}>
              Диалог
            </Link>
          </>
        )}
        {" · "}
        <a className="link" href={`/api/leads/${lead.id}?format=csv`}>
          CSV карточки
        </a>
        {" · "}
        <a className="link" href={`/api/leads/${lead.id}?format=pdf`}>
          PDF карточки
        </a>
      </p>
      <CargoCard
        name={lead.contact.name}
        phone={lead.contact.phone}
        values={lead.fieldValues}
        fx={lead.fx}
        photos={lead.photos}
        leadId={lead.id}
        leadStatus={lead.status}
        onStatus={load}
        consentAt={lead.contact.consentAt}
      />
      <LeadTags leadId={lead.id} initial={lead.tags} />
      <FollowUps leadId={lead.id} initial={lead.followUps} />
      <InternalNotes leadId={lead.id} conversationId={lead.conversation?.id} />
      <ActivityTimeline items={lead.timeline || []} />
      <textarea className="mt-6 w-full max-w-xl rounded-2xl border border-line bg-slot p-3" rows={5} value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => save()} className="rounded-xl border border-line px-4 py-2">
          Сохранить комментарий
        </button>
        <button onClick={claim} className="rounded-xl bg-accent px-4 py-2 text-ink">
          Взять
        </button>
        <button onClick={() => save("in_progress")} className="rounded-xl border px-4 py-2">
          В работе
        </button>
        <button onClick={() => save("qualified")} className="rounded-xl border px-4 py-2">
          Квалифицирован
        </button>
      </div>
      {lead.status !== "rejected" && (
        <div className="mt-3 max-w-xl space-y-2">
          <input
            className="w-full rounded-xl border border-line bg-slot px-3 py-2 text-sm"
            placeholder="Причина отказа"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            maxLength={280}
          />
          <button onClick={() => save("rejected")} className="rounded-xl border px-4 py-2">
            Отказ
          </button>
          {rejectErr && <p className="text-sm text-urgent">{rejectErr}</p>}
        </div>
      )}
      {lead.status === "rejected" && lead.rejectReason && (
        <p className="mt-3 text-sm text-muted">Причина отказа: {lead.rejectReason}</p>
      )}
    </main>
  );
}
