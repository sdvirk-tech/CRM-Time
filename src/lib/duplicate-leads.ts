import { prisma } from "./prisma";

export type DuplicateLeadHint = {
  id: string;
  status: string;
  contactName: string;
  phone: string | null;
  createdAt: Date;
};

export async function findOpenDuplicateLeads(
  workspaceId: string,
  opts: { phone?: string | null; telegramExternalId?: string; contactId?: string; excludeLeadId?: string },
): Promise<DuplicateLeadHint[]> {
  const contactIds = new Set<string>();
  if (opts.contactId) contactIds.add(opts.contactId);
  if (opts.phone) {
    const byPhone = await prisma.contact.findMany({ where: { workspaceId, phone: opts.phone }, select: { id: true } });
    byPhone.forEach((c) => contactIds.add(c.id));
  }
  if (opts.telegramExternalId) {
    const ch = await prisma.contactChannel.findMany({
      where: { workspaceId, type: "telegram", externalId: opts.telegramExternalId },
      select: { contactId: true },
    });
    ch.forEach((c) => contactIds.add(c.contactId));
  }
  if (!contactIds.size) return [];

  const rows = await prisma.lead.findMany({
    where: {
      workspaceId,
      contactId: { in: [...contactIds] },
      status: { in: ["new", "in_progress"] },
      ...(opts.excludeLeadId ? { id: { not: opts.excludeLeadId } } : {}),
    },
    include: { contact: { select: { name: true, phone: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return rows.map((l) => ({
    id: l.id,
    status: l.status,
    contactName: l.contact.name,
    phone: l.contact.phone,
    createdAt: l.createdAt,
  }));
}
