import { prisma } from "./prisma";

export async function logActivity(opts: {
  workspaceId: string;
  conversationId?: string | null;
  channelId?: string | null;
  actor: string;
  event: string;
  message: string;
}) {
  try {
    await prisma.activityEvent.create({
      data: {
        workspaceId: opts.workspaceId,
        conversationId: opts.conversationId || undefined,
        channelId: opts.channelId || undefined,
        actor: opts.actor,
        event: opts.event,
        message: opts.message.slice(0, 500),
      },
    });
  } catch {
    /* журнал не должен ронять цепочку */
  }
}
