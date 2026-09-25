import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withOwner } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { retryWebhookDelivery } from "@/lib/webhook";
import { z } from "zod";

export async function GET() {
  return withOwner(async (session) => {
    const items = await prisma.webhookDelivery.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { lead: { select: { id: true, status: true, source: true } } },
    });
    return NextResponse.json({
      items: items.map((i) => ({
        id: i.id,
        leadId: i.leadId,
        url: i.url,
        success: i.success,
        statusCode: i.statusCode,
        error: i.error,
        createdAt: i.createdAt,
        leadStatus: i.lead.status,
        leadSource: i.lead.source,
      })),
    });
  });
}

export async function POST(req: Request) {
  return withOwner(async (session) => {
    const parsed = z.object({ deliveryId: z.string().min(1) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Нужен deliveryId");
    const result = await retryWebhookDelivery(session.workspaceId, parsed.data.deliveryId);
    if (!result.ok) return jsonError(result.error, 400);
    return NextResponse.json({
      ok: true,
      delivery: {
        id: result.delivery.id,
        success: result.delivery.success,
        statusCode: result.delivery.statusCode,
        error: result.delivery.error,
      },
    });
  });
}
