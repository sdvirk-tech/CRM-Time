import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { asConfig } from "@/lib/workspace";
import { encryptSecret } from "@/lib/crypto";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return withOwner(async (session) => {
    const { id } = await ctx.params;
    const block = await prisma.flowBlock.findFirst({
      where: { id, workspaceId: session.workspaceId },
    });
    if (!block) return jsonError("Слот не найден", 404);
    const body = await req.json().catch(() => null);
    const parsed = z
      .object({
        label: z.string().optional(),
        token: z.string().optional(),
        allowedOrigins: z.array(z.string()).optional(),
        enabled: z.boolean().optional(),
        topicId: z.string().nullable().optional(),
        prompt: z.string().optional(),
        provider: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        position: z.number().int().optional(),
      })
      .safeParse(body);
    if (!parsed.success) return jsonError("Некорректные данные");

    const cfg = asConfig(block.config);

    if (block.type === "channel" && cfg.channelId) {
      const data: { name?: string; secretsEnc?: string; config?: object; enabled?: boolean; topicId?: string | null } = {};
      if (parsed.data.label) data.name = parsed.data.label;
      if (parsed.data.token) data.secretsEnc = encryptSecret(parsed.data.token.trim());
      if (parsed.data.allowedOrigins) data.config = { allowedOrigins: parsed.data.allowedOrigins };
      if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;
      if (parsed.data.topicId !== undefined) data.topicId = parsed.data.topicId;
      if (Object.keys(data).length) {
        await prisma.channel.update({ where: { id: cfg.channelId }, data });
      }
    }

    if (block.type === "ai_process" && cfg.aiProcessId) {
      if (parsed.data.prompt !== undefined || parsed.data.label) {
        await prisma.aiProcess.update({
          where: { id: cfg.aiProcessId },
          data: {
            ...(parsed.data.prompt !== undefined ? { prompt: parsed.data.prompt } : {}),
            ...(parsed.data.label ? { name: parsed.data.label } : {}),
          },
        });
      }
      if (parsed.data.provider === null || parsed.data.model === null || parsed.data.provider === "") {
        await prisma.modelBinding.deleteMany({ where: { aiProcessId: cfg.aiProcessId } });
      } else if (parsed.data.provider && parsed.data.model) {
        await prisma.modelBinding.upsert({
          where: { aiProcessId: cfg.aiProcessId },
          update: { provider: parsed.data.provider, model: parsed.data.model },
          create: {
            workspaceId: session.workspaceId,
            aiProcessId: cfg.aiProcessId,
            provider: parsed.data.provider,
            model: parsed.data.model,
          },
        });
      }
    }

    const updated = await prisma.flowBlock.update({
      where: { id },
      data: {
        ...(parsed.data.label ? { label: parsed.data.label } : {}),
        ...(parsed.data.position !== undefined ? { position: parsed.data.position } : {}),
      },
    });
    return NextResponse.json({ block: { ...updated, config: asConfig(updated.config) } });
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return withOwner(async (session) => {
    const { id } = await ctx.params;
    const block = await prisma.flowBlock.findFirst({
      where: { id, workspaceId: session.workspaceId },
    });
    if (!block) return jsonError("Слот не найден", 404);
    const cfg = asConfig(block.config);
    await prisma.flowBlock.delete({ where: { id } });
    if (cfg.channelId) await prisma.channel.deleteMany({ where: { id: cfg.channelId } });
    if (cfg.aiProcessId) await prisma.aiProcess.deleteMany({ where: { id: cfg.aiProcessId } });
    return NextResponse.json({ ok: true });
  });
}
