import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";

export async function GET() {
  return withSession(async (session) => {
    const leads = await prisma.lead.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: [{ urgent: "desc" }, { createdAt: "desc" }],
      include: { contact: true, assignee: true },
    });
    const newCount = leads.filter((l) => l.status === "new").length;
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
