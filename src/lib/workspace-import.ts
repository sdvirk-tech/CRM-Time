import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizePhone } from "./validators";
import { logActivity } from "./activity";

export type WorkspaceImportError = { section: string; detail: string };
export type WorkspaceImportResult = {
  dryRun: boolean;
  mode: "merge" | "replace";
  settings: boolean;
  contacts: { created: number; updated: number; skipped: number };
  leads: { created: number; updated: number; skipped: number };
  tags: { created: number; skipped: number };
  knowledge: { topics: number; articles: number };
  flows: { created: number; skipped: number };
  cannedReplies: { created: number; updated: number };
  autoAssignRules: { created: number; skipped: number };
  customFields: { created: number; updated: number };
  errors: WorkspaceImportError[];
};

type ExportPayload = {
  exportVersion?: number;
  settings?: Record<string, unknown>;
  contacts?: Array<{ id: string; name: string; phone: string | null; comment?: string | null; consentAt?: string | null }>;
  leads?: Array<{
    id: string;
    contactId: string;
    status: string;
    source: string;
    comment?: string | null;
    urgent?: boolean;
    rejectReason?: string | null;
  }>;
  tags?: Array<{ id: string; name: string }>;
  leadTags?: Array<{ leadId: string; tagId: string }>;
  knowledge?: { topics?: Array<{ id: string; name: string }>; articles?: Array<{ id: string; topicId: string; title: string; body: string; enabled?: boolean }> };
  flows?: Array<{ id: string; name: string; published?: boolean }>;
  flowBlocks?: Array<{ id: string; flowId: string; type: string; position: number; label?: string; config: unknown }>;
  aiProcesses?: Array<{ id: string; type: string; name: string; prompt: string }>;
  modelBindings?: Array<{ id: string; processId: string; provider: string; model: string }>;
  cannedReplies?: Array<{ title: string; body: string }>;
  autoAssignRules?: Array<{ channel: string | null; tagName: string | null; assigneeId: string; sortOrder?: number; enabled?: boolean }>;
  customFields?: Array<{ id: string; key: string; name: string; fieldType: string; required?: boolean }>;
  fieldValues?: Array<{ id: string; fieldId: string; contactId?: string | null; leadId?: string | null; value: string }>;
};

function emptyResult(dryRun: boolean, mode: "merge" | "replace"): WorkspaceImportResult {
  return {
    dryRun,
    mode,
    settings: false,
    contacts: { created: 0, updated: 0, skipped: 0 },
    leads: { created: 0, updated: 0, skipped: 0 },
    tags: { created: 0, skipped: 0 },
    knowledge: { topics: 0, articles: 0 },
    flows: { created: 0, skipped: 0 },
    cannedReplies: { created: 0, updated: 0 },
    autoAssignRules: { created: 0, skipped: 0 },
    customFields: { created: 0, updated: 0 },
    errors: [],
  };
}

export async function importWorkspaceJson(opts: {
  workspaceId: string;
  actor: string;
  payload: unknown;
  dryRun: boolean;
  mode?: "merge" | "replace";
}): Promise<WorkspaceImportResult> {
  const mode = opts.mode === "replace" ? "replace" : "merge";
  const result = emptyResult(opts.dryRun, mode);
  const data = opts.payload as ExportPayload;
  if (!data || data.exportVersion !== 1) {
    result.errors.push({ section: "meta", detail: "Нужен JSON exportVersion: 1 (экспорт фазы 10)" });
    return result;
  }

  const memberIds = new Set(
    (await prisma.workspaceMember.findMany({ where: { workspaceId: opts.workspaceId }, select: { userId: true } })).map(
      (m) => m.userId,
    ),
  );

  if (opts.dryRun) {
    if (data.settings) result.settings = true;
    for (const c of data.contacts || []) {
      const phone = c.phone ? normalizePhone(c.phone) : null;
      const existing = phone
        ? await prisma.contact.findFirst({ where: { workspaceId: opts.workspaceId, phone } })
        : await prisma.contact.findFirst({ where: { workspaceId: opts.workspaceId, id: c.id } });
      if (existing) result.contacts.updated += 1;
      else result.contacts.created += 1;
    }
    for (const l of data.leads || []) {
      const existing = await prisma.lead.findFirst({ where: { workspaceId: opts.workspaceId, id: l.id } });
      if (existing) result.leads.updated += 1;
      else result.leads.created += 1;
    }
    result.tags.created = (data.tags || []).length;
    result.knowledge.topics = (data.knowledge?.topics || []).length;
    result.knowledge.articles = (data.knowledge?.articles || []).length;
    result.flows.created = (data.flows || []).length;
    result.cannedReplies.created = (data.cannedReplies || []).length;
    result.autoAssignRules.created = (data.autoAssignRules || []).filter((r) => memberIds.has(r.assigneeId)).length;
    result.customFields.created = (data.customFields || []).length;
    return result;
  }

  const contactIdMap = new Map<string, string>();

  if (data.settings) {
    const s = data.settings;
    await prisma.workspace.update({
      where: { id: opts.workspaceId },
      data: {
        ...(typeof s.tradeDescription === "string" ? { tradeDescription: s.tradeDescription } : {}),
        ...(typeof s.defaultModel === "string" || s.defaultModel === null ? { defaultModel: (s.defaultModel as string) || null } : {}),
        ...(typeof s.greeting === "string" ? { greeting: s.greeting } : {}),
        ...(typeof s.salesPrompt === "string" ? { salesPrompt: s.salesPrompt } : {}),
        ...(typeof s.slaMinutes === "number" ? { slaMinutes: s.slaMinutes } : {}),
        ...(typeof s.pingEnabled === "boolean" ? { pingEnabled: s.pingEnabled } : {}),
        ...(typeof s.routingMode === "string" ? { routingMode: s.routingMode } : {}),
        ...(typeof s.workHoursEnabled === "boolean" ? { workHoursEnabled: s.workHoursEnabled } : {}),
        ...(typeof s.workHoursStart === "string" ? { workHoursStart: s.workHoursStart } : {}),
        ...(typeof s.workHoursEnd === "string" ? { workHoursEnd: s.workHoursEnd } : {}),
        ...(typeof s.workHoursTz === "string" ? { workHoursTz: s.workHoursTz } : {}),
        ...(mode === "replace" && typeof s.name === "string" ? { name: s.name } : {}),
      },
    });
    result.settings = true;
  }

  for (const f of data.customFields || []) {
    const existing = await prisma.customField.findFirst({ where: { workspaceId: opts.workspaceId, key: f.key } });
    if (existing) {
      await prisma.customField.update({
        where: { id: existing.id },
        data: { name: f.name, fieldType: f.fieldType, required: Boolean(f.required) },
      });
      result.customFields.updated += 1;
    } else {
      await prisma.customField.create({
        data: {
          workspaceId: opts.workspaceId,
          key: f.key,
          name: f.name,
          fieldType: f.fieldType,
          required: Boolean(f.required),
        },
      });
      result.customFields.created += 1;
    }
  }

  for (const c of data.contacts || []) {
    const phone = c.phone ? normalizePhone(c.phone) : null;
    let existing =
      (phone ? await prisma.contact.findFirst({ where: { workspaceId: opts.workspaceId, phone } }) : null) ||
      (mode === "merge" ? await prisma.contact.findFirst({ where: { workspaceId: opts.workspaceId, id: c.id } }) : null);
    if (existing) {
      await prisma.contact.update({
        where: { id: existing.id },
        data: {
          name: c.name || existing.name,
          phone: phone || existing.phone,
          comment: c.comment ?? existing.comment,
          ...(c.consentAt ? { consentAt: new Date(c.consentAt) } : {}),
        },
      });
      contactIdMap.set(c.id, existing.id);
      result.contacts.updated += 1;
    } else {
      const created = await prisma.contact.create({
        data: {
          workspaceId: opts.workspaceId,
          name: c.name,
          phone,
          comment: c.comment || "импорт JSON",
          ...(c.consentAt ? { consentAt: new Date(c.consentAt) } : {}),
        },
      });
      contactIdMap.set(c.id, created.id);
      result.contacts.created += 1;
    }
  }

  const tagIdMap = new Map<string, string>();
  for (const t of data.tags || []) {
    const existing = await prisma.tag.findFirst({
      where: { workspaceId: opts.workspaceId, name: { equals: t.name, mode: "insensitive" } },
    });
    if (existing) {
      tagIdMap.set(t.id, existing.id);
      result.tags.skipped += 1;
    } else {
      const created = await prisma.tag.create({ data: { workspaceId: opts.workspaceId, name: t.name } });
      tagIdMap.set(t.id, created.id);
      result.tags.created += 1;
    }
  }

  for (const l of data.leads || []) {
    const contactId = contactIdMap.get(l.contactId);
    if (!contactId) {
      result.errors.push({ section: "leads", detail: `Нет контакта ${l.contactId}` });
      result.leads.skipped += 1;
      continue;
    }
    const existing =
      mode === "merge" ? await prisma.lead.findFirst({ where: { workspaceId: opts.workspaceId, id: l.id } }) : null;
    const status = l.status === "lost" ? "rejected" : l.status;
    if (existing) {
      await prisma.lead.update({
        where: { id: existing.id },
        data: {
          status,
          source: l.source,
          comment: l.comment ?? existing.comment,
          urgent: Boolean(l.urgent),
          rejectReason: l.rejectReason ?? existing.rejectReason,
        },
      });
      result.leads.updated += 1;
    } else {
      await prisma.lead.create({
        data: {
          workspaceId: opts.workspaceId,
          contactId,
          status,
          source: l.source,
          comment: l.comment || "",
          urgent: Boolean(l.urgent),
          rejectReason: l.rejectReason,
        },
      });
      result.leads.created += 1;
    }
  }

  for (const lt of data.leadTags || []) {
    const lead = await prisma.lead.findFirst({ where: { workspaceId: opts.workspaceId, id: lt.leadId } });
    const tagId = tagIdMap.get(lt.tagId);
    if (!lead || !tagId) continue;
    const exists = await prisma.leadTag.findFirst({ where: { workspaceId: opts.workspaceId, leadId: lead.id, tagId } });
    if (!exists) await prisma.leadTag.create({ data: { workspaceId: opts.workspaceId, leadId: lead.id, tagId } });
  }

  const topicIdMap = new Map<string, string>();
  for (const t of data.knowledge?.topics || []) {
    const existing = await prisma.knowledgeTopic.findFirst({
      where: { workspaceId: opts.workspaceId, name: t.name },
    });
    if (existing) topicIdMap.set(t.id, existing.id);
    else {
      const created = await prisma.knowledgeTopic.create({ data: { workspaceId: opts.workspaceId, name: t.name } });
      topicIdMap.set(t.id, created.id);
      result.knowledge.topics += 1;
    }
  }
  for (const a of data.knowledge?.articles || []) {
    const topicId = topicIdMap.get(a.topicId);
    if (!topicId) continue;
    const existing = await prisma.knowledgeArticle.findFirst({
      where: { workspaceId: opts.workspaceId, topicId, title: a.title },
    });
    if (existing) {
      await prisma.knowledgeArticle.update({
        where: { id: existing.id },
        data: { body: a.body, enabled: a.enabled !== false },
      });
    } else {
      await prisma.knowledgeArticle.create({
        data: { workspaceId: opts.workspaceId, topicId, title: a.title, body: a.body, enabled: a.enabled !== false },
      });
      result.knowledge.articles += 1;
    }
  }

  for (const cr of data.cannedReplies || []) {
    const existing = await prisma.cannedReply.findFirst({ where: { workspaceId: opts.workspaceId, title: cr.title } });
    if (existing) {
      await prisma.cannedReply.update({ where: { id: existing.id }, data: { body: cr.body } });
      result.cannedReplies.updated += 1;
    } else {
      await prisma.cannedReply.create({ data: { workspaceId: opts.workspaceId, title: cr.title, body: cr.body } });
      result.cannedReplies.created += 1;
    }
  }

  if (mode === "replace") {
    await prisma.autoAssignRule.deleteMany({ where: { workspaceId: opts.workspaceId } });
  }
  for (const rule of data.autoAssignRules || []) {
    if (!memberIds.has(rule.assigneeId)) {
      result.autoAssignRules.skipped += 1;
      continue;
    }
    const dup = await prisma.autoAssignRule.findFirst({
      where: {
        workspaceId: opts.workspaceId,
        channel: rule.channel,
        tagName: rule.tagName,
        assigneeId: rule.assigneeId,
      },
    });
    if (dup) {
      result.autoAssignRules.skipped += 1;
      continue;
    }
    await prisma.autoAssignRule.create({
      data: {
        workspaceId: opts.workspaceId,
        channel: rule.channel,
        tagName: rule.tagName,
        assigneeId: rule.assigneeId,
        sortOrder: rule.sortOrder ?? 0,
        enabled: rule.enabled !== false,
      },
    });
    result.autoAssignRules.created += 1;
  }

  for (const flow of data.flows || []) {
    const existing = await prisma.flow.findFirst({ where: { workspaceId: opts.workspaceId, name: flow.name } });
    if (existing && mode === "merge") {
      result.flows.skipped += 1;
      continue;
    }
    const flowRow = existing
      ? existing
      : await prisma.flow.create({
          data: { workspaceId: opts.workspaceId, name: flow.name, published: flow.published !== false },
        });
    if (!existing) result.flows.created += 1;
    const blocks = (data.flowBlocks || []).filter((b) => b.flowId === flow.id);
    if (!existing && blocks.length) {
      const processIdMap = new Map<string, string>();
      for (const p of data.aiProcesses || []) {
        const proc = await prisma.aiProcess.create({
          data: { workspaceId: opts.workspaceId, type: p.type, name: p.name, prompt: p.prompt },
        });
        processIdMap.set(p.id, proc.id);
      }
      for (const b of blocks.sort((a, c) => a.position - c.position)) {
        let config = (b.config ?? {}) as Record<string, unknown>;
        if (b.type === "ai_process" && typeof config.aiProcessId === "string") {
          const mapped = processIdMap.get(config.aiProcessId);
          if (mapped) config = { ...config, aiProcessId: mapped };
        }
        await prisma.flowBlock.create({
          data: {
            workspaceId: opts.workspaceId,
            flowId: flowRow.id,
            type: b.type,
            position: b.position,
            label: b.label || b.type,
            config: config as Prisma.InputJsonValue,
          },
        });
      }
    }
  }

  await logActivity({
    workspaceId: opts.workspaceId,
    actor: opts.actor,
    event: "import",
    message: `Импорт JSON (${mode}): контакты +${result.contacts.created}/~${result.contacts.updated}, лиды +${result.leads.created}`,
  });

  return result;
}
