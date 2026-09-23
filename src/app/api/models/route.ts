import { NextResponse } from "next/server";
import { listModels, deepAnalysisEnabled, runModel } from "@/lib/ai";
import { withOwner, withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  return withSession(async () => {
    return NextResponse.json({ models: listModels(), deepAnalysisEnabled: deepAnalysisEnabled() });
  });
}

export async function POST(req: Request) {
  return withOwner(async () => {
    const parsed = z
      .object({ provider: z.string().min(1), model: z.string().min(1) })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужны provider и model");
    try {
      const text = await runModel({
        provider: parsed.data.provider,
        model: parsed.data.model,
        system: "Коротко подтверди, что модель отвечает. Одно предложение по-русски.",
        user: "пинг",
      });
      return NextResponse.json({ ok: true, preview: text.slice(0, 280) });
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "Модель не ответила", 400);
    }
  });
}
