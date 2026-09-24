import { prisma } from "./prisma";
import { isGenericName } from "./sales";
import { normalizePhone } from "./validators";

export type DuplicateHit = {
  id: string;
  name: string;
  phone: string | null;
  telegram: string | null;
  reason: "phone" | "telegram";
};

function telegramFromContact(c: {
  channels: { type: string; username: string | null; externalId: string }[];
  fieldValues: { value: string; field: { key: string } }[];
}) {
  const field = c.fieldValues.find((v) => v.field.key === "telegram")?.value?.trim();
  if (field) return field.replace(/^@/, "").toLowerCase();
  const ch = c.channels.find((x) => x.type === "telegram");
  const raw = (ch?.username || ch?.externalId || "").trim();
  return raw ? raw.replace(/^@/, "").toLowerCase() : "";
}

export async function findDuplicateContacts(workspaceId: string, contactId: string): Promise<DuplicateHit[]> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    include: { channels: true, fieldValues: { include: { field: true } } },
  });
  if (!contact) return [];
  const phone = contact.phone ? normalizePhone(contact.phone) || contact.phone : "";
  const telegram = telegramFromContact(contact);
  const out: DuplicateHit[] = [];
  const seen = new Set<string>([contact.id]);

  if (phone) {
    const hits = await prisma.contact.findMany({
      where: { workspaceId, id: { not: contact.id }, phone },
      include: { channels: true, fieldValues: { include: { field: true } } },
      take: 8,
    });
    for (const h of hits) {
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      out.push({
        id: h.id,
        name: h.name,
        phone: h.phone,
        telegram: telegramFromContact(h) || null,
        reason: "phone",
      });
    }
  }

  if (telegram) {
    const hits = await prisma.contact.findMany({
      where: {
        workspaceId,
        id: { not: contact.id },
        OR: [
          { channels: { some: { type: "telegram", OR: [{ username: { contains: telegram, mode: "insensitive" } }, { externalId: { contains: telegram, mode: "insensitive" } }] } } },
          { fieldValues: { some: { field: { key: "telegram" }, value: { contains: telegram, mode: "insensitive" } } } },
        ],
      },
      include: { channels: true, fieldValues: { include: { field: true } } },
      take: 8,
    });
    for (const h of hits) {
      if (seen.has(h.id)) continue;
      const otherTg = telegramFromContact(h);
      if (otherTg !== telegram) continue;
      seen.add(h.id);
      out.push({
        id: h.id,
        name: h.name,
        phone: h.phone,
        telegram: otherTg || null,
        reason: "telegram",
      });
    }
  }

  return out;
}

export async function mergeContacts(opts: { workspaceId: string; keepId: string; dropId: string }) {
  if (opts.keepId === opts.dropId) throw new Error("Нельзя склеить контакт с собой");
  const keep = await prisma.contact.findFirst({
    where: { id: opts.keepId, workspaceId: opts.workspaceId },
    include: { channels: true, fieldValues: { include: { field: true } } },
  });
  const drop = await prisma.contact.findFirst({
    where: { id: opts.dropId, workspaceId: opts.workspaceId },
    include: { channels: true, fieldValues: { include: { field: true } } },
  });
  if (!keep || !drop) throw new Error("Контакт не найден");

  await prisma.conversation.updateMany({
    where: { workspaceId: opts.workspaceId, contactId: drop.id },
    data: { contactId: keep.id },
  });
  await prisma.lead.updateMany({
    where: { workspaceId: opts.workspaceId, contactId: drop.id },
    data: { contactId: keep.id },
  });

  const keepFields = new Set(keep.fieldValues.map((v) => v.fieldId));
  for (const fv of drop.fieldValues) {
    if (keepFields.has(fv.fieldId)) {
      await prisma.fieldValue.delete({ where: { id: fv.id } });
    } else {
      await prisma.fieldValue.update({ where: { id: fv.id }, data: { contactId: keep.id } });
      keepFields.add(fv.fieldId);
    }
  }

  const keepKeys = new Set(keep.channels.map((c) => `${c.type}:${c.externalId}`));
  for (const ch of drop.channels) {
    const key = `${ch.type}:${ch.externalId}`;
    if (keepKeys.has(key)) {
      await prisma.contactChannel.delete({ where: { id: ch.id } });
    } else {
      await prisma.contactChannel.update({
        where: { id: ch.id },
        data: { contactId: keep.id },
      });
      keepKeys.add(key);
    }
  }

  const patch: {
    phone?: string;
    name?: string;
    comment?: string;
    consentAt?: Date;
  } = {};
  if (!keep.phone && drop.phone) patch.phone = drop.phone;
  if (isGenericName(keep.name) && !isGenericName(drop.name)) patch.name = drop.name;
  const comments = [keep.comment, drop.comment].map((s) => s.trim()).filter(Boolean);
  if (comments.length) patch.comment = [...new Set(comments)].join("\n");
  if (drop.consentAt && (!keep.consentAt || drop.consentAt < keep.consentAt)) patch.consentAt = drop.consentAt;

  if (Object.keys(patch).length) {
    await prisma.contact.update({ where: { id: keep.id }, data: patch });
  }

  await prisma.contact.delete({ where: { id: drop.id } });
  return prisma.contact.findUniqueOrThrow({
    where: { id: keep.id },
    include: { channels: true, leads: true, conversations: true, fieldValues: { include: { field: true } } },
  });
}
