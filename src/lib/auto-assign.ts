import { prisma } from "./prisma";
import { isAssignable } from "./member-availability";
import { emailManagerOnAssign } from "./assign-email";

const CHANNELS = new Set(["telegram", "web_form", "web_chat", "email"]);

export async function listAutoAssignRules(workspaceId: string) {
  const rows = await prisma.autoAssignRule.findMany({
    where: { workspaceId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { assignee: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    tagName: r.tagName,
    assigneeId: r.assigneeId,
    assigneeName: r.assignee.name,
    sortOrder: r.sortOrder,
    enabled: r.enabled,
  }));
}

export async function applyAutoAssignRules(workspaceId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, workspaceId },
    include: { tags: { include: { tag: true } } },
  });
  if (!lead || (lead.status !== "new" && lead.status !== "in_progress")) return null;

  const rules = await prisma.autoAssignRule.findMany({
    where: { workspaceId, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (!rules.length) return null;

  const tagNames = new Set(lead.tags.map((t) => t.tag.name.toLowerCase()));
  for (const rule of rules) {
    const channelOk = rule.channel ? rule.channel === lead.source : false;
    const tagOk = rule.tagName ? tagNames.has(rule.tagName.toLowerCase()) : false;
    if (!rule.channel && !rule.tagName) continue;
    if (!(channelOk || tagOk)) continue;

    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: rule.assigneeId },
    });
    if (!member || !isAssignable(member.availability)) continue;

    if (lead.assigneeId === rule.assigneeId) return rule.assigneeId;
    const prev = lead.assigneeId;
    await prisma.lead.update({
      where: { id: lead.id },
      data: { assigneeId: rule.assigneeId },
    });
    await emailManagerOnAssign({
      workspaceId,
      leadId: lead.id,
      assigneeId: rule.assigneeId,
      previousAssigneeId: prev,
    });
    return rule.assigneeId;
  }
  return null;
}

export function channelRuleOk(raw: string | null | undefined): raw is string {
  return Boolean(raw && CHANNELS.has(raw));
}
