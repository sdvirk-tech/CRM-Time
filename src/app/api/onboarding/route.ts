import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonWithSession, readSession } from "@/lib/auth";
import { applyVedTemplate, ensureWorkspaceFlow } from "@/lib/workspace";
import { deployMode } from "@/lib/env";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2),
  tradeDescription: z.string().min(2),
  vedTemplate: z.boolean().optional(),
  defaultModel: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return jsonError("Нужен вход", 401);

  const existing = await prisma.workspaceMember.findFirst({ where: { userId: session.userId } });
  if (existing) return jsonError("Онбординг уже пройден");

  if (deployMode() === "box") {
    const wsCount = await prisma.workspace.count();
    if (wsCount > 0) return jsonError("В режиме коробки один воркспейс", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Название и «чем торгуем» обязательны");

  const workspace = await prisma.workspace.create({
    data: {
      name: parsed.data.name,
      tradeDescription: parsed.data.tradeDescription,
      defaultModel: parsed.data.defaultModel || "mock:ok",
    },
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: session.userId, role: "owner" },
  });
  await ensureWorkspaceFlow(workspace.id);
  if (parsed.data.vedTemplate !== false) await applyVedTemplate(workspace.id);

  return jsonWithSession(
    { ok: true, workspaceId: workspace.id },
    {
      ...session,
      workspaceId: workspace.id,
      role: "owner",
    },
  );
}
