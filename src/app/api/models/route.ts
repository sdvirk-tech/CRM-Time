import { NextResponse } from "next/server";
import { listModels, deepAnalysisEnabled, runModel, parseBinding } from "@/lib/ai";
import { withOwner, withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  return withSession(async () => {
    return NextResponse.json({ models: listModels(), deepAnalysisEnabled: deepAnalysisEnabled() });
  });
}

export async function POST(req: Request) {
  return withOwner(async (session) => {
    const parsed = z
      .object({
        provider: z.string().optional(),
        model: z.string().optional(),
        processId: z.string().optional(),
        system: z.string().optional(),
        user: z.string().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужны provider и model");

    let provider = parsed.data.provider?.trim() || "";
    let model = parsed.data.model?.trim() || "";
    let system = parsed.data.system?.trim() || "Коротко подтверди, что модель отвечает. Одно предложение по-русски.";
    const user = parsed.data.user?.trim() || "пинг";

    if (parsed.data.processId) {
      const proc = await prisma.aiProcess.findFirst({
        where: { id: parsed.data.processId, workspaceId: session.workspaceId },
        include: { binding: true },
      });
      if (!proc) return jsonError("Процесс не найден", 404);
      if (proc.binding) {
        provider = proc.binding.provider;
        model = proc.binding.model;
      }
      if (proc.prompt?.trim() && !parsed.data.system) system = proc.prompt;
    }

    if (!provider || !model) {
      const ws = await prisma.workspace.findUnique({ where: { id: session.workspaceId } });
      const fb = parseBinding(ws?.defaultModel);
      provider = provider || fb?.provider || "";
      model = model || fb?.model || "";
    }
    if (!provider || !model) return jsonError("Нужны provider и model");

    const started = Date.now();
    try {
      const text = await runModel({
        provider,
        model,
        system,
        user,
      });
      return NextResponse.json({
        ok: true,
        provider,
        model,
        ms: Date.now() - started,
        raw: text,
        preview: text.slice(0, 280),
      });
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "Модель не ответила", 400);
    }
  });
}
