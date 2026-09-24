import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { listTimeline } from "@/lib/activity";
import { activityLabel } from "@/lib/labels";
import { maskPii, shouldMask } from "@/lib/dlp";

export async function GET(req: Request) {
  return withSession(async (session) => {
    const url = new URL(req.url);
    const contactId = url.searchParams.get("contactId") || undefined;
    const leadId = url.searchParams.get("leadId") || undefined;
    if (!contactId && !leadId) return jsonError("Нужен contactId или leadId");
    const raw = await listTimeline({ workspaceId: session.workspaceId, contactId, leadId });
    const mask = shouldMask(session.role);
    return NextResponse.json({
      items: raw.map((i) => ({
        id: i.id,
        event: i.event,
        label: activityLabel(i.event),
        actor: i.actor,
        message: mask ? maskPii(i.message) : i.message,
        createdAt: i.createdAt,
      })),
    });
  });
}
