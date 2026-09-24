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
    const workspace = await prisma.workspace.findUnique({ where: { id: session.workspaceId } });
    return NextResponse.json({
      routingMode: workspace?.routingMode || "pool",
      role: session.role,
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        name: m.user.name,
        email: m.user.email,
        telegram: m.telegram || "",
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

export async function PATCH(req: Request) {
  return withSession(async (session) => {
    const parsed = z
      .object({
        memberId: z.string().optional(),
        userId: z.string().optional(),
        telegram: z.string().max(80).optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Некорректные данные");
    const member = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: session.workspaceId,
        ...(parsed.data.memberId
          ? { id: parsed.data.memberId }
          : parsed.data.userId
            ? { userId: parsed.data.userId }
            : { userId: session.userId }),
      },
    });
    if (!member) return jsonError("Сотрудник не найден", 404);
    if (session.role !== "owner" && member.userId !== session.userId) {
      return jsonError("Недостаточно прав", 403);
    }
    const telegram = parsed.data.telegram === undefined ? member.telegram : parsed.data.telegram.trim() || null;
    const updated = await prisma.workspaceMember.update({
      where: { id: member.id },
      data: { telegram },
    });
    return NextResponse.json({ ok: true, member: { id: updated.id, telegram: updated.telegram || "" } });
  });
}
