import { isCardComplete, snapshotFromBag } from "./sales";

export function cargoBagFromFieldValues(rows: { field: { key: string }; value: string }[]) {
  return Object.fromEntries(rows.map((v) => [v.field.key, v.value]));
}

export function isLeadHot(opts: {
  status: string;
  bag: Record<string, string>;
  name?: string | null;
  phone?: string | null;
  clientReplied: boolean;
}) {
  if (opts.status === "rejected" || opts.status === "lost") return false;
  if (!opts.clientReplied) return false;
  const snap = snapshotFromBag(opts.bag, opts.name, opts.phone);
  return isCardComplete(snap);
}

export async function contactsWithInboundReply(workspaceId: string, contactIds: string[]) {
  if (contactIds.length === 0) return new Set<string>();
  const rows = await (
    await import("./prisma")
  ).prisma.message.findMany({
    where: {
      workspaceId,
      direction: "inbound",
      conversation: { contactId: { in: contactIds } },
    },
    select: { conversation: { select: { contactId: true } } },
    distinct: ["conversationId"],
  });
  return new Set(rows.map((r) => r.conversation.contactId));
}
