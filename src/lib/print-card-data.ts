import { prisma } from "./prisma";
import { leadStatusLabel, sourceLabel } from "./labels";
import { CARGO_FIELDS } from "./sales";
import { getCbrRates, formatCbrLine } from "./cbr";

export async function leadPrintData(workspaceId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, workspaceId },
    include: {
      contact: { include: { fieldValues: { include: { field: true } } } },
      assignee: true,
    },
  });
  if (!lead) return null;
  const byKey = Object.fromEntries(lead.contact.fieldValues.map((v) => [v.field.key, v.value]));
  const fx = await getCbrRates();
  const cbr = formatCbrLine(fx);
  return {
    title: `Лид · ${lead.contact.name}`,
    meta: [
      `Статус: ${leadStatusLabel(lead.status)}`,
      `Источник: ${sourceLabel(lead.source, "long")}`,
      lead.assignee ? `Ответственный: ${lead.assignee.name}` : "Без ответственного",
      lead.urgent ? "Срочно" : "",
    ].filter(Boolean),
    rows: [
      { label: "Имя", value: lead.contact.name },
      { label: "Телефон", value: lead.contact.phone || "" },
      ...CARGO_FIELDS.map((f) => ({ label: f.name, value: byKey[f.key] || "" })),
      { label: "Комментарий", value: lead.comment || "" },
      { label: "Курс ЦБ", value: cbr },
    ],
  };
}

export async function contactPrintData(workspaceId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    include: { fieldValues: { include: { field: true } } },
  });
  if (!contact) return null;
  const byKey = Object.fromEntries(contact.fieldValues.map((v) => [v.field.key, v.value]));
  const fx = await getCbrRates();
  const cbr = formatCbrLine(fx);
  return {
    title: `Контакт · ${contact.name}`,
    meta: [contact.phone ? `Телефон: ${contact.phone}` : ""].filter(Boolean),
    rows: [
      { label: "Имя", value: contact.name },
      { label: "Телефон", value: contact.phone || "" },
      ...CARGO_FIELDS.map((f) => ({ label: f.name, value: byKey[f.key] || "" })),
      { label: "Комментарий", value: contact.comment || "" },
      { label: "Курс ЦБ", value: cbr },
    ],
  };
}
