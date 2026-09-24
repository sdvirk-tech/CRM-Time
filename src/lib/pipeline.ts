import { prisma } from "./prisma";
import { logActivity } from "./activity";
import { asConfig } from "./workspace";
import { parseBinding, runModel } from "./ai";
import { validateField } from "./validators";
import {
  AI_DRAFT_LIMIT,
  defaultGreeting,
  extractPhone,
  isStartCommand,
  pickKnowledge,
  sanitizeModelText,
  wantsManager,
} from "./dialog";

export type IngestInput = {
  workspaceId: string;
  channelId: string;
  source: "web_form" | "telegram" | "web_chat";
  externalId: string;
  username?: string;
  name?: string;
  phone?: string;
  body: string;
  fields?: Record<string, string>;
  eventKey?: string;
};

function explicitBinding(provider?: string | null, model?: string | null) {
  if (!provider || !model) return null;
  if (!provider.trim() || !model.trim()) return null;
  return { provider, model };
}

async function pickAssignee(workspaceId: string): Promise<string> {
  const members = await prisma.workspaceMember.findMany({ where: { workspaceId } });
  const managers = members.filter((m) => m.role === "manager");
  const owner = members.find((m) => m.role === "owner");
  const pool = managers.length ? managers : owner ? [owner] : [];
  if (!pool.length) throw new Error("В воркспейсе нет людей");

  const open = await prisma.lead.groupBy({
    by: ["assigneeId"],
    where: { workspaceId, status: { in: ["new", "in_progress"] }, assigneeId: { not: null } },
    _count: { _all: true },
  });
  const countBy = new Map(open.map((r) => [r.assigneeId, r._count._all]));
  pool.sort((a, b) => (countBy.get(a.userId) ?? 0) - (countBy.get(b.userId) ?? 0));
  return pool[0].userId;
}

async function markUrgent(opts: {
  conversationId: string;
  leadId?: string | null;
  reason: "default_model" | "ai_error" | "handoff" | "ai_limit";
  assigneeId: string;
}) {
  const conv = await prisma.conversation.findUnique({ where: { id: opts.conversationId } });
  const reason = conv?.urgentReason === "handoff" ? "handoff" : opts.reason;
  await prisma.conversation.update({
    where: { id: opts.conversationId },
    data: { urgent: true, urgentReason: reason, unread: true },
  });
  if (opts.leadId) {
    await prisma.lead.update({
      where: { id: opts.leadId },
      data: { urgent: true, assigneeId: opts.assigneeId },
    });
  }
}

function withKnowledge(base: string, articles: { title: string; body: string }[]) {
  if (!articles.length) return base;
  const block = articles.map((a) => `${a.title}\n${a.body}`).join("\n\n");
  return `${base}\n\n--- знания ---\n${block}\n--- конец знаний ---\nОпирайся на знания и текст клиента. Не выдумывай цифры, которых нет в статьях. Спорное — к менеджеру.`;
}

export async function findOrCreateContact(input: IngestInput) {
  const byExternal = await prisma.contactChannel.findUnique({
    where: {
      workspaceId_type_externalId: {
        workspaceId: input.workspaceId,
        type: input.source,
        externalId: input.externalId,
      },
    },
  });
  if (byExternal) {
    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: byExternal.contactId } });
    if (input.phone && !contact.phone) {
      await prisma.contact.update({ where: { id: contact.id }, data: { phone: input.phone } });
    }
    if (input.name && contact.name === "Без имени") {
      await prisma.contact.update({ where: { id: contact.id }, data: { name: input.name } });
    }
    return prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
  }

  if (input.phone) {
    const byPhone = await prisma.contact.findFirst({
      where: { workspaceId: input.workspaceId, phone: input.phone },
    });
    if (byPhone) {
      await prisma.contactChannel.create({
        data: {
          workspaceId: input.workspaceId,
          contactId: byPhone.id,
          channelId: input.channelId,
          type: input.source,
          externalId: input.externalId,
          username: input.username,
        },
      });
      return byPhone;
    }
  }

  const contact = await prisma.contact.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name || input.username || "Без имени",
      phone: input.phone,
      comment: sanitizeModelText(input.body).slice(0, 500),
    },
  });
  await prisma.contactChannel.create({
    data: {
      workspaceId: input.workspaceId,
      contactId: contact.id,
      channelId: input.channelId,
      type: input.source,
      externalId: input.externalId,
      username: input.username,
    },
  });
  return contact;
}

type ProcessRun = {
  processId: string;
  blockId: string;
  type: string;
  prompt: string;
  explicit: { provider: string; model: string } | null;
  fallback: { provider: string; model: string } | null;
};

async function loadProcesses(workspaceId: string): Promise<ProcessRun[]> {
  const flow = await prisma.flow.findFirst({
    where: { workspaceId },
    include: { blocks: { orderBy: { position: "asc" } } },
  });
  if (!flow) return [];
  const out: ProcessRun[] = [];
  for (const block of flow.blocks) {
    if (block.type !== "ai_process") continue;
    const cfg = asConfig(block.config);
    if (!cfg.aiProcessId) continue;
    const proc = await prisma.aiProcess.findUnique({
      where: { id: cfg.aiProcessId },
      include: { binding: true },
    });
    if (!proc) continue;
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    out.push({
      processId: proc.id,
      blockId: block.id,
      type: proc.type,
      prompt: proc.prompt,
      explicit: explicitBinding(proc.binding?.provider, proc.binding?.model),
      fallback: parseBinding(ws.defaultModel),
    });
  }
  return out;
}

async function upsertFields(
  workspaceId: string,
  contactId: string,
  leadId: string | null,
  values: Record<string, string>,
) {
  const fields = await prisma.customField.findMany({ where: { workspaceId } });
  for (const field of fields) {
    const raw = values[field.key];
    if (raw === undefined || raw === "") continue;
    const err = validateField(field.fieldType, raw, false);
    if (err) continue;
    await prisma.fieldValue.create({
      data: {
        workspaceId,
        fieldId: field.id,
        contactId,
        leadId,
        value: raw.trim(),
      },
    });
  }
}

async function sessionHistory(conversationId: string) {
  const reset = await prisma.message.findFirst({
    where: { conversationId, direction: "system", body: { startsWith: "Сессия сброшена" } },
    orderBy: { createdAt: "desc" },
  });
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      direction: { in: ["inbound", "outbound"] },
      ...(reset ? { createdAt: { gt: reset.createdAt } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 12,
  });
  return messages
    .map((m) => `${m.direction === "inbound" ? "клиент" : "мы"}: ${m.body}`)
    .join("\n");
}

export async function ingestInbound(input: IngestInput) {
  if (!input.phone) {
    const found = extractPhone(input.body);
    if (found) input.phone = found;
  }

  if (input.eventKey) {
    try {
      await prisma.channelEvent.create({
        data: {
          workspaceId: input.workspaceId,
          channelId: input.channelId,
          eventKey: input.eventKey,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        return { contactId: null, conversationId: null, leadId: null, urgent: false, duplicate: true };
      }
      throw e;
    }
  }

  const processes = await loadProcesses(input.workspaceId);
  const flow = await prisma.flow.findFirst({
    where: { workspaceId: input.workspaceId },
    include: { blocks: { orderBy: { position: "asc" } } },
  });
  const hasCreateLeadAction = Boolean(
    flow?.blocks.some((b) => b.type === "action" && asConfig(b.config).actionType === "create_lead"),
  );
  const needsWatch = processes
    .filter((p) => p.type === "parse_inbound" || p.type === "draft_reply")
    .some((p) => !p.explicit);
  const handoff = wantsManager(input.body);
  const channelRow = await prisma.channel.findUnique({ where: { id: input.channelId } });
  const articles = pickKnowledge(
    await prisma.knowledgeArticle.findMany({
      where: {
        workspaceId: input.workspaceId,
        enabled: true,
        ...(channelRow?.topicId ? { topicId: channelRow.topicId } : {}),
      },
      orderBy: { createdAt: "asc" },
    }),
    input.body,
  );

  const contact = await findOrCreateContact(input);
  let conversation = await prisma.conversation.findFirst({
    where: { workspaceId: input.workspaceId, contactId: contact.id, channelId: input.channelId },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: contact.id,
        channelId: input.channelId,
        unread: true,
      },
    });
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { unread: true },
    });
  }

  await prisma.message.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      direction: "inbound",
      body: input.body,
    },
  });
  await logActivity({
    workspaceId: input.workspaceId,
    conversationId: conversation.id,
    channelId: input.channelId,
    actor: "система",
    event: "ingest",
    message: `${input.source}: ${input.body.slice(0, 160)}`,
  });

  if (isStartCommand(input.body)) {
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: input.workspaceId } });
    const greeting = ws.greeting?.trim() || defaultGreeting();
    await prisma.message.create({
      data: {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        direction: "system",
        body: "Сессия сброшена. Новый заход, старый расчёт не подмешиваем.",
      },
    });
    await prisma.message.create({
      data: {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        direction: "outbound",
        body: greeting,
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { unread: true, urgent: false, urgentReason: null, aiError: null, status: "ai" },
    });
    await logActivity({
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      channelId: input.channelId,
      actor: "система",
      event: "start",
      message: "Сессия сброшена по /start",
    });
    return {
      contactId: contact.id,
      conversationId: conversation.id,
      leadId: null,
      urgent: false,
      start: true,
      greeting,
    };
  }

  conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
  let humanOwns = conversation.status === "manager" || conversation.status === "closed";
  const closed = conversation.status === "closed";

  let assigneeId: string | null = conversation.assigneeId;
  if (needsWatch && !humanOwns) {
    assigneeId = await pickAssignee(input.workspaceId);
    await markUrgent({
      conversationId: conversation.id,
      reason: "default_model",
      assigneeId,
    });
  }

  if (handoff) {
    assigneeId = assigneeId ?? (await pickAssignee(input.workspaceId));
    await markUrgent({
      conversationId: conversation.id,
      reason: "handoff",
      assigneeId,
    });
    await prisma.message.create({
      data: {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        direction: "system",
        body: "Клиент просит человека. Диалог в очереди менеджера.",
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "manager", assigneeId },
    });
    humanOwns = true;
    await logActivity({
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      channelId: input.channelId,
      actor: "клиент",
      event: "handoff",
      message: "Клиент просит человека",
    });
  }

  const history = await sessionHistory(conversation.id);
  const parse = processes.find((p) => p.type === "parse_inbound");
  let parsed: { name?: string; phone?: string; summary?: string; fields?: Record<string, string> } = {};
  if (parse && !closed) {
    const binding = parse.explicit ?? parse.fallback ?? { provider: "mock", model: "ok" };
    try {
      const system = withKnowledge(
        parse.prompt ||
          "Ты разбираешь входящую заявку малого бизнеса. Верни JSON {name, phone, summary, fields} без markdown.",
        articles,
      );
      const text = await runModel({
        provider: binding.provider,
        model: binding.model,
        system,
        user: history || input.body,
      });
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      }
      await prisma.flowBlock.update({ where: { id: parse.blockId }, data: { lastError: null } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка модели";
      await prisma.flowBlock.update({ where: { id: parse.blockId }, data: { lastError: msg } });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { aiError: msg, unread: true },
      });
      await prisma.message.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          direction: "system",
          body: `Ошибка AI «разобрать»: ${msg}`,
          aiError: msg,
        },
      });
      await logActivity({
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        channelId: input.channelId,
        actor: "система",
        event: "ai_error",
        message: msg,
      });
      if (parse.explicit) {
        assigneeId = assigneeId ?? (await pickAssignee(input.workspaceId));
        await markUrgent({
          conversationId: conversation.id,
          reason: "ai_error",
          assigneeId,
        });
      }
    }
  }

  if (parsed.name && contact.name === "Без имени") {
    await prisma.contact.update({ where: { id: contact.id }, data: { name: parsed.name } });
  }
  if (parsed.phone && !contact.phone) {
    await prisma.contact.update({ where: { id: contact.id }, data: { phone: parsed.phone } });
  }

  const shouldCreateLead = input.source === "web_form" || hasCreateLeadAction || handoff;
  let leadId: string | null = null;
  if (shouldCreateLead) {
    const existing =
      input.source !== "web_form"
        ? await prisma.lead.findFirst({ where: { conversationId: conversation.id } })
        : null;
    if (existing) {
      leadId = existing.id;
      if ((needsWatch || handoff) && assigneeId) {
        await prisma.lead.update({
          where: { id: existing.id },
          data: { urgent: true, assigneeId },
        });
      }
    } else {
      const lead = await prisma.lead.create({
        data: {
          workspaceId: input.workspaceId,
          contactId: contact.id,
          conversationId: conversation.id,
          status: "new",
          source: input.source,
          urgent: needsWatch || handoff,
          assigneeId: needsWatch || handoff ? assigneeId : null,
          comment: sanitizeModelText(parsed.summary || input.body).slice(0, 400),
        },
      });
      leadId = lead.id;
    }
    if (!needsWatch && !handoff) {
      const conv = await prisma.conversation.findUnique({ where: { id: conversation.id } });
      if (conv?.urgent && conv.urgentReason === "ai_error" && assigneeId && leadId) {
        await prisma.lead.update({ where: { id: leadId }, data: { urgent: true, assigneeId } });
      }
    }
  }

  const fieldBag = { ...(input.fields ?? {}), ...(parsed.fields ?? {}) };
  await upsertFields(input.workspaceId, contact.id, leadId, fieldBag);

  const draft = processes.find((p) => p.type === "draft_reply");
  if (draft && !humanOwns) {
    const binding = draft.explicit ?? draft.fallback ?? { provider: "mock", model: "ok" };
    try {
      const system = withKnowledge(
        draft.prompt ||
          "Ты менеджер малого бизнеса. Напиши короткий черновик ответа клиенту по-русски. Не обещай того, чего нет в тексте.",
        articles,
      );
      const text = await runModel({
        provider: binding.provider,
        model: binding.model,
        system,
        user: history || input.body,
      });
      await prisma.message.create({
        data: {
          workspaceId: input.workspaceId,
          conversationId: conversation.id,
          direction: "draft",
          body: text,
        },
      });
      if (input.source === "web_chat" && draft.explicit && !needsWatch && !humanOwns && !handoff) {
        await prisma.message.create({
          data: {
            workspaceId: input.workspaceId,
            conversationId: conversation.id,
            direction: "outbound",
            body: text,
            sentAt: new Date(),
          },
        });
      }
      await prisma.flowBlock.update({ where: { id: draft.blockId }, data: { lastError: null } });
      const reset = await prisma.message.findFirst({
        where: { conversationId: conversation.id, direction: "system", body: { startsWith: "Сессия сброшена" } },
        orderBy: { createdAt: "desc" },
      });
      const drafts = await prisma.message.count({
        where: {
          conversationId: conversation.id,
          direction: "draft",
          ...(reset ? { createdAt: { gt: reset.createdAt } } : {}),
        },
      });
      if (drafts >= AI_DRAFT_LIMIT) {
        assigneeId = assigneeId ?? (await pickAssignee(input.workspaceId));
        await markUrgent({
          conversationId: conversation.id,
          leadId,
          reason: "ai_limit",
          assigneeId,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка модели";
      await prisma.flowBlock.update({ where: { id: draft.blockId }, data: { lastError: msg } });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { aiError: msg },
      });
      if (draft.explicit) {
        assigneeId = assigneeId ?? (await pickAssignee(input.workspaceId));
        await markUrgent({
          conversationId: conversation.id,
          leadId,
          reason: "ai_error",
          assigneeId,
        });
      }
    }
  }

  const deep = processes.find((p) => p.type === "deep_analysis");
  if (!humanOwns && deep && (deep.explicit || deep.fallback)) {
    const binding = deep.explicit ?? deep.fallback;
    if (binding) {
      try {
        await runModel({
          provider: binding.provider,
          model: binding.model,
          system: withKnowledge(deep.prompt || "Кратко отметь риски и вопросы по заявке.", articles),
          user: history || input.body,
        });
        await prisma.flowBlock.update({ where: { id: deep.blockId }, data: { lastError: null } });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Ошибка модели";
        await prisma.flowBlock.update({ where: { id: deep.blockId }, data: { lastError: msg } });
      }
    }
  }

  const conv = await prisma.conversation.findUnique({ where: { id: conversation.id } });
  return {
    contactId: contact.id,
    conversationId: conversation.id,
    leadId,
    urgent: Boolean(conv?.urgent),
    start: false,
    greeting: null as string | null,
  };
}
