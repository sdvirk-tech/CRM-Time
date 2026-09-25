import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner } from "@/lib/api";
import { deployMode } from "@/lib/env";
import pkg from "../../../../package.json";

export async function GET() {
  return withOwner(async (session) => {
    let postgres = false;
    let postgresError: string | null = null;
    try {
      await prisma.$queryRaw`SELECT 1`;
      postgres = true;
    } catch (e) {
      postgresError = e instanceof Error ? e.message : "postgres error";
    }

    const [contacts, leads, conversations, members] = await Promise.all([
      prisma.contact.count({ where: { workspaceId: session.workspaceId } }),
      prisma.lead.count({ where: { workspaceId: session.workspaceId } }),
      prisma.conversation.count({ where: { workspaceId: session.workspaceId } }),
      prisma.workspaceMember.count({ where: { workspaceId: session.workspaceId } }),
    ]);

    return NextResponse.json({
      ok: postgres,
      postgres,
      postgresError,
      version: pkg.version,
      deployMode: deployMode(),
      workspaceId: session.workspaceId,
      counts: { contacts, leads, conversations, members },
    });
  });
}
