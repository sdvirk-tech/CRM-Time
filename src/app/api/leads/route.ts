import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { csvBody } from "@/lib/csv";
import { leadStatusLabel, sourceLabel } from "@/lib/labels";
import { dlpLead, maskPii, maskPhoneIf, shouldMask } from "@/lib/dlp";

export async function GET(req: Request) {
  return withSession(async (session) => {
    const fields = await prisma.customField.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: { createdAt: "asc" },
    });
    const leads = await prisma.lead.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: [{ urgent: "desc" }, { createdAt: "desc" }],
      include: {
        contact: { include: { fieldValues: { include: { field: true } } } },
        assignee: true,
      },
    });
    const newCount = leads.filter((l) => l.status === "new").length;
    const format = new URL(req.url).searchParams.get("format");
    const mask = shouldMask(session.role);
    if (format === "csv") {
      const header = [
        "id",
        "создан",
        "статус",
        "источник",
        "срочно",
        "ответственный",
        "имя",
        "телефон",
        "комментарий",
        ...fields.map((f) => f.name),
      ];
      const rows = leads.map((l) => {
        const bag = Object.fromEntries(l.contact.fieldValues.map((v) => [v.field.key, v.value]));
        return [
          l.id,
          l.createdAt.toISOString(),
          leadStatusLabel(l.status),
          sourceLabel(l.source, "long"),
          l.urgent ? "да" : "",
          l.assignee?.name || "",
          l.contact.name,
          mask ? maskPhoneIf(session.role, l.contact.phone) : l.contact.phone || "",
          mask ? maskPii(l.comment) : l.comment,
          ...fields.map((f) => {
            const raw = bag[f.key] || "";
            return mask ? (f.fieldType === "phone" ? maskPhoneIf(session.role, raw) : maskPii(raw)) : raw;
          }),
        ];
      });
      return new NextResponse(csvBody(header, rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=leads.csv",
        },
      });
    }
    return NextResponse.json({
      newCount,
      items: leads.map((l) => dlpLead(session.role, {
        id: l.id,
        status: l.status,
        source: l.source,
        urgent: l.urgent,
        comment: l.comment,
        createdAt: l.createdAt,
        contact: { id: l.contact.id, name: l.contact.name, phone: l.contact.phone },
        assignee: l.assignee ? { id: l.assignee.id, name: l.assignee.name } : null,
      })),
    });
  });
}
