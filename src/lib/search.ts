import { prisma } from "./prisma";
import { maskPhoneIf, maskPii, shouldMask } from "./dlp";

export type SearchHit = {
  kind: "contact" | "lead" | "conversation";
  id: string;
  href: string;
  title: string;
  subtitle: string;
};

export async function searchWorkspace(opts: { workspaceId: string; role: string; q: string }) {
  const q = opts.q.trim();
  const empty = { contacts: [] as SearchHit[], leads: [] as SearchHit[], conversations: [] as SearchHit[] };
  if (q.length < 2) return empty;
  const digits = q.replace(/\D/g, "");
  const mask = shouldMask(opts.role);

  const textOr = [
    { name: { contains: q, mode: "insensitive" as const } },
    { phone: { contains: q } },
    ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
    {
      channels: {
        some: {
          OR: [
            { username: { contains: q, mode: "insensitive" as const } },
            { externalId: { contains: q, mode: "insensitive" as const } },
          ],
        },
      },
    },
    { fieldValues: { some: { value: { contains: q, mode: "insensitive" as const } } } },
    { comment: { contains: q, mode: "insensitive" as const } },
  ];

  const contacts = await prisma.contact.findMany({
    where: { workspaceId: opts.workspaceId, OR: textOr },
    include: { channels: true, fieldValues: { include: { field: true } } },
    take: 8,
    orderBy: { updatedAt: "desc" },
  });

  const leads = await prisma.lead.findMany({
    where: {
      workspaceId: opts.workspaceId,
      OR: [
        { comment: { contains: q, mode: "insensitive" } },
        { contact: { OR: textOr } },
        { fieldValues: { some: { value: { contains: q, mode: "insensitive" } } } },
      ],
    },
    include: { contact: true, fieldValues: { include: { field: true } } },
    take: 8,
    orderBy: { updatedAt: "desc" },
  });

  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId: opts.workspaceId,
      OR: [
        { contact: { OR: textOr } },
        { messages: { some: { body: { contains: q, mode: "insensitive" } } } },
      ],
    },
    include: { contact: true, channel: true },
    take: 8,
    orderBy: { updatedAt: "desc" },
  });

  const contactHits: SearchHit[] = contacts.map((c) => {
    const tg = c.fieldValues.find((v) => v.field.key === "telegram")?.value
      || c.channels.find((ch) => ch.type === "telegram")?.username
      || "";
    const cargo = c.fieldValues.find((v) => v.field.key === "cargo")?.value || "";
    const phone = maskPhoneIf(opts.role, c.phone) || "";
    const bits = [phone, tg, cargo].filter(Boolean).map((s) => (mask ? maskPii(s) : s));
    return {
      kind: "contact",
      id: c.id,
      href: `/contacts/${c.id}`,
      title: c.name,
      subtitle: bits.join(" · ").slice(0, 160),
    };
  });

  const leadHits: SearchHit[] = leads.map((l) => {
    const cargo = l.fieldValues.find((v) => v.field.key === "cargo")?.value || l.comment || "";
    return {
      kind: "lead",
      id: l.id,
      href: `/leads/${l.id}`,
      title: l.contact.name,
      subtitle: (mask ? maskPii(cargo) : cargo).slice(0, 160),
    };
  });

  const convHits: SearchHit[] = conversations.map((c) => ({
    kind: "conversation",
    id: c.id,
    href: `/inbox/${c.id}`,
    title: c.contact.name,
    subtitle: c.channel.type === "web_chat" ? "чат" : c.channel.type === "web_form" ? "форма" : c.channel.type === "email" ? "почта" : "Telegram",
  }));

  return { contacts: contactHits, leads: leadHits, conversations: convHits };
}
