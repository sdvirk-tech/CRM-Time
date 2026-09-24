import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { normalizePhone } from "@/lib/validators";
import { z } from "zod";
import { csvBody } from "@/lib/csv";
import { channelLabel, leadStatusLabel } from "@/lib/labels";
import { cargoCardPdf } from "@/lib/pdf";
import { dlpContact, maskEmailIf, maskPhoneIf, maskPii, shouldMask } from "@/lib/dlp";
import { getCbrRates } from "@/lib/cbr";
import { findDuplicateContacts } from "@/lib/contacts";
import { extractPhotoRefs } from "@/lib/photos";
import { listTimeline } from "@/lib/activity";
import { activityLabel } from "@/lib/labels";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const contact = await prisma.contact.findFirst({
      where: { id, workspaceId: session.workspaceId },
      include: {
        channels: true,
        conversations: { include: { channel: true, messages: { orderBy: { createdAt: "desc" }, take: 20 } } },
        leads: true,
        fieldValues: { include: { field: true } },
      },
    });
    if (!contact) return jsonError("Контакт не найден", 404);
    const format = new URL(req.url).searchParams.get("format");
    const phone = maskPhoneIf(session.role, contact.phone);
    const comment = shouldMask(session.role) ? maskPii(contact.comment) : contact.comment;
    if (format === "csv") {
      const header = ["поле", "значение"];
      const rows: (string | number | null)[][] = [
        ["id", contact.id],
        ["имя", contact.name],
        ["телефон", phone],
        ["комментарий", comment],
        ...contact.channels.map((c) => [
          `канал ${channelLabel(c.type)}`,
          c.type === "email" ? maskEmailIf(session.role, c.username || c.externalId) : c.username || c.externalId,
        ]),
        ...contact.leads.map((l) => [`лид ${leadStatusLabel(l.status)}`, l.id]),
        ...contact.fieldValues.map((v) => [
          v.field.name,
          shouldMask(session.role) ? (v.field.fieldType === "phone" ? maskPhoneIf(session.role, v.value) : maskPii(v.value)) : v.value,
        ]),
      ];
      return new NextResponse(csvBody(header, rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=contact-${contact.id}.csv`,
        },
      });
    }
    if (format === "pdf") {
      const pdf = cargoCardPdf({
        title: "Карточка контакта",
        rows: [
          ["имя", contact.name],
          ["телефон", phone || ""],
          ["комментарий", comment || ""],
          ...contact.channels.map(
            (c) =>
              [
                `канал ${channelLabel(c.type)}`,
                String(c.type === "email" ? maskEmailIf(session.role, c.username || c.externalId) : c.username || c.externalId || ""),
              ] as [string, string],
          ),
          ...contact.fieldValues.map(
            (v) =>
              [
                v.field.name,
                shouldMask(session.role)
                  ? v.field.fieldType === "phone"
                    ? maskPhoneIf(session.role, v.value) || ""
                    : maskPii(v.value)
                  : v.value,
              ] as [string, string],
          ),
        ],
      });
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename=contact-${contact.id}.pdf`,
        },
      });
    }
    let duplicates: { id: string; name: string; phone: string | null; telegram: string | null; reason: "phone" | "telegram" }[] = [];
    try {
      duplicates = (await findDuplicateContacts(session.workspaceId, contact.id)).map((d) => ({
        ...d,
        phone: maskPhoneIf(session.role, d.phone),
      }));
    } catch {
      duplicates = [];
    }
    const timelineRaw = await listTimeline({ workspaceId: session.workspaceId, contactId: contact.id });
    const mask = shouldMask(session.role);
    return NextResponse.json({
      ...dlpContact(session.role, contact),
      fx: await getCbrRates(),
      photos: extractPhotoRefs(
        [
          contact.comment,
          ...contact.fieldValues.map((v) => v.value),
          ...contact.conversations.flatMap((c) => (c.messages || []).map((m) => m.body)),
        ].join("\n"),
      ),
      duplicates,
      timeline: timelineRaw.map((i) => ({
        id: i.id,
        event: i.event,
        label: activityLabel(i.event),
        actor: i.actor,
        message: mask ? maskPii(i.message) : i.message,
        createdAt: i.createdAt,
      })),
    });
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const parsed = z
      .object({
        name: z.string().optional(),
        phone: z.string().nullable().optional(),
        comment: z.string().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Некорректные данные");
    const existing = await prisma.contact.findFirst({ where: { id, workspaceId: session.workspaceId } });
    if (!existing) return jsonError("Контакт не найден", 404);
    const data = { ...parsed.data };
    if (data.phone) {
      const phone = normalizePhone(data.phone);
      if (!phone) return jsonError("Некорректный телефон", 400);
      data.phone = phone;
    }
    const contact = await prisma.contact.update({
      where: { id },
      data,
    });
    return NextResponse.json(contact);
  });
}
