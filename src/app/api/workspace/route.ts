import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner, withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";
import { deployMode } from "@/lib/env";
import { listModels } from "@/lib/ai";
import { encryptSecret } from "@/lib/crypto";
import { webhookUrlOk } from "@/lib/webhook";
import type { Prisma } from "@prisma/client";

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
      chatGreeting: workspace.chatGreeting,
      salesPrompt: workspace.salesPrompt || "",
      slaMinutes: workspace.slaMinutes,
      pingEnabled: workspace.pingEnabled,
      routingMode: workspace.routingMode || "pool",
      outboundWebhookUrl: workspace.outboundWebhookUrl || "",
      outboundWebhookHasSecret: Boolean(workspace.outboundWebhookSecretEnc),
      outboundWebhookLastAt: workspace.outboundWebhookLastAt,
      outboundWebhookLastError: workspace.outboundWebhookLastError || "",
      workHoursEnabled: workspace.workHoursEnabled,
      workHoursStart: workspace.workHoursStart,
      workHoursEnd: workspace.workHoursEnd,
      workHoursTz: workspace.workHoursTz,
      ingestRateLimitMax: workspace.ingestRateLimitMax,
      ingestRateLimitScope: workspace.ingestRateLimitScope,
      consentText: workspace.consentText,
      embedAllowedOrigins: workspace.embedAllowedOrigins,
      onboardingChecklistDismissedAt: workspace.onboardingChecklistDismissedAt,
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
        chatGreeting: z.string().max(2000).optional(),
        salesPrompt: z.string().max(40000).optional(),
        pingEnabled: z.boolean().optional(),
        slaMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
        routingMode: z.enum(["pool", "round_robin"]).optional(),
        outboundWebhookUrl: z.string().max(500).optional().nullable(),
        outboundWebhookSecret: z.string().max(200).optional(),
        outboundWebhookClearSecret: z.boolean().optional(),
        workHoursEnabled: z.boolean().optional(),
        workHoursStart: z.string().max(8).optional(),
        workHoursEnd: z.string().max(8).optional(),
        workHoursTz: z.string().max(64).optional(),
        ingestRateLimitMax: z.coerce.number().int().min(0).max(10_000).optional(),
        ingestRateLimitScope: z.enum(["ip", "key"]).optional(),
        consentText: z.string().min(5).max(2000).optional(),
        embedAllowedOrigins: z.array(z.string().max(200)).optional(),
        dismissOnboardingChecklist: z.boolean().optional(),
      })
      .safeParse(body);
    if (!parsed.success) return jsonError("Некорректные данные");
    const {
      outboundWebhookUrl,
      outboundWebhookSecret,
      outboundWebhookClearSecret,
      dismissOnboardingChecklist,
      ...rest
    } = parsed.data;
    const data: Prisma.WorkspaceUpdateInput = { ...rest };
    if (dismissOnboardingChecklist) data.onboardingChecklistDismissedAt = new Date();
    if (outboundWebhookUrl !== undefined) {
      const url = (outboundWebhookUrl || "").trim();
      if (url && !webhookUrlOk(url)) return jsonError("Нужен HTTPS (или http://127.0.0.1 для проверки)");
      data.outboundWebhookUrl = url || null;
    }
    if (outboundWebhookClearSecret) data.outboundWebhookSecretEnc = null;
    else if (outboundWebhookSecret !== undefined && outboundWebhookSecret.trim()) {
      data.outboundWebhookSecretEnc = encryptSecret(outboundWebhookSecret.trim());
    }
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
    return NextResponse.json({
      id: workspace.id,
      name: workspace.name,
      tradeDescription: workspace.tradeDescription,
      defaultModel: workspace.defaultModel,
      greeting: workspace.greeting,
      chatGreeting: workspace.chatGreeting,
      salesPrompt: workspace.salesPrompt || "",
      slaMinutes: workspace.slaMinutes,
      pingEnabled: workspace.pingEnabled,
      routingMode: workspace.routingMode || "pool",
      outboundWebhookUrl: workspace.outboundWebhookUrl || "",
      outboundWebhookHasSecret: Boolean(workspace.outboundWebhookSecretEnc),
      outboundWebhookLastAt: workspace.outboundWebhookLastAt,
      outboundWebhookLastError: workspace.outboundWebhookLastError || "",
      workHoursEnabled: workspace.workHoursEnabled,
      workHoursStart: workspace.workHoursStart,
      workHoursEnd: workspace.workHoursEnd,
      workHoursTz: workspace.workHoursTz,
      ingestRateLimitMax: workspace.ingestRateLimitMax,
      ingestRateLimitScope: workspace.ingestRateLimitScope,
      consentText: workspace.consentText,
      embedAllowedOrigins: workspace.embedAllowedOrigins,
      onboardingChecklistDismissedAt: workspace.onboardingChecklistDismissedAt,
    });
  });
}
