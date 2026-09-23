import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner, withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { inviteToken } from "@/lib/workspace";
import { appUrl } from "@/lib/env";
import { z } from "zod";

export async function GET() {
  return withSession(async (session) => {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: session.workspaceId },
      include: { user: true },
    });
    const invites = session.role === "owner"
      ? await prisma.invite.findMany({
          where: { workspaceId: session.workspaceId, acceptedAt: null },
        })
      : [];
    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        role: m.role,
        name: m.user.name,
        email: m.user.email,
      })),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        url: `${appUrl()}/invite/${i.token}`,
        createdAt: i.createdAt,
      })),
    });
  });
}

export async function POST(req: Request) {
  return withOwner(async (session) => {
    const parsed = z
      .object({ email: z.string().email().optional() })
      .safeParse(await req.json().catch(() => ({})));
    const invite = await prisma.invite.create({
      data: {
        workspaceId: session.workspaceId,
        email: parsed.success ? parsed.data.email : undefined,
        token: inviteToken(),
        role: "manager",
      },
    });
    return NextResponse.json({
      invite: { ...invite, url: `${appUrl()}/invite/${invite.token}` },
    });
  });
}
