import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";

export async function GET() {
  return withSession(async (session) => {
    const [unread, newLeads] = await Promise.all([
      prisma.conversation.count({ where: { workspaceId: session.workspaceId, unread: true } }),
      prisma.lead.count({ where: { workspaceId: session.workspaceId, status: "new" } }),
    ]);
    return NextResponse.json({ unread, newLeads });
  });
}
