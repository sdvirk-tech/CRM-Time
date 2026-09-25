import { NextResponse } from "next/server";
import { withOwner } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateWorkspaceApiKey } from "@/lib/api-key";
import { z } from "zod";

export async function GET() {
  return withOwner(async (session) => {
    const rows = await prisma.workspaceApiKey.findMany({
      where: { workspaceId: session.workspaceId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        prefix: r.keyPrefix,
        createdAt: r.createdAt,
      })),
    });
  });
}

export async function POST(req: Request) {
  return withOwner(async (session) => {
    const parsed = z
      .object({ name: z.string().max(120).optional() })
      .safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError("Некорректные данные");
    const { raw, hash, prefix } = generateWorkspaceApiKey();
    const row = await prisma.workspaceApiKey.create({
      data: {
        workspaceId: session.workspaceId,
        name: parsed.data.name?.trim() || "Ключ API",
        keyPrefix: prefix,
        keyHash: hash,
      },
    });
    return NextResponse.json({
      id: row.id,
      name: row.name,
      prefix: row.keyPrefix,
      createdAt: row.createdAt,
      key: raw,
    });
  });
}

export async function DELETE(req: Request) {
  return withOwner(async (session) => {
    const parsed = z.object({ id: z.string().min(1) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужен id");
    const row = await prisma.workspaceApiKey.findFirst({
      where: { id: parsed.data.id, workspaceId: session.workspaceId, revokedAt: null },
    });
    if (!row) return jsonError("Ключ не найден", 404);
    await prisma.workspaceApiKey.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  });
}
