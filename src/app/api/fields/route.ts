import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner, withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { z } from "zod";

export async function GET() {
  return withSession(async (session) => {
    const fields = await prisma.customField.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ fields });
  });
}

export async function POST(req: Request) {
  return withOwner(async (session) => {
    const parsed = z
      .object({
        name: z.string().min(1),
        key: z.string().min(1).regex(/^[a-z0-9_]+$/),
        fieldType: z.enum(["text", "phone", "tnved", "incoterms", "number", "container", "route"]),
        required: z.boolean().optional(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Имя, ключ (латиница) и тип обязательны");
    const field = await prisma.customField.create({
      data: { workspaceId: session.workspaceId, ...parsed.data, required: parsed.data.required ?? false },
    });
    return NextResponse.json({ field });
  });
}
