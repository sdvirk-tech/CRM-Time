import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, jsonError, jsonWithSession } from "@/lib/auth";
import { z } from "zod";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { workspace: true },
  });
  if (!invite || invite.acceptedAt) return jsonError("Приглашение недействительно", 404);
  return NextResponse.json({ workspaceName: invite.workspace.name, email: invite.email });
}

export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt) return jsonError("Приглашение недействительно", 404);
  const parsed = z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Имя, почта и пароль обязательны");

  let user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        passwordHash: await hashPassword(parsed.data.password),
      },
    });
  } else if (!(await import("@/lib/auth")).verifyPassword(parsed.data.password, user.passwordHash)) {
    return jsonError("Пользователь уже есть — войдите с верным паролем", 401);
  }

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
    update: { role: "manager" },
    create: { workspaceId: invite.workspaceId, userId: user.id, role: "manager" },
  });
  await prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  return jsonWithSession(
    { ok: true },
    {
      userId: user.id,
      workspaceId: invite.workspaceId,
      role: "manager",
      name: user.name,
      email: user.email,
    },
  );
}
