import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { telegramFileUrl } from "@/lib/telegram";

export async function GET(req: Request) {
  return withSession(async (session) => {
    const fileId = new URL(req.url).searchParams.get("file_id") || "";
    if (!fileId) return jsonError("Нужен file_id", 400);
    const channels = await prisma.channel.findMany({
      where: { workspaceId: session.workspaceId, type: "telegram" },
    });
    for (const ch of channels) {
      if (!ch.secretsEnc) continue;
      try {
        const token = decryptSecret(ch.secretsEnc);
        const url = await telegramFileUrl(token, fileId);
        if (url) return NextResponse.redirect(url);
      } catch {
        /* следующий канал */
      }
    }
    return jsonError("Файл Telegram недоступен", 404);
  });
}
