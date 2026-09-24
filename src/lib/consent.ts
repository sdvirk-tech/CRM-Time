export const CONSENT_ERROR = "Нужно согласие на обработку персональных данных (152-ФЗ)";

export function acceptedConsent(value: unknown) {
  if (value === true || value === 1) return true;
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return s === "on" || s === "yes" || s === "true" || s === "1" || s === "да" || s === "согласен";
}

export function consentLabel(at?: Date | string | null) {
  if (!at) return "";
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function contactHasConsent(opts: {
  workspaceId: string;
  source: string;
  externalId: string;
  phone?: string | null;
}) {
  const { prisma } = await import("./prisma");
  const byExt = await prisma.contactChannel.findUnique({
    where: {
      workspaceId_type_externalId: {
        workspaceId: opts.workspaceId,
        type: opts.source,
        externalId: opts.externalId,
      },
    },
  });
  if (byExt) {
    const c = await prisma.contact.findUnique({ where: { id: byExt.contactId } });
    return Boolean(c?.consentAt);
  }
  if (opts.phone) {
    const byPhone = await prisma.contact.findFirst({
      where: { workspaceId: opts.workspaceId, phone: opts.phone },
    });
    return Boolean(byPhone?.consentAt);
  }
  return false;
}
