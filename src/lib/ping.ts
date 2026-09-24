import { prisma } from "./prisma";
import { parseBinding, runModel } from "./ai";
import { asConfig } from "./workspace";
import { DEFAULT_PING_TEXT, PING_PROMPT } from "./sales";
import { isStale, lastByDirection } from "./sla";
import { deliverOutbound } from "./outbound";
import { logActivity } from "./activity";
import { pickAssignee } from "./routing";

function explicit(provider?: string | null, model?: string | null) {
  if (!provider || !model) return null;
  if (!provider.trim() || !model.trim()) return null;
  return { provider, model };
}

async function pingProcess(workspaceId: string, channelId?: string) {
  const flows = await prisma.flow.findMany({
    where: { workspaceId },
    include: { blocks: true },
    orderBy: { createdAt: "asc" },
  });
  const ranked = channelId
    ? [
        ...flows.filter((f) =>
          f.blocks.some((b) => b.type === "channel" && asConfig(b.config).channelId === channelId),
        ),
        ...flows,
      ]
    : flows;
  const seen = new Set<string>();
  for (const flow of ranked) {
    if (seen.has(flow.id)) continue;
    seen.add(flow.id);
    for (const block of flow.blocks) {
      if (block.type !== "ai_process") continue;
      const cfg = asConfig(block.config);
      if (cfg.processType !== "client_ping" || !cfg.aiProcessId) continue;
      const proc = await prisma.aiProcess.findUnique({
        where: { id: cfg.aiProcessId },
        include: { binding: true },
      });
      if (!proc) continue;
      return {
        prompt: proc.prompt || PING_PROMPT,
        explicit: explicit(proc.binding?.provider, proc.binding?.model),
      };
    }
  }
  return null;
}

async function draftPingText(workspaceId: string, history: string, channelId?: string) {
  const ping = await pingProcess(workspaceId, channelId);
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const binding = ping?.explicit ?? parseBinding(ws?.defaultModel) ?? { provider: "mock", model: "ok" };
  try {
    return await runModel({
      provider: binding.provider,
      model: binding.model,
      system: ping?.prompt || PING_PROMPT,
      user: history.slice(-2000) || "Клиент молчит после нашего ответа.",
    });
  } catch {
    return DEFAULT_PING_TEXT;
  }
}

export async function runFollowups(workspaceId?: string) {
  const workspaces = await prisma.workspace.findMany({
    where: workspaceId ? { id: workspaceId } : undefined,
  });
  let drafted = 0;
  let sent = 0;
  let reminded = 0;
  for (const ws of workspaces) {
    if (!ws.pingEnabled) continue;
    const convs = await prisma.conversation.findMany({
      where: { workspaceId: ws.id, status: { not: "closed" } },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 20 },
        channel: true,
        contact: { include: { channels: true } },
        leads: { select: { id: true } },
      },
    });
    for (const conv of convs) {
      if (conv.pingSentAt) continue;
      const ping = await pingProcess(ws.id, conv.channelId);
      const lastIn = lastByDirection(conv.messages, "inbound");
      const lastOut = lastByDirection(conv.messages, "outbound");
      if (!lastOut) continue;
      const weWroteLast = !lastIn || lastOut.createdAt >= lastIn.createdAt;
      if (!weWroteLast) continue;
      const afterManager = conv.status === "manager" || conv.leads.length > 0;
      if (!afterManager) continue;
      const stale = isStale({
        status: conv.status,
        slaMinutes: ws.slaMinutes,
        lastInboundAt: lastIn?.createdAt,
        lastOutboundAt: lastOut.createdAt,
      });
      if (!stale) continue;

      if (conv.urgentReason !== "handoff" && conv.urgentReason !== "silent_client") {
        const assigneeId = conv.assigneeId ?? (await pickAssignee(ws.id));
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            urgent: true,
            urgentReason: "silent_client",
            unread: true,
            assigneeId,
          },
        });
        if (conv.leads[0]) {
          await prisma.lead.update({
            where: { id: conv.leads[0].id },
            data: { urgent: true, assigneeId },
          });
        }
        reminded += 1;
      }

      let draftBody: string | null = null;
      if (!conv.pingDraftedAt) {
        const history = [...conv.messages].reverse().map((m) => `${m.direction}: ${m.body}`).join("\n");
        draftBody = await draftPingText(ws.id, history, conv.channelId);
        await prisma.message.create({
          data: {
            workspaceId: ws.id,
            conversationId: conv.id,
            direction: "draft",
            body: draftBody,
          },
        });
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { pingDraftedAt: new Date() },
        });
        await logActivity({
          workspaceId: ws.id,
          conversationId: conv.id,
          actor: "система",
          event: "ping_draft",
          message: "Черновик пинга: клиент молчит дольше SLA",
        });
        drafted += 1;
      } else {
        const existing = conv.messages.find((m) => m.direction === "draft");
        draftBody = existing?.body ?? DEFAULT_PING_TEXT;
      }

      const autoSend = Boolean(ping?.explicit);
      if (autoSend && draftBody) {
        await deliverOutbound(conv, draftBody);
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { pingSentAt: new Date() },
        });
        await logActivity({
          workspaceId: ws.id,
          conversationId: conv.id,
          actor: "система",
          event: "ping_send",
          message: "Пинг ушёл: явная модель на процессе пинга",
        });
        sent += 1;
      }
    }
  }
  return { drafted, sent, reminded };
}
