import { prisma } from "./prisma";
import { csvHeaderKey, parseCsv } from "./csv";
import { normalizePhone } from "./validators";
import { logActivity } from "./activity";

export type ImportError = { row: number; error: string };
export type ImportResult = {
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: ImportError[];
};

function cell(row: string[], idx: Record<string, number>, key: string) {
  const i = idx[key];
  if (i == null) return "";
  return (row[i] || "").trim();
}

async function upsertField(workspaceId: string, contactId: string, key: string, value: string) {
  if (!value) return;
  const field = await prisma.customField.findFirst({ where: { workspaceId, key } });
  if (!field) return;
  const existing = await prisma.fieldValue.findFirst({ where: { workspaceId, fieldId: field.id, contactId } });
  if (existing) await prisma.fieldValue.update({ where: { id: existing.id }, data: { value } });
  else await prisma.fieldValue.create({ data: { workspaceId, fieldId: field.id, contactId, value } });
}

export async function importContactsCsv(opts: {
  workspaceId: string;
  actor: string;
  text: string;
  dryRun: boolean;
}): Promise<ImportResult> {
  const { header, rows } = parseCsv(opts.text);
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    const k = csvHeaderKey(h);
    if (k) idx[k] = i;
  });
  const errors: ImportError[] = [];
  if (idx.name == null) errors.push({ row: 1, error: "Нужна колонка имя / name" });
  const result: ImportResult = { dryRun: opts.dryRun, created: 0, updated: 0, skipped: 0, errors };
  if (idx.name == null) return result;

  const seenPhone = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const name = cell(rows[i], idx, "name");
    const phoneRaw = cell(rows[i], idx, "phone");
    const telegram = cell(rows[i], idx, "telegram");
    const max = cell(rows[i], idx, "max");
    if (!name && !phoneRaw && !telegram && !max) {
      result.skipped += 1;
      continue;
    }
    if (!name || name.length < 2) {
      errors.push({ row: rowNum, error: "Нужно имя" });
      continue;
    }
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    if (phoneRaw && !phone) {
      errors.push({ row: rowNum, error: "Некорректный телефон" });
      continue;
    }
    if (phone && seenPhone.has(phone)) {
      errors.push({ row: rowNum, error: "Телефон уже есть в файле" });
      continue;
    }
    if (phone) seenPhone.add(phone);

    if (opts.dryRun) {
      const existing = phone
        ? await prisma.contact.findFirst({ where: { workspaceId: opts.workspaceId, phone } })
        : null;
      if (existing) result.updated += 1;
      else result.created += 1;
      continue;
    }

    let contact = phone
      ? await prisma.contact.findFirst({ where: { workspaceId: opts.workspaceId, phone } })
      : null;
    if (contact) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { name, phone: phone || contact.phone },
      });
      result.updated += 1;
    } else {
      contact = await prisma.contact.create({
        data: {
          workspaceId: opts.workspaceId,
          name,
          phone,
          comment: "импорт CSV",
        },
      });
      result.created += 1;
    }
    await upsertField(opts.workspaceId, contact.id, "telegram", telegram);
    await upsertField(opts.workspaceId, contact.id, "max", max);
  }

  if (!opts.dryRun && (result.created || result.updated)) {
    await logActivity({
      workspaceId: opts.workspaceId,
      actor: opts.actor,
      event: "import",
      message: `Импорт CSV: +${result.created} / обновлено ${result.updated}`,
    });
  }
  return result;
}