"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CargoCard } from "@/components/CargoCard";
import { MergeDuplicates } from "@/components/MergeDuplicates";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { channelLabel, leadStatusLabel } from "@/lib/labels";

type Msg = { direction: string; body: string };

export default function ContactPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch(`/api/contacts/${params.id}`)
      .then((r) => r.json())
      .then(setData);
  }, [params.id]);

  if (!data?.id) return <div className="p-8 text-muted">Загрузка…</div>;
  const contact = data as {
    id: string;
    name: string;
    phone: string | null;
    comment: string;
    channels: { type: string; externalId: string; username: string | null }[];
    leads: { id: string; status: string; urgent: boolean }[];
    conversations: { id: string; channel: { type: string }; messages?: Msg[] }[];
    fieldValues: { id: string; value: string; field: { name: string; key: string } }[];
    consentAt?: string | null;
    fx?: { asOfLabel?: string; usd?: string; cny?: string; eur?: string };
    photos?: { href: string; kind: string; label: string }[];
    duplicates?: { id: string; name: string; phone: string | null; telegram: string | null; reason: string }[];
    timeline?: { id: string; event: string; label: string; actor: string; message: string; createdAt: string }[];
  };

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">{contact.name}</h1>
      <p className="mt-2 text-muted">{contact.phone || "телефон не указан"}</p>
      {contact.consentAt && (
        <p className="mt-1 text-sm text-muted">Согласие 152-ФЗ: {new Date(contact.consentAt).toLocaleString("ru-RU")}</p>
      )}
      <p className="mt-3">
        <a className="link" href={`/api/contacts/${contact.id}?format=csv`}>
          Скачать CSV карточки
        </a>
        {" · "}
        <a className="link" href={`/api/contacts/${contact.id}?format=pdf`}>
          PDF карточки
        </a>
      </p>
      <p className="mt-4 max-w-xl text-sm">{contact.comment}</p>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Каналы</h2>
        <ul className="mt-2 text-sm">
          {contact.channels.map((c) => (
            <li key={c.externalId}>
              {channelLabel(c.type)}: {c.username || c.externalId}
            </li>
          ))}
        </ul>
      </section>
      <CargoCard
        name={contact.name}
        phone={contact.phone}
        values={contact.fieldValues}
        fx={contact.fx}
        photos={contact.photos}
        consentAt={contact.consentAt}
      />
      <MergeDuplicates items={contact.duplicates || []} />
      <ActivityTimeline items={contact.timeline || []} />
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Лиды</h2>
        <ul className="mt-2 space-y-1">
          {contact.leads.map((l) => (
            <li key={l.id}>
              <Link className="link" href={`/leads/${l.id}`}>
                {leadStatusLabel(l.status)}
                {l.urgent ? " · срочно" : ""}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Переписка</h2>
        <ul className="mt-2 space-y-3">
          {contact.conversations.map((c) => {
            const draft = [...(c.messages || [])].reverse().find((m) => m.direction === "draft");
            const snippet = draft?.body?.replace(/\s+/g, " ").trim().slice(0, 180);
            return (
              <li key={c.id}>
                <Link className="link" href={`/inbox/${c.id}`}>
                  Открыть диалог ({channelLabel(c.channel.type)})
                </Link>
                {snippet && <p className="mt-1 max-w-xl text-sm text-muted">Черновик: {snippet}</p>}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
