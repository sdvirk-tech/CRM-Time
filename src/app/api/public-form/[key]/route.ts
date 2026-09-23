import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { key } = await ctx.params;
  const channel = await prisma.channel.findUnique({ where: { publicKey: key } });
  if (!channel || channel.type !== "web_form") return jsonError("Форма не найдена", 404);
  const fields = await prisma.customField.findMany({
    where: { workspaceId: channel.workspaceId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    name: channel.name,
    fields: fields.map((f) => ({
      key: f.key,
      name: f.name,
      fieldType: f.fieldType,
      required: f.required,
    })),
  });
}
