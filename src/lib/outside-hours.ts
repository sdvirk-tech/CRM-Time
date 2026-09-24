import { prisma } from "./prisma";
import { deliverOutbound } from "./outbound";
import { outsideHoursReply, workHoursFromWorkspace, type WorkHoursConfig } from "./work-hours";

const PREFIX = "мы на связи с ";

export async function maybeOutsideHoursReply(opts: {
  workspaceId: string;
  conversationId: string;
  source: string;
  cfg: WorkHoursConfig;
}) {
  if (opts.source !== "web_chat" && opts.source !== "telegram") return false;
  if (!opts.cfg.enabled) return false;

  const text = outsideHoursReply(opts.cfg);
  const recent = await prisma.message.findFirst({
    where: {
      conversationId: opts.conversationId,
      direction: "outbound",
      body: { startsWith: PREFIX },
    },
    orderBy: { createdAt: "desc" },
  });
  const lastInbound = await prisma.message.findFirst({
    where: { conversationId: opts.conversationId, direction: "inbound" },
    orderBy: { createdAt: "desc" },
  });
  if (recent && lastInbound && recent.createdAt >= lastInbound.createdAt) return false;

  const conv = await prisma.conversation.findFirst({
    where: { id: opts.conversationId, workspaceId: opts.workspaceId },
    include: { channel: true, contact: { include: { channels: true } } },
  });
  if (!conv) return false;
  await deliverOutbound(conv, text);
  return true;
}

export async function workspaceWorkHours(workspaceId: string) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) return workHoursFromWorkspace({});
  return workHoursFromWorkspace(ws);
}
