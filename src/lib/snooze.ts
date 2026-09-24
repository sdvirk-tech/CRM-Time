import { prisma } from "./prisma";

/** Снимаем отложку, если время вышло. */
export async function releaseExpiredSnoozes(workspaceId?: string) {
  const now = new Date();
  const res = await prisma.conversation.updateMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      snoozedUntil: { lte: now },
      NOT: { snoozedUntil: null },
    },
    data: { snoozedUntil: null },
  });
  return res.count;
}
