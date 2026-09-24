import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner, withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";
import { deployMode } from "@/lib/env";
import { listModels } from "@/lib/ai";

export async function GET() {
  return withSession(async (session) => {
    const workspace = await prisma.workspace.findUnique({ where: { id: session.workspaceId } });
    if (!workspace) return jsonError("Нет воркспейса", 404);
    return NextResponse.json({
      id: workspace.id,
      name: workspace.name,
      tradeDescription: workspace.tradeDescription,
      defaultModel: workspace.defaultModel,
      greeting: workspace.greeting,
      salesPrompt: workspace.salesPrompt || "",
      slaMinutes: workspace.slaMinutes,
      pingEnabled: workspace.pingEnabled,
      routingMode: workspace.routingMode || "pool",
      deployMode: deployMode(),
      dataOnThisMachine: deployMode() === "box",
      publicRegistration: deployMode() !== "box",
      models: listModels(),
    });
  });
}

export async function PATCH(req: Request) {
  return withOwner(async (session) => {
    const body = await req.json().catch(() => null);
    const parsed = z
      .object({
        name: z.string().min(2).optional(),
        tradeDescription: z.string().optional(),
        defaultModel: z.string().nullable().optional(),
        greeting: z.string().max(2000).optional(),
        salesPrompt: z.string().max(40000).optional(),
        pingEnabled: z.boolean().optional(),
        slaMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
        routingMode: z.enum(["pool", "round_robin"]).optional(),
      })
      .safeParse(body);
    if (!parsed.success) return jsonError("Некорректные данные");
    const data = { ...parsed.data };
    const workspace = await prisma.workspace.update({
      where: { id: session.workspaceId },
      data,
    });
    if (parsed.data.salesPrompt !== undefined) {
      await prisma.aiProcess.updateMany({
        where: { workspaceId: session.workspaceId, type: "draft_reply" },
        data: { prompt: parsed.data.salesPrompt },
      });
    }
    return NextResponse.json(workspace);
  });
}
