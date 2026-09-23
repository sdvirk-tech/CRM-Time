import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";

export async function GET() {
  return withSession(async (session) => {
    const items = await prisma.activityEvent.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ items });
  });
}
