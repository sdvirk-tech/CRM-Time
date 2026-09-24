import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { maskPii, shouldMask } from "@/lib/dlp";

function csvCell(value: string) {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: Request) {
  return withSession(async (session) => {
    const items = await prisma.activityEvent.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const mask = shouldMask(session.role);
    const safe = items.map((i) => ({ ...i, message: mask ? maskPii(i.message) : i.message }));
    const format = new URL(req.url).searchParams.get("format");
    if (format === "csv") {
      const header = "время,событие,кто,сообщение";
      const rows = safe.map((i) =>
        [
          csvCell(i.createdAt.toISOString()),
          csvCell(i.event),
          csvCell(i.actor),
          csvCell(i.message),
        ].join(","),
      );
      const body = [header, ...rows].join("\n");
      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=journal.csv",
        },
      });
    }
    return NextResponse.json({ items: safe });
  });
}
