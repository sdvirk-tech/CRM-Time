import { prisma } from "./prisma";

/** Лид не из кнопки «тестовая заявка» на холсте (externalId test:…). */
export async function countRealLeads(workspaceId: string) {
  const testContactIds = await prisma.contactChannel.findMany({
    where: { workspaceId, externalId: { startsWith: "test:" } },
    select: { contactId: true },
  });
  const exclude = testContactIds.map((c) => c.contactId);
  return prisma.lead.count({
    where: {
      workspaceId,
      ...(exclude.length ? { contactId: { notIn: exclude } } : {}),
    },
  });
}

export async function onboardingChecklistState(workspaceId: string) {
  const [blocks, channels, processes, realLeads, ws] = await Promise.all([
    prisma.flowBlock.count({ where: { workspaceId } }),
    prisma.channel.count({ where: { workspaceId, enabled: true } }),
    prisma.aiProcess.findMany({
      where: { workspaceId },
      include: { binding: true },
    }),
    countRealLeads(workspaceId),
    prisma.workspace.findUnique({ where: { id: workspaceId } }),
  ]);
  const hasExplicitModel = processes.some((p) => p.binding?.provider && p.binding?.model);
  const dismissed = Boolean(ws?.onboardingChecklistDismissedAt);
  const hasRealLead = realLeads > 0;
  const show = !dismissed && !hasRealLead;
  return {
    show,
    dismissed,
    hasRealLead,
    realLeadCount: realLeads,
    steps: {
      hasBlocks: blocks > 0,
      hasChannel: channels > 0,
      hasExplicitModel,
      hasRealLead,
    },
  };
}
