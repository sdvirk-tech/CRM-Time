import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";
import { csvBody } from "@/lib/csv";
import { leadStatusLabel, sourceLabel } from "@/lib/labels";

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
      },
    });
    if (!lead) return jsonError("Лид не найден", 404);
    const format = new URL(req.url).searchParams.get("format");
    if (format === "csv") {
      const values = lead.contact.fieldValues.length ? lead.contact.fieldValues : lead.fieldValues;
      const header = ["поле", "значение"];
      const rows: (string | number | null)[][] = [
        ["id", lead.id],
        ["имя", lead.contact.name],
        ["телефон", lead.contact.phone],
        ["статус", leadStatusLabel(lead.status)],
        ["источник", sourceLabel(lead.source, "long")],
        ["срочно", lead.urgent ? "да" : ""],
        ["ответственный", lead.assignee?.name || ""],
        ["комментарий", lead.comment],
        ...values.map((v) => [v.field.name, v.value]),
      ];
      return new NextResponse(csvBody(header, rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=lead-${lead.id}.csv`,
        },
      });
    }
    return NextResponse.json(lead);
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
    const lead = await prisma.lead.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json(lead);
  });
}
