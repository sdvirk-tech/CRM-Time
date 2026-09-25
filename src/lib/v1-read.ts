import { prisma } from "./prisma";
import { leadStatusLabel, sourceLabel } from "./labels";
import { cargoBagFromFieldValues } from "./lead-hot";

export async function listLeadsV1(workspaceId: string) {
  const leads = await prisma.lead.findMany({
    where: { workspaceId },
    orderBy: [{ urgent: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      contact: { include: { fieldValues: { include: { field: true } } } },
      assignee: { select: { id: true, name: true } },
    },
  });
  return leads.map((l) => ({
    id: l.id,
    status: l.status,
    statusLabel: leadStatusLabel(l.status),
    source: l.source,
    sourceLabel: sourceLabel(l.source, "long"),
    urgent: l.urgent,
    comment: l.comment,
    assignee: l.assignee ? { id: l.assignee.id, name: l.assignee.name } : null,
    contact: {
      id: l.contact.id,
      name: l.contact.name,
      phone: l.contact.phone,
      consentAt: l.contact.consentAt?.toISOString() ?? null,
      cargo: cargoBagFromFieldValues(l.contact.fieldValues),
    },
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }));
}

export async function listContactsV1(workspaceId: string) {
  const contacts = await prisma.contact.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    take: 500,
    include: {
      fieldValues: { include: { field: true } },
      channels: { select: { type: true, externalId: true, username: true } },
    },
  });
  return contacts.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    comment: c.comment,
    consentAt: c.consentAt?.toISOString() ?? null,
    channels: c.channels.map((ch) => ({
      type: ch.type,
      externalId: ch.externalId,
      username: ch.username,
    })),
    cargo: cargoBagFromFieldValues(c.fieldValues),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
}
