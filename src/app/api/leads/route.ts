import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { csvBody } from "@/lib/csv";
import { leadStatusLabel, sourceLabel } from "@/lib/labels";

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
          l.contact.phone || "",
          l.comment,
          ...fields.map((f) => bag[f.key] || ""),
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
      items: leads.map((l) => ({
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
