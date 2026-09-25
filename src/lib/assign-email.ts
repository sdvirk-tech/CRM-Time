import { prisma } from "./prisma";
import { env, appUrl } from "./env";
import { sendSmtp } from "./email";
import { leadStatusLabel, sourceLabel } from "./labels";

export function smtpFromEnv() {
  const host = env("SMTP_HOST").trim();
  if (!host) return null;
  const from = env("SMTP_FROM").trim() || env("SMTP_USER").trim();
  if (!from) return null;
  const portRaw = env("SMTP_PORT", "465");
  const port = Number(portRaw) || 465;
  return {
    host,
    port,
    user: env("SMTP_USER").trim() || undefined,
    pass: env("SMTP_PASS") || undefined,
    from,
  };
}

/** Простое письмо менеджеру при назначении лида (только если задан SMTP_HOST). */
export async function emailManagerOnAssign(opts: {
  workspaceId: string;
  leadId: string;
  assigneeId: string;
  previousAssigneeId?: string | null;
}) {
  if (opts.previousAssigneeId === opts.assigneeId) return;
  const smtp = smtpFromEnv();
  if (!smtp) return;
  try {
    const [lead, user] = await Promise.all([
      prisma.lead.findFirst({
        where: { id: opts.leadId, workspaceId: opts.workspaceId },
        include: { contact: { select: { name: true, phone: true } } },
      }),
      prisma.user.findUnique({ where: { id: opts.assigneeId } }),
    ]);
    if (!lead || !user?.email) return;
    const base = appUrl();
    const text = [
      `Вам назначен лид в CRM-Time.`,
      ``,
      `Контакт: ${lead.contact.name}`,
      lead.contact.phone ? `Телефон: ${lead.contact.phone}` : "",
      `Статус: ${leadStatusLabel(lead.status)}`,
      `Источник: ${sourceLabel(lead.source, "long")}`,
      ``,
      `Карточка: ${base}/leads/${lead.id}`,
    ]
      .filter(Boolean)
      .join("\n");
    await sendSmtp({
      host: smtp.host,
      port: smtp.port,
      user: smtp.user,
      pass: smtp.pass,
      from: smtp.from,
      to: user.email,
      subject: `CRM-Time: лид «${lead.contact.name}»`,
      text,
    });
  } catch {
    /* почта не должна ломать назначение */
  }
}
