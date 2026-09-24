import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";
import { csvBody } from "@/lib/csv";
import { leadStatusLabel, sourceLabel } from "@/lib/labels";
import { cargoCardPdf } from "@/lib/pdf";
import { dlpLead, maskPhoneIf, maskPii, shouldMask } from "@/lib/dlp";
import { getCbrRates } from "@/lib/cbr";
import { extractPhotoRefs } from "@/lib/photos";
import { logActivity, listTimeline } from "@/lib/activity";
import { activityLabel } from "@/lib/labels";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const lead = await prisma.lead.findFirst({
      where: { id, workspaceId: session.workspaceId },
      include: {
        contact: { include: { channels: true, fieldValues: { include: { field: true } } } },
        assignee: true,
        conversation: true,
        fieldValues: { include: { field: true } },
        tags: { include: { tag: true } },
      },
    });
    if (!lead) return jsonError("Лид не найден", 404);
    const format = new URL(req.url).searchParams.get("format");
    const values = lead.contact.fieldValues.length ? lead.contact.fieldValues : lead.fieldValues;
    const phone = maskPhoneIf(session.role, lead.contact.phone);
    const comment = shouldMask(session.role) ? maskPii(lead.comment) : lead.comment;
    const fieldRows = values.map((v) => [
      v.field.name,
      shouldMask(session.role) ? (v.field.fieldType === "phone" ? maskPhoneIf(session.role, v.value) : maskPii(v.value)) : v.value,
    ]);
    if (format === "csv") {
      const header = ["поле", "значение"];
      const rows: (string | number | null)[][] = [
        ["id", lead.id],
        ["имя", lead.contact.name],
        ["телефон", phone],
        ["статус", leadStatusLabel(lead.status)],
        ["источник", sourceLabel(lead.source, "long")],
        ["срочно", lead.urgent ? "да" : ""],
        ["ответственный", lead.assignee?.name || ""],
        ["комментарий", comment],
        ...fieldRows,
      ];
      return new NextResponse(csvBody(header, rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=lead-${lead.id}.csv`,
        },
      });
    }
    if (format === "pdf") {
      const pdf = cargoCardPdf({
        title: "Карточка груза",
        rows: [
          ["имя", lead.contact.name],
          ["телефон", phone || ""],
          ["статус", leadStatusLabel(lead.status)],
          ["источник", sourceLabel(lead.source, "long")],
          ["срочно", lead.urgent ? "да" : ""],
          ["ответственный", lead.assignee?.name || ""],
          ["комментарий", comment || ""],
          ...fieldRows.map(([k, v]) => [String(k), String(v)] as [string, string]),
        ],
      });
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename=lead-${lead.id}.pdf`,
        },
      });
    }
    const timelineRaw = await listTimeline({ workspaceId: session.workspaceId, leadId: lead.id });
    const mask = shouldMask(session.role);
    return NextResponse.json({
      ...dlpLead(session.role, lead),
      tags: lead.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })),
      timeline: timelineRaw.map((i) => ({
        id: i.id,
        event: i.event,
        label: activityLabel(i.event),
        actor: i.actor,
        message: mask ? maskPii(i.message) : i.message,
        createdAt: i.createdAt,
      })),
      fx: await getCbrRates(),
      photos: extractPhotoRefs(
        [lead.comment, ...values.map((v) => v.value)].join("\n"),
      ),
    });
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const parsed = z
      .object({
        status: z.enum(["new", "in_progress", "qualified", "rejected"]).optional(),
        comment: z.string().optional(),
        urgent: z.boolean().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Некорректные данные");
    const existing = await prisma.lead.findFirst({ where: { id, workspaceId: session.workspaceId } });
    if (!existing) return jsonError("Лид не найден", 404);
    const lead = await prisma.lead.update({
      where: { id },
      data: parsed.data,
    });
    if (parsed.data.status && parsed.data.status !== existing.status) {
      await logActivity({
        workspaceId: session.workspaceId,
        leadId: lead.id,
        contactId: existing.contactId,
        conversationId: existing.conversationId,
        actor: session.name,
        event: "status",
        message: `${leadStatusLabel(existing.status)} → ${leadStatusLabel(lead.status)}`,
      });
    }
    return NextResponse.json(lead);
  });
}
