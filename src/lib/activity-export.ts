import { prisma } from "./prisma";
import { csvBody } from "./csv";

export async function buildActivityAuditCsv(workspaceId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [activity, channelEvents] = await Promise.all([
    prisma.activityEvent.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.channelEvent.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const rows: (string | number | null)[][] = [];
  for (const e of activity) {
    rows.push([
      e.createdAt.toISOString(),
      "activity",
      e.event,
      e.actor,
      e.message,
      e.contactId || "",
      e.leadId || "",
      e.conversationId || "",
    ]);
  }
  for (const e of channelEvents) {
    rows.push([e.createdAt.toISOString(), "channel", e.eventKey, e.channelId, "", "", "", ""]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return csvBody(
    ["время", "тип", "событие", "кто", "сообщение", "contact_id", "lead_id", "conversation_id"],
    rows,
  );
}
