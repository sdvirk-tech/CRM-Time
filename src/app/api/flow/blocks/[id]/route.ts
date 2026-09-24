import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { asConfig } from "@/lib/workspace";
import { encryptSecret } from "@/lib/crypto";
import { decryptSecret } from "@/lib/crypto";
import { publicUrl } from "@/lib/env";
import { telegramSetWebhook } from "@/lib/telegram";
import { asPollConfig } from "@/lib/telegram-ingest";
import { enableTelegramPoll, httpsWebhookAvailable } from "@/lib/telegram-poll";
import { encodeEmailSecrets, parseEmailSecrets } from "@/lib/email";
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
        fromAddress: z.string().optional(),
        smtpHost: z.string().optional(),
        smtpPort: z.coerce.number().int().optional(),
        smtpUser: z.string().optional(),
        smtpPass: z.string().optional(),
      })
      .safeParse(body);
    if (!parsed.success) return jsonError("Некорректные данные");

    const cfg = asConfig(block.config);

    if (block.type === "channel" && cfg.channelId) {
      const channel = await prisma.channel.findUnique({ where: { id: cfg.channelId } });
      const data: { name?: string; secretsEnc?: string; config?: object; enabled?: boolean; topicId?: string | null } = {};
      if (parsed.data.label) data.name = parsed.data.label;
      if (channel?.type === "email") {
        const prev = parseEmailSecrets(channel.secretsEnc);
        const next = {
          ...prev,
          ...(parsed.data.fromAddress !== undefined ? { fromAddress: parsed.data.fromAddress.trim() } : {}),
          ...(parsed.data.smtpHost !== undefined ? { smtpHost: parsed.data.smtpHost.trim() } : {}),
          ...(parsed.data.smtpPort !== undefined ? { smtpPort: parsed.data.smtpPort } : {}),
          ...(parsed.data.smtpUser !== undefined ? { smtpUser: parsed.data.smtpUser.trim() } : {}),
          ...(parsed.data.smtpPass !== undefined ? { smtpPass: parsed.data.smtpPass } : {}),
        };
        if (
          parsed.data.fromAddress !== undefined ||
          parsed.data.smtpHost !== undefined ||
          parsed.data.smtpPort !== undefined ||
          parsed.data.smtpUser !== undefined ||
          parsed.data.smtpPass !== undefined
        ) {
          data.secretsEnc = encodeEmailSecrets(next);
        }
      } else if (parsed.data.token) {
        data.secretsEnc = encryptSecret(parsed.data.token.trim());
      }
      if (parsed.data.allowedOrigins) {
        data.config = { ...asPollConfig(channel?.config), allowedOrigins: parsed.data.allowedOrigins };
      }
      if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;
      if (parsed.data.topicId !== undefined) data.topicId = parsed.data.topicId;
      if (Object.keys(data).length) {
        const updatedChannel = await prisma.channel.update({ where: { id: cfg.channelId }, data });
        if (parsed.data.token && updatedChannel.type === "telegram" && updatedChannel.secretsEnc) {
          if (!httpsWebhookAvailable()) {
            await enableTelegramPoll(updatedChannel.id, true);
          } else {
            try {
              await telegramSetWebhook(
                decryptSecret(updatedChannel.secretsEnc),
                `${publicUrl()}/api/ingest/telegram/${updatedChannel.publicKey}`,
              );
            } catch {
              await enableTelegramPoll(updatedChannel.id, true);
            }
          }
        }
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
