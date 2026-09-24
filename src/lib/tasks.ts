import { prisma } from "./prisma";

export function mapTask(t: {
  id: string;
  title: string;
  dueAt: Date;
  doneAt: Date | null;
  leadId: string;
  assigneeId: string | null;
  assignee?: { id: string; name: string } | null;
  lead?: { id: string; contact?: { name: string } | null } | null;
}) {
  const overdue = !t.doneAt && t.dueAt.getTime() < Date.now();
  return {
    id: t.id,
    title: t.title,
    dueAt: t.dueAt,
    doneAt: t.doneAt,
    overdue,
    leadId: t.leadId,
    assigneeId: t.assigneeId,
    assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
    contactName: t.lead?.contact?.name || "",
  };
}

export async function listOverdue(workspaceId: string) {
  const items = await prisma.followUp.findMany({
    where: { workspaceId, doneAt: null, dueAt: { lt: new Date() } },
    orderBy: { dueAt: "asc" },
    take: 40,
    include: { assignee: { select: { id: true, name: true } }, lead: { include: { contact: { select: { name: true } } } } },
  });
  return items.map(mapTask);
}