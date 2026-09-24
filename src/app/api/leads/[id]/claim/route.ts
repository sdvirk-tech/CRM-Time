import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { leadStatusLabel } from "@/lib/labels";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  return withSession(async (session) => {
    const { id } = await ctx.params;
    const lead = await prisma.lead.findFirst({ where: { id, workspaceId: session.workspaceId } });
    if (!lead) return jsonError("Лид не найден", 404);
    const updated = await prisma.lead.update({
      where: { id },
      data: { assigneeId: session.userId, status: lead.status === "new" ? "in_progress" : lead.status },
    });
    if (lead.status === "new") {
      await logActivity({
        workspaceId: session.workspaceId,
        leadId: lead.id,
        contactId: lead.contactId,
        conversationId: lead.conversationId,
        actor: session.name,
        event: "status",
        message: `${leadStatusLabel("new")} → ${leadStatusLabel("in_progress")}`,
      });
    }
    return NextResponse.json({ lead: updated });
  });
}
