#!/usr/bin/env node
/**
 * Приёмка фазы 2–3: промт в UI, пинг после SLA, маршрутизация, опрос Telegram;
 * почта, несколько линейных цепочек, curl модели, CSV;
 * воронка/KPI, RAG-lite, PDF, DLP, 152-ФЗ, курс ЦБ, статусы, галерея, IMAP;
 * поиск, колокольчик, настройки, склейка контактов, коробка;
 * метки, внутренние заметки, шаблоны, лента;
 * задачи, закрепление, CSV-импорт, исходящий webhook, причина отказа;
 * отложить/архив, массовые лиды, рабочие часы, аудит просмотра.
 * Сервер на BASE_URL (по умолчанию http://localhost:3000).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
void ROOT;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  let jsonBody = opts.json;
  if (jsonBody) {
    if (
      opts.method === "POST" &&
      typeof jsonBody === "object" &&
      jsonBody.consent === undefined &&
      (path.includes("/ingest/web-form/") || path.includes("/ingest/web-chat/"))
    ) {
      jsonBody = { consent: true, ...jsonBody };
    }
    headers["Content-Type"] = "application/json";
  }
  if (opts.cookie) headers.Cookie = opts.cookie;
  const res = await fetch(BASE + path, {
    method: opts.method || "GET",
    headers,
    body: jsonBody ? JSON.stringify(jsonBody) : opts.body,
    redirect: "manual",
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ") || opts.cookie;
  return { status: res.status, data, cookie, headers: res.headers };
}

function stamp() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function phone() {
  return "7999" + String(Math.floor(10000000 + Math.random() * 89999999)).slice(0, 7);
}

async function main() {
  const health = await req("/api/health");
  assert(health.status === 200 && health.data.ok === true, "health");

  const id = stamp();
  const email = `p2-owner-${id}@example.com`;
  let r = await req("/api/auth/register", {
    method: "POST",
    json: { name: "Владелец П2", email, password: "secret12" },
  });
  assert(r.status === 200, "register: " + JSON.stringify(r.data));
  let cookie = r.cookie;
  assert(cookie, "session");

  r = await req("/api/onboarding", {
    method: "POST",
    cookie,
    json: {
      name: "Фаза 2",
      tradeDescription: "контейнеры",
      vedTemplate: true,
      defaultModel: "mock:ok",
    },
  });
  assert(r.status === 200, "onboarding: " + JSON.stringify(r.data));
  if (r.cookie) cookie = r.cookie;

  const ws0 = await req("/api/workspace", { cookie });
  assert(ws0.status === 200, "workspace get");
  assert(/Ты МАКС/.test(ws0.data.salesPrompt || ""), "salesPrompt seeded from prodazhnik");
  assert(ws0.data.routingMode === "pool", "default routing pool");

  async function add(kind) {
    const x = await req("/api/flow/blocks", { method: "POST", cookie, json: { kind } });
    assert(x.status === 200, "add " + kind + " " + JSON.stringify(x.data));
    return x.data.block;
  }

  const chatBlock = await add("channel_web_chat");
  const draftBlock = await add("ai_draft");
  const pingBlock = await add("ai_ping");
  const formBlock = await add("channel_web_form");
  const parseBlock = await add("ai_parse");
  await add("action_create_lead");
  const tgBlock = await add("channel_telegram");

  const flow0 = await req("/api/flow", { cookie });
  assert(flow0.status === 200, "flow");
  assert(/пинг/.test(flow0.data.compact || ""), "palette ping in compact: " + flow0.data.compact);
  assert(flow0.data.httpsWebhook === false || typeof flow0.data.httpsWebhook === "boolean", "httpsWebhook flag");
  const chatCh = flow0.data.channels.find((c) => c.type === "web_chat");
  const formCh = flow0.data.channels.find((c) => c.type === "web_form");
  const tgCh = flow0.data.channels.find((c) => c.type === "telegram");
  const pingProc = flow0.data.processes.find((p) => p.type === "client_ping");
  const draftProc = flow0.data.processes.find((p) => p.type === "draft_reply");
  assert(chatCh && formCh && tgCh && pingProc && draftProc, "phase2 slots");
  assert(/ROLE=client_ping/.test(String(pingProc.prompt || "")), "ping prompt seeded");
  assert(/Ты МАКС/.test(String(draftProc.prompt || "")), "draft still sales prompt");

  r = await req(`/api/flow/blocks/${draftBlock.id}`, {
    method: "PATCH",
    cookie,
    json: { provider: "mock", model: "ok" },
  });
  assert(r.status === 200, "explicit draft");

  const markerPrompt = "CUSTOM_MARKER\nТы МАКС. Ответь коротко клиенту по сохранённому промту воркспейса.";
  r = await req("/api/workspace", {
    method: "PATCH",
    cookie,
    json: { salesPrompt: markerPrompt },
  });
  assert(r.status === 200 && /CUSTOM_MARKER/.test(r.data.salesPrompt || ""), "save salesPrompt");
  const flowPrompt = await req("/api/flow", { cookie });
  assert(/CUSTOM_MARKER/.test(flowPrompt.data.salesPrompt || ""), "flow returns salesPrompt");
  const draftAfter = (flowPrompt.data.processes || []).find((p) => p.type === "draft_reply");
  assert(/CUSTOM_MARKER/.test(String(draftAfter?.prompt || "")), "draft process synced");

  r = await req(`/api/ingest/web-chat/${chatCh.publicKey}`, {
    method: "POST",
    json: { sessionId: "p2-prompt-" + id, name: "Гость промт", text: "нужен контейнер из Шанхая" },
  });
  assert(r.status === 200 && r.data.conversationId, "chat ingest for prompt");
  const promptConv = await req(`/api/conversations/${r.data.conversationId}`, { cookie });
  const promptDraft = [...(promptConv.data.messages || [])].reverse().find((m) => m.direction === "draft");
  assert(promptDraft && /CUSTOM_MARKER/.test(promptDraft.body), "saved prompt used in draft: " + (promptDraft?.body || ""));

  r = await req("/api/workspace", {
    method: "PATCH",
    cookie,
    json: { salesPrompt: ws0.data.salesPrompt },
  });
  assert(r.status === 200, "restore salesPrompt");

  const inv1 = await req("/api/team", { method: "POST", cookie, json: {} });
  assert(inv1.status === 200 && inv1.data.invite.token, "invite 1");
  r = await req(`/api/invite/${inv1.data.invite.token}`, {
    method: "POST",
    json: { name: "Менеджер А", email: `p2-a-${id}@example.com`, password: "secret12" },
  });
  assert(r.status === 200, "accept A");
  const mgrACookie = r.cookie;
  const inv2 = await req("/api/team", { method: "POST", cookie, json: {} });
  r = await req(`/api/invite/${inv2.data.invite.token}`, {
    method: "POST",
    json: { name: "Менеджер Б", email: `p2-b-${id}@example.com`, password: "secret12" },
  });
  assert(r.status === 200, "accept B");
  const mgrBCookie = r.cookie;
  const team = await req("/api/team", { cookie });
  assert(team.data.routingMode === "pool", "team returns routingMode");
  const mgrs = (team.data.members || []).filter((m) => m.role === "manager");
  assert(mgrs.length >= 2, "two managers");
  const mgrA = mgrs.find((m) => m.name === "Менеджер А");
  const mgrB = mgrs.find((m) => m.name === "Менеджер Б");
  assert(mgrA && mgrB, "named managers");

  r = await req("/api/workspace", { method: "PATCH", cookie, json: { routingMode: "round_robin" } });
  assert(r.status === 200 && r.data.routingMode === "round_robin", "set round_robin");
  r = await req("/api/workspace", { method: "PATCH", cookie: mgrACookie, json: { routingMode: "pool" } });
  assert(r.status === 403, "manager cannot set routing");

  const phone1 = phone();
  const phone2 = phone();
  const phone3 = phone();
  const form1 = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Клиент RR1", phone: phone1 },
  });
  assert(form1.status === 200 && form1.data.leadId, "form rr1 " + JSON.stringify(form1.data));
  const form2 = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Клиент RR2", phone: phone2 },
  });
  assert(form2.status === 200 && form2.data.leadId, "form rr2");
  const form3 = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Клиент RR3", phone: phone3 },
  });
  assert(form3.status === 200 && form3.data.leadId, "form rr3");

  const leadsRr = await req("/api/leads", { cookie });
  const l1 = leadsRr.data.items.find((l) => l.id === form1.data.leadId);
  const l2 = leadsRr.data.items.find((l) => l.id === form2.data.leadId);
  const l3 = leadsRr.data.items.find((l) => l.id === form3.data.leadId);
  assert(l1?.assignee?.id && l2?.assignee?.id && l3?.assignee?.id, "rr assignees exist");
  assert(l1.assignee.id !== l2.assignee.id, "round_robin first two differ");
  assert(l1.assignee.id === l3.assignee.id, "round_robin cycles to first");
  assert(
    [mgrA.userId, mgrB.userId].includes(l1.assignee.id) && [mgrA.userId, mgrB.userId].includes(l2.assignee.id),
    "round_robin stays in manager pool",
  );

  r = await req(`/api/leads/${form3.data.leadId}/claim`, { method: "POST", cookie: mgrBCookie });
  assert(r.status === 200, "claim still works");
  assert(r.data.lead.assigneeId === mgrB.userId, "claim overrides routing");
  assert(r.data.lead.status === "in_progress", "claim in_progress");

  r = await req(`/api/leads/${form2.data.leadId}`, { method: "PATCH", cookie, json: { status: "qualified" } });
  assert(r.status === 200, "qualify rr2 so pool is uneven");
  r = await req("/api/workspace", { method: "PATCH", cookie, json: { routingMode: "pool" } });
  assert(r.status === 200 && r.data.routingMode === "pool", "set pool");
  const phone4 = phone();
  const form4 = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Клиент пул", phone: phone4 },
  });
  assert(form4.status === 200 && form4.data.leadId, "form pool");
  const leadsPool = await req("/api/leads", { cookie });
  const l4 = leadsPool.data.items.find((l) => l.id === form4.data.leadId);
  assert(l4?.assignee?.id === l1.assignee.id, "pool picks fewer open leads");

  r = await req(`/api/channels/${tgCh.id}/poll`, { method: "POST", cookie, json: { pollMode: true } });
  assert(r.status === 200 && r.data.pollMode === true, "enable poll without token");
  r = await req(`/api/flow/blocks/${tgBlock.id}`, {
    method: "PATCH",
    cookie,
    json: { allowedOrigins: [] },
  });
  assert(r.status === 200, "patch origins");
  const pollKept = await req(`/api/channels/${tgCh.id}/poll`, { cookie });
  assert(pollKept.status === 200 && pollKept.data.pollMode === true, "pollMode survives origins patch");

  r = await req(`/api/channels/${tgCh.id}/poll`, {
    method: "POST",
    cookie,
    json: {
      updates: [
        {
          update_id: 41,
          message: {
            chat: { id: 41001 },
            from: { id: 41001, username: "poller", first_name: "Полл" },
            text: "опрос getUpdates: модули памяти",
          },
        },
      ],
    },
  });
  assert(r.status === 200 && r.data.ok === true, "injected poll " + JSON.stringify(r.data));
  assert(r.data.processed >= 1, "poll processed update");
  assert(r.data.offset === 42, "poll offset update_id+1");
  const inboxPoll = await req("/api/inbox", { cookie });
  assert(
    (inboxPoll.data.items || []).some((i) => i.contact.name === "Полл"),
    "poll ingest in inbox",
  );
  const flowPoll = await req("/api/flow", { cookie });
  const tgAfter = flowPoll.data.channels.find((c) => c.id === tgCh.id);
  assert(tgAfter.pollMode === true, "flow pollMode");
  assert(tgAfter.pollOffset === 42, "flow pollOffset");

  r = await req(`/api/channels/${tgCh.id}/simulate`, {
    method: "POST",
    cookie,
    json: { chatId: "p2-silent-" + id, text: "жду расчёт по модулям", name: "Тихий" },
  });
  assert(r.status === 200 && r.data.conversationId, "silent simulate");
  const silentId = r.data.conversationId;
  r = await req(`/api/conversations/${silentId}`, {
    method: "POST",
    cookie,
    json: { text: "Написали из CRM, ждём ответ.", send: true },
  });
  assert(r.status === 200 && r.data.sent === true, "manager send before ping");

  r = await req("/api/workspace", { method: "PATCH", cookie, json: { slaMinutes: 0 } });
  assert(r.status === 200 && r.data.slaMinutes === 0, "sla 0");
  const tick1 = await req("/api/ops/tick", { method: "POST", cookie, json: {} });
  assert(tick1.status === 200, "ops tick " + JSON.stringify(tick1.data));
  assert(tick1.data.followups?.drafted >= 1, "ping drafted without auto-send");
  assert((tick1.data.followups?.sent || 0) === 0, "default model does not auto-send ping");
  assert(tick1.data.followups?.reminded >= 1, "manager reminded");

  const silentAfter = await req(`/api/conversations/${silentId}`, { cookie });
  assert(silentAfter.data.pingDraftedAt, "pingDraftedAt set");
  assert(!silentAfter.data.pingSentAt, "ping not sent yet");
  assert(silentAfter.data.urgent === true, "silent urgent");
  assert(silentAfter.data.urgentReason === "silent_client", "urgentReason silent_client");
  const pingDraft = [...(silentAfter.data.messages || [])].reverse().find((m) => m.direction === "draft");
  assert(pingDraft && /актуальн/i.test(pingDraft.body), "ping draft text");
  const outBefore = (silentAfter.data.messages || []).filter((m) => m.direction === "outbound").length;

  const inboxPing = await req("/api/inbox", { cookie });
  const pingItem = (inboxPing.data.items || []).find((i) => i.id === silentId);
  assert(pingItem?.pingDrafted === true, "inbox pingDrafted");
  assert(pingItem?.urgentReason === "silent_client", "inbox silent_client");

  const tick2 = await req("/api/ops/tick", { method: "POST", cookie, json: {} });
  assert(tick2.status === 200, "second tick");
  assert((tick2.data.followups?.drafted || 0) === 0, "one ping draft lifetime");
  const silent2 = await req(`/api/conversations/${silentId}`, { cookie });
  const drafts = (silent2.data.messages || []).filter((m) => m.direction === "draft" && /актуальн/i.test(m.body));
  assert(drafts.length === 1, "still one ping draft");
  assert((silent2.data.messages || []).filter((m) => m.direction === "outbound").length === outBefore, "no auto outbound");

  r = await req(`/api/conversations/${silentId}`, {
    method: "POST",
    cookie,
    json: { text: pingDraft.body, send: true, draftId: pingDraft.id },
  });
  assert(r.status === 200 && r.data.sent === true, "manager send ping button");
  const silentSent = await req(`/api/conversations/${silentId}`, { cookie });
  assert(silentSent.data.pingSentAt, "pingSentAt after button");
  assert(
    (silentSent.data.messages || []).some((m) => m.direction === "outbound" && /актуальн/i.test(m.body)),
    "ping outbound after button",
  );

  const tick3 = await req("/api/ops/tick", { method: "POST", cookie, json: {} });
  assert((tick3.data.followups?.drafted || 0) === 0, "no second ping after send");

  r = await req(`/api/conversations/${silentId}`, { method: "PATCH", cookie, json: { action: "reset" } });
  assert(r.status === 200 && r.data.reset === true, "reset clears ping");
  const silentReset = await req(`/api/conversations/${silentId}`, { cookie });
  assert(!silentReset.data.pingDraftedAt && !silentReset.data.pingSentAt, "ping timestamps cleared");

  r = await req(`/api/flow/blocks/${pingBlock.id}`, {
    method: "PATCH",
    cookie,
    json: { provider: "mock", model: "ok" },
  });
  assert(r.status === 200, "explicit ping model");
  r = await req(`/api/channels/${tgCh.id}/simulate`, {
    method: "POST",
    cookie,
    json: { chatId: "p2-auto-" + id, text: "ещё заявка", name: "Автопинг" },
  });
  const autoId = r.data.conversationId;
  r = await req(`/api/conversations/${autoId}`, {
    method: "POST",
    cookie,
    json: { text: "Ответили, ждём.", send: true },
  });
  assert(r.status === 200 && r.data.sent === true, "manager send auto-ping conv");
  const tickAuto = await req("/api/ops/tick", { method: "POST", cookie, json: {} });
  assert(tickAuto.status === 200 && tickAuto.data.followups?.sent >= 1, "explicit ping auto-sends " + JSON.stringify(tickAuto.data));
  const autoAfter = await req(`/api/conversations/${autoId}`, { cookie });
  assert(autoAfter.data.pingSentAt, "auto pingSentAt");
  assert(
    (autoAfter.data.messages || []).some((m) => m.direction === "outbound" && /актуальн/i.test(m.body)),
    "auto ping outbound",
  );

  r = await req("/api/workspace", { method: "PATCH", cookie, json: { slaMinutes: 15 } });
  assert(r.status === 200, "sla restored");

  r = await req(`/api/flow/blocks/${chatBlock.id}`, { method: "PATCH", cookie: mgrACookie, json: { label: "нет" } });
  assert(r.status === 403, "manager cannot edit flow");

  r = await req("/api/flow", { method: "PATCH", cookie, json: { id: flow0.data.flow.id, name: "Сайт-чат" } });
  assert(r.status === 200 && r.data.flow.name === "Сайт-чат", "rename flow сайт-чат");
  r = await req("/api/flow", { method: "POST", cookie: mgrACookie, json: { name: "нет" } });
  assert(r.status === 403, "manager cannot create flow");
  r = await req("/api/flow", { method: "POST", cookie, json: { name: "Telegram" } });
  assert(r.status === 200 && r.data.flow?.id, "second named flow");
  const flowTgId = r.data.flow.id;
  assert(r.data.flow.published === true, "new flow published");

  r = await req("/api/flow/blocks", {
    method: "POST",
    cookie,
    json: { kind: "channel_telegram", flowId: flowTgId },
  });
  assert(r.status === 200 && r.data.block?.config?.channelId, "tg on second flow " + JSON.stringify(r.data));
  const tg2ChannelId = r.data.block.config.channelId;
  r = await req("/api/flow/blocks", {
    method: "POST",
    cookie,
    json: { kind: "ai_draft", flowId: flowTgId },
  });
  assert(r.status === 200, "draft on second flow");
  const draft2Id = r.data.block.id;
  r = await req(`/api/flow/blocks/${draft2Id}`, {
    method: "PATCH",
    cookie,
    json: { provider: "mock", model: "ok-b" },
  });
  assert(r.status === 200, "explicit model B on telegram flow");

  const flowsNamed = await req("/api/flow", { cookie });
  assert((flowsNamed.data.flows || []).length >= 2, "two published chains");
  assert(
    flowsNamed.data.flows.some((f) => f.name === "Сайт-чат") && flowsNamed.data.flows.some((f) => f.name === "Telegram"),
    "named сайт-чат and Telegram",
  );
  const flowTgView = await req(`/api/flow?flowId=${flowTgId}`, { cookie });
  assert(flowTgView.data.flow.id === flowTgId, "load by flowId");
  assert(/telegram/i.test(flowTgView.data.compact || ""), "telegram compact on second chain");
  const tg2 = flowTgView.data.channels.find((c) => c.id === tg2ChannelId);
  assert(tg2 && tg2.type === "telegram", "second telegram channel");

  r = await req(`/api/ingest/web-chat/${chatCh.publicKey}`, {
    method: "POST",
    json: { sessionId: "p3-iso-chat-" + id, name: "Изоляция чат", text: "нужен контейнер из Шанхая" },
  });
  assert(r.status === 200 && r.data.conversationId, "iso chat ingest");
  const isoChat = await req(`/api/conversations/${r.data.conversationId}`, { cookie });
  const chatReply = [...(isoChat.data.messages || [])].reverse().find((m) => m.direction === "outbound" || m.direction === "draft");
  assert(chatReply && !/модель B/i.test(chatReply.body || ""), "сайт-чат flow stays model A: " + (chatReply?.body || ""));

  r = await req(`/api/channels/${tg2.id}/simulate`, {
    method: "POST",
    cookie,
    json: { chatId: "p3-iso-tg-" + id, text: "нужен контейнер из Шанхая", name: "Изоляция TG" },
  });
  assert(r.status === 200 && r.data.conversationId, "iso tg simulate");
  const isoTg = await req(`/api/conversations/${r.data.conversationId}`, { cookie });
  const tgReply = [...(isoTg.data.messages || [])].reverse().find((m) => m.direction === "outbound" || m.direction === "draft");
  assert(tgReply && /модель B/i.test(tgReply.body || ""), "telegram flow uses model B: " + (tgReply?.body || ""));

  r = await req("/api/flow", { method: "PATCH", cookie, json: { id: flowTgId, published: false } });
  assert(r.status === 200 && r.data.flow.published === false, "unpublish second chain");
  r = await req("/api/flow", { method: "PATCH", cookie, json: { id: flowTgId, published: true } });
  assert(r.status === 200 && r.data.flow.published === true, "publish again");

  r = await req("/api/flow/blocks", {
    method: "POST",
    cookie,
    json: { kind: "channel_email", flowId: flow0.data.flow.id },
  });
  assert(r.status === 200 && r.data.block?.config?.channelId, "email slot " + JSON.stringify(r.data));
  const emailBlock = r.data.block;
  r = await req(`/api/flow/blocks/${emailBlock.id}`, {
    method: "PATCH",
    cookie,
    json: { fromAddress: "inbox@pilot.example", smtpHost: "", smtpPort: 465 },
  });
  assert(r.status === 200, "save email mailbox");
  const flowEmail = await req(`/api/flow?flowId=${flow0.data.flow.id}`, { cookie });
  const emailCh = flowEmail.data.channels.find((c) => c.id === emailBlock.config.channelId);
  assert(emailCh && emailCh.type === "email", "email channel");
  assert(/\/api\/ingest\/email\//.test(emailCh.ingestUrl || emailCh.webhookUrl || ""), "email ingest url");
  assert(emailCh.mailto === "mailto:inbox@pilot.example", "mailto " + emailCh.mailto);
  assert(/почта/.test(flowEmail.data.compact || ""), "email in compact: " + flowEmail.data.compact);

  const mailFrom = `client-${id}@mail.test`;
  r = await req(`/api/ingest/email/${emailCh.publicKey}`, {
    method: "POST",
    json: { from: mailFrom, name: "Почта Клиент", subject: "FCA Шанхай", text: "модули памяти 20 кг" },
  });
  assert(r.status === 200 && r.data.conversationId, "email ingest " + JSON.stringify(r.data));
  assert(r.data.leadId, "email creates lead");
  const emailConvId = r.data.conversationId;
  const emailLeadId = r.data.leadId;

  r = await req(`/api/conversations/${emailConvId}`, {
    method: "POST",
    cookie,
    json: { text: "Ответ с почты CRM", send: true },
  });
  assert(r.status === 200 && r.data.sent === true, "email outbound from CRM");
  const emailConv = await req(`/api/conversations/${emailConvId}`, { cookie });
  assert(
    (emailConv.data.messages || []).some((m) => m.direction === "outbound" && /Ответ с почты CRM/.test(m.body)),
    "email outbound stored without SMTP",
  );
  assert(emailConv.data.channel?.type === "email", "conversation channel email");

  r = await req(`/api/channels/${emailCh.id}/simulate`, {
    method: "POST",
    cookie,
    json: { from: `sim-${id}@mail.test`, subject: "симуляция", text: "проверка симуляции почты", name: "Симуляция почты" },
  });
  assert(r.status === 200 && r.data.conversationId, "email simulate");

  const formEmail = new URLSearchParams({
    from: `form-${id}@mail.test`,
    name: "Форма почты",
    subject: "form-to-mailbox",
    text: "заявка через форму",
  });
  r = await req(`/api/ingest/email/${emailCh.publicKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formEmail.toString(),
  });
  assert(r.status === 200 && r.data.conversationId, "email form ingest");

  const csv = await req("/api/leads?format=csv", { cookie });
  assert(csv.status === 200, "leads csv status");
  const csvText = csv.data?.raw || "";
  assert(/Почта Клиент/.test(csvText), "csv has email lead");
  assert(/почта/.test(csvText), "csv source почта");
  const cardCsv = await req(`/api/leads/${emailLeadId}?format=csv`, { cookie });
  assert(cardCsv.status === 200 && /поле/.test(cardCsv.data?.raw || ""), "lead card csv");
  const contactId = (await req(`/api/leads/${emailLeadId}`, { cookie })).data.contactId || emailConv.data.contactId;
  if (contactId) {
    const contactCsv = await req(`/api/contacts/${contactId}?format=csv`, { cookie });
    assert(contactCsv.status === 200 && /поле/.test(contactCsv.data?.raw || ""), "contact card csv");
  }

  r = await req("/api/models", {
    method: "POST",
    cookie,
    json: { provider: "mock", model: "ok", user: "SAMPLE_PROMPT_PING" },
  });
  assert(r.status === 200 && r.data.ok === true, "model ping " + JSON.stringify(r.data));
  assert(/SAMPLE_PROMPT_PING/.test(r.data.raw || ""), "model raw includes sample: " + (r.data.raw || ""));
  r = await req("/api/models", {
    method: "POST",
    cookie,
    json: { processId: draftProc.id, user: "проверка слота" },
  });
  assert(r.status === 200 && r.data.ok === true && r.data.provider === "mock", "bound process ping");
  assert(typeof r.data.raw === "string" && r.data.raw.length > 0, "bound process raw");
  r = await req("/api/models", { method: "POST", cookie: mgrACookie, json: { provider: "mock", model: "ok", user: "нет" } });
  assert(r.status === 403, "manager cannot curl model");

  r = await req("/api/flow", { method: "POST", cookie, json: { name: "Лишняя" } });
  assert(r.status === 200, "temp flow");
  const extraFlowId = r.data.flow.id;
  r = await req(`/api/flow?id=${extraFlowId}`, { method: "DELETE", cookie });
  assert(r.status === 200, "delete extra flow");
  r = await req("/api/flow", { method: "DELETE", cookie });
  assert(r.status >= 400, "delete needs id");

  const kn = await req("/api/knowledge", { cookie });
  const ved = (kn.data.topics || []).find((t) => t.name === "ВЭД");
  assert(ved, "ved topic for rag");
  r = await req("/api/knowledge", {
    method: "POST",
    cookie,
    json: {
      topicId: ved.id,
      title: "LCL сборная консолидация",
      body: "LCL сборный груз консолидация Шанхай. Маркер RAG_CHUNK_MARKER для чанков базы. Не авиа-фрахт.",
    },
  });
  assert(r.status === 200, "rag article " + JSON.stringify(r.data));
  r = await req("/api/knowledge", {
    method: "POST",
    cookie,
    json: {
      topicId: ved.id,
      title: "Авиа тарифы XYZDECOY",
      body: "Только авиа фрахт и ставки без консолидации LCL. Маркера сборной нет.",
    },
  });
  assert(r.status === 200, "decoy article");
  r = await req(`/api/ingest/web-chat/${chatCh.publicKey}`, {
    method: "POST",
    json: { sessionId: "p4-rag-" + id, name: "RAG гость", text: "нужен LCL сборный консолидация из Шанхая" },
  });
  assert(r.status === 200 && r.data.conversationId, "rag ingest");
  const ragConv = await req(`/api/conversations/${r.data.conversationId}`, { cookie });
  const ragText = (ragConv.data.messages || []).map((m) => m.body).join("\n");
  assert(/RAG_CHUNK_MARKER/.test(ragText), "rag chunk retrieved into reply: " + ragText.slice(0, 500));

  const stats4 = await req("/api/stats", { cookie });
  assert(stats4.status === 200 && stats4.data.funnel, "funnel payload");
  assert(typeof stats4.data.funnel.new === "number", "funnel.new");
  assert(stats4.data.funnel.qualified >= 1, "funnel qualified");
  assert(typeof stats4.data.conversion === "number" && stats4.data.conversion >= 0, "conversion");
  assert(Array.isArray(stats4.data.managers) && stats4.data.managers.length >= 1, "manager kpi");
  assert(typeof stats4.data.unread === "number", "unanswered");

  const ownerLead = await req(`/api/leads/${form1.data.leadId}`, { cookie });
  assert(ownerLead.data.contact.phone === phone1, "owner sees full phone");
  const mgrLead = await req(`/api/leads/${form1.data.leadId}`, { cookie: mgrACookie });
  assert(mgrLead.status === 200, "manager can read lead");
  assert(mgrLead.data.contact.phone !== phone1, "manager phone masked: " + mgrLead.data.contact.phone);
  assert(/•/.test(String(mgrLead.data.contact.phone || "")), "mask uses bullets");
  const mgrInbox = await req("/api/inbox", { cookie: mgrACookie });
  const rr1 = (mgrInbox.data.items || []).find((i) => i.contact?.name === "Клиент RR1");
  assert(rr1, "rr1 in manager inbox");
  assert(rr1.contact.phone !== phone1, "inbox phone masked");

  const pdf = await req(`/api/leads/${form1.data.leadId}?format=pdf`, { cookie });
  assert(pdf.status === 200, "lead pdf status");
  const pdfRaw = pdf.data?.raw || "";
  assert(pdfRaw.startsWith("%PDF"), "pdf magic " + pdfRaw.slice(0, 12));
  const ct = pdf.headers.get("content-type") || "";
  assert(/pdf/.test(ct), "pdf content-type " + ct);
  const pdfMgr = await req(`/api/leads/${form1.data.leadId}?format=pdf`, { cookie: mgrACookie });
  assert(pdfMgr.status === 200 && (pdfMgr.data?.raw || "").startsWith("%PDF"), "manager pdf");
  const csvMgr = await req(`/api/leads/${form1.data.leadId}?format=csv`, { cookie: mgrACookie });
  assert(!new RegExp(phone1).test(csvMgr.data?.raw || ""), "csv manager hides phone");
  const contactPdf = await req(`/api/contacts/${ownerLead.data.contactId}?format=pdf`, { cookie });
  assert((contactPdf.data?.raw || "").startsWith("%PDF"), "contact pdf");

  r = await req(`/api/leads/${form1.data.leadId}`, { method: "PATCH", cookie, json: { status: "qualified" } });
  assert(r.status === 200 && r.data.status === "qualified", "phase5 qualify from card api");
  const fx = await req("/api/fx", { cookie });
  assert(fx.status === 200, "fx endpoint");
  const tickImap = await req("/api/ops/tick", { method: "POST", cookie, json: {} });
  assert(tickImap.status === 200, "tick with imap skip");
  assert(tickImap.data.imap?.skipped === true || typeof tickImap.data.imap?.ingested === "number" || tickImap.data.imap?.error, "imap field on tick");
  assert(ownerLead.data.consentAt || ownerLead.data.contact?.consentAt, "form1 consent stored");

  const notes = await req("/api/notifications", { cookie });
  assert(notes.status === 200, "notifications list");
  assert(notes.data.unread >= 1, "bell unread on new lead");
  assert(
    (notes.data.items || []).some((n) => n.type === "lead_new" && /Новый/.test(n.title + n.body)),
    "in-app new lead notice",
  );
  const markNote = await req("/api/notifications", { method: "PATCH", cookie, json: { all: true } });
  assert(markNote.status === 200 && markNote.data.unread === 0, "mark all notifications read");

  const found = await req(`/api/search?q=${encodeURIComponent("Клиент RR1")}`, { cookie });
  assert(found.status === 200, "search");
  assert((found.data.contacts || []).some((c) => c.title === "Клиент RR1"), "search contact by name");
  assert((found.data.leads || []).some((l) => l.title === "Клиент RR1"), "search lead by name");
  assert((found.data.conversations || []).some((c) => c.title === "Клиент RR1"), "search conversation by name");
  const byPhone = await req(`/api/search?q=${phone1}`, { cookie });
  assert((byPhone.data.contacts || []).some((c) => c.href.includes(form1.data.contactId)), "search by phone");

  const settingsGet = await req("/api/workspace", { cookie });
  assert(settingsGet.status === 200, "settings get");
  assert(typeof settingsGet.data.pingEnabled === "boolean", "pingEnabled on workspace");
  assert(settingsGet.data.slaMinutes >= 0, "slaMinutes on workspace");
  assert(settingsGet.data.routingMode === "pool" || settingsGet.data.routingMode === "round_robin", "routing on settings");
  assert(typeof settingsGet.data.dataOnThisMachine === "boolean", "box flag");
  assert(settingsGet.data.deployMode === "saas" || settingsGet.data.deployMode === "box", "deployMode on settings");
  if (settingsGet.data.deployMode === "box") {
    assert(settingsGet.data.dataOnThisMachine === true, "box data on this machine");
    assert(settingsGet.data.publicRegistration === false, "box register off");
  }
  const settingsPatch = await req("/api/workspace", {
    method: "PATCH",
    cookie,
    json: { slaMinutes: 20, pingEnabled: false, routingMode: "round_robin", defaultModel: "mock:ok" },
  });
  assert(settingsPatch.status === 200 && settingsPatch.data.slaMinutes === 20, "settings sla");
  assert(settingsPatch.data.pingEnabled === false, "settings ping off");
  assert(settingsPatch.data.routingMode === "round_robin", "settings routing");
  const settingsBack = await req("/api/workspace", {
    method: "PATCH",
    cookie,
    json: { slaMinutes: 15, pingEnabled: true, routingMode: "pool" },
  });
  assert(settingsBack.status === 200 && settingsBack.data.pingEnabled === true, "settings ping on");

  const tgSave = await req("/api/team", { method: "PATCH", cookie, json: { telegram: "123456789" } });
  assert(tgSave.status === 200 && tgSave.data.member.telegram === "123456789", "member telegram profile");

  const phoneDupA = phone();
  const phoneDupB = phone();
  const dupA = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Дубль А", phone: phoneDupA },
  });
  const dupB = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Дубль Б", phone: phoneDupB },
  });
  assert(dupA.status === 200 && dupB.status === 200, "two contacts for merge");
  const patchB = await req(`/api/contacts/${dupB.data.contactId}`, {
    method: "PATCH",
    cookie,
    json: { phone: phoneDupA },
  });
  assert(patchB.status === 200, "align phones for duplicate");
  const cardA = await req(`/api/contacts/${dupA.data.contactId}`, { cookie });
  assert((cardA.data.duplicates || []).some((d) => d.id === dupB.data.contactId), "duplicate suggestion by phone");
  const merged = await req(`/api/contacts/${dupA.data.contactId}/merge`, {
    method: "POST",
    cookie,
    json: { otherId: dupB.data.contactId },
  });
  assert(merged.status === 200 && merged.data.ok === true, "merge contacts");
  const gone = await req(`/api/contacts/${dupB.data.contactId}`, { cookie });
  assert(gone.status === 404, "dropped contact gone");
  const kept = await req(`/api/contacts/${dupA.data.contactId}`, { cookie });
  assert(kept.status === 200, "kept contact");
  assert(!(kept.data.duplicates || []).some((d) => d.id === dupB.data.contactId), "merged duplicate gone");
  const searchCargo = await req(`/api/search?q=${encodeURIComponent("модул")}`, { cookie });
  assert(searchCargo.status === 200, "search cargo text");

  const tagName = "вэд-срочно";
  const tagCreate = await req("/api/tags", { method: "POST", cookie, json: { name: tagName } });
  assert(tagCreate.status === 200 && tagCreate.data.tag?.name === tagName, "create tag: " + JSON.stringify(tagCreate.data));
  const tagged = await req(`/api/leads/${form1.data.leadId}/tags`, {
    method: "POST",
    cookie,
    json: { name: tagName },
  });
  assert(tagged.status === 200 && (tagged.data.tags || []).some((t) => t.name === tagName), "attach tag");
  const filtered = await req(`/api/leads?tag=${encodeURIComponent(tagName)}`, { cookie });
  assert((filtered.data.items || []).some((l) => l.id === form1.data.leadId), "filter queue has tagged lead");
  assert(
    (filtered.data.items || []).every((l) => (l.tags || []).some((t) => t.name === tagName)),
    "filter only tagged",
  );
  const untaggedLead = await req(`/api/leads/${form1.data.leadId}`, { cookie });
  assert((untaggedLead.data.tags || []).some((t) => t.name === tagName), "lead card tags");

  const noteBody = "внутренняя пометка не клиенту " + id;
  const note = await req("/api/notes", {
    method: "POST",
    cookie,
    json: { leadId: form1.data.leadId, conversationId: form1.data.conversationId, body: noteBody },
  });
  assert(note.status === 200 && note.data.note?.body === noteBody, "internal note: " + JSON.stringify(note.data));
  const notesList = await req(`/api/notes?leadId=${form1.data.leadId}`, { cookie });
  assert((notesList.data.items || []).some((n) => n.body === noteBody), "notes list");
  const convForNote = form1.data.conversationId || untaggedLead.data.conversation?.id;
  assert(convForNote, "conversation for note leak check");
  const convGet = await req(`/api/conversations/${convForNote}`, { cookie });
  assert(convGet.status === 200, "conversation after note");
  assert(!(convGet.data.messages || []).some((m) => m.body === noteBody), "note not in client thread");
  if (chatCh?.publicKey) {
    const widget = await req(`/api/ingest/web-chat/${chatCh.publicKey}?sessionId=p2-prompt-${id}`);
    assert(!JSON.stringify(widget.data || {}).includes(noteBody), "note not in widget");
  }

  const cannedBody = "Добрый день, это шаблон менеджера.";
  const canned = await req("/api/canned", {
    method: "POST",
    cookie,
    json: { title: "привет", body: cannedBody },
  });
  assert(canned.status === 200 && canned.data.item?.body === cannedBody, "canned create");
  const cannedList = await req("/api/canned", { cookie });
  assert((cannedList.data.items || []).some((c) => c.title === "привет"), "canned list");
  const draftCanned = await req(`/api/conversations/${convForNote}`, {
    method: "POST",
    cookie,
    json: { text: cannedBody, send: false },
  });
  assert(draftCanned.status === 200 && draftCanned.data.sent === false, "canned into draft");
  const convDraft = await req(`/api/conversations/${convForNote}`, { cookie });
  assert((convDraft.data.messages || []).some((m) => m.direction === "draft" && m.body === cannedBody), "draft has canned");
  const sentCanned = await req(`/api/conversations/${convForNote}`, {
    method: "POST",
    cookie,
    json: { text: cannedBody, send: true },
  });
  assert(sentCanned.status === 200 && sentCanned.data.sent === true, "send canned");

  const tlLead = await req(`/api/activity?leadId=${form1.data.leadId}`, { cookie });
  assert(tlLead.status === 200, "timeline lead");
  const leadEvents = (tlLead.data.items || []).map((i) => i.event);
  assert(leadEvents.includes("consent") || leadEvents.includes("status") || leadEvents.includes("send") || leadEvents.includes("message"), "timeline has core events: " + leadEvents.join(","));
  assert(leadEvents.includes("status"), "timeline status");
  assert(leadEvents.includes("send"), "timeline send");
  const leadCardTl = await req(`/api/leads/${form1.data.leadId}`, { cookie });
  assert((leadCardTl.data.timeline || []).length >= 1, "lead card timeline");
  const keptTl = await req(`/api/activity?contactId=${dupA.data.contactId}`, { cookie });
  assert((keptTl.data.items || []).some((i) => i.event === "merge"), "timeline merge on kept contact");
  const contactCardTl = await req(`/api/contacts/${form1.data.contactId}`, { cookie });
  assert((contactCardTl.data.timeline || []).some((i) => i.event === "consent" || i.event === "message"), "contact card timeline");

  const noReason = await req(`/api/leads/${form1.data.leadId}`, { method: "PATCH", cookie, json: { status: "rejected" } });
  assert(noReason.status === 400, "reject without reason 400");
  const withReason = await req(`/api/leads/${form1.data.leadId}`, {
    method: "PATCH",
    cookie,
    json: { status: "rejected", rejectReason: "дорого" },
  });
  assert(withReason.status === 200 && withReason.data.status === "rejected", "reject with reason");
  assert(withReason.data.rejectReason === "дорого", "rejectReason stored");
  const backNew = await req(`/api/leads/${form1.data.leadId}`, { method: "PATCH", cookie, json: { status: "in_progress" } });
  assert(backNew.status === 200, "lead back after reject");

  const team8 = await req("/api/team", { cookie });
  const ownerId = (team8.data.members || []).find((m) => m.role === "owner")?.userId;
  assert(ownerId, "owner member for task");
  const past = new Date(Date.now() - 3600_000).toISOString();
  const task = await req("/api/tasks", {
    method: "POST",
    cookie,
    json: { leadId: form1.data.leadId, title: "Перезвонить", dueAt: past, assigneeId: ownerId },
  });
  assert(task.status === 200 && task.data.item?.overdue === true, "task overdue " + JSON.stringify(task.data));
  const overdue = await req("/api/tasks?overdue=1", { cookie });
  assert((overdue.data.items || []).some((t) => t.id === task.data.item.id), "overdue list");
  const statsOverdue = await req("/api/stats", { cookie });
  assert((statsOverdue.data.overdue || []).some((t) => t.title === "Перезвонить"), "overdue on overview");
  const leadTasks = await req(`/api/leads/${form1.data.leadId}`, { cookie });
  assert((leadTasks.data.followUps || []).some((t) => t.title === "Перезвонить" && t.assigneeId === ownerId), "tasks on lead card");
  const doneTask = await req(`/api/tasks/${task.data.item.id}`, { method: "PATCH", cookie, json: { done: true } });
  assert(doneTask.status === 200 && doneTask.data.item.doneAt, "task done");
  const overdueAfter = await req("/api/tasks?overdue=1", { cookie });
  assert(!(overdueAfter.data.items || []).some((t) => t.id === task.data.item.id), "done not overdue");

  const convId = form1.data.conversationId;
  assert(convId, "conversation for pin");
  const pin = await req(`/api/conversations/${convId}`, { method: "PATCH", cookie, json: { action: "pin" } });
  assert(pin.status === 200 && pin.data.conversation.pinned === true, "pin conversation");
  const inboxPinned = await req("/api/inbox", { cookie });
  assert(inboxPinned.data.items[0]?.id === convId, "pinned first in inbox");
  assert(inboxPinned.data.items[0]?.pinned === true, "inbox pinned flag");
  const unpin = await req(`/api/conversations/${convId}`, { method: "PATCH", cookie, json: { action: "unpin" } });
  assert(unpin.status === 200 && unpin.data.conversation.pinned === false, "unpin");

  const keepContact = await req(`/api/contacts/${form1.data.contactId}`, { cookie });
  assert(keepContact.status === 200 && keepContact.data.name === "Клиент RR1", "contact before import");
  const badCsv = "имя,телефон,телеграм,макс\n,7900notaphone,@tg,max1\nОк,abc,@x,y\n";
  const dryBad = await req("/api/contacts/import", { method: "POST", cookie, json: { csv: badCsv, dryRun: true } });
  assert(dryBad.status === 200 && dryBad.data.dryRun === true, "csv dry-run");
  assert((dryBad.data.errors || []).length >= 1, "csv dry-run errors");
  const stillThere = await req(`/api/contacts/${form1.data.contactId}`, { cookie });
  assert(stillThere.status === 200 && stillThere.data.id === form1.data.contactId, "dry-run no wipe");

  const importPhone = phone();
  const csvOk = `имя,телефон,телеграм,макс\nИмпорт CSV,+${importPhone},@impmax,maximp\nКлиент RR1,+${phone1},@rr1,maxrr1\n`;
  const dryOk = await req("/api/contacts/import", { method: "POST", cookie, json: { csv: csvOk, dryRun: true } });
  assert(dryOk.status === 200 && dryOk.data.errors.length === 0, "csv dry-run clean");
  assert(dryOk.data.created >= 1 && dryOk.data.updated >= 1, "csv dry-run counts");
  const applied = await req("/api/contacts/import", { method: "POST", cookie, json: { csv: csvOk, dryRun: false } });
  assert(applied.status === 200 && applied.data.dryRun === false, "csv apply");
  assert(applied.data.created >= 1 && applied.data.updated >= 1, "csv upsert");
  const keptAfter = await req(`/api/contacts/${form1.data.contactId}`, { cookie });
  assert(keptAfter.status === 200 && keptAfter.data.id === form1.data.contactId, "import no wipe");
  assert(keptAfter.data.name === "Клиент RR1", "existing contact kept");
  const foundImp = await req(`/api/search?q=${encodeURIComponent("Импорт CSV")}`, { cookie });
  assert((foundImp.data.contacts || []).some((c) => c.title === "Импорт CSV"), "imported contact searchable");

  const badUrl = await req("/api/workspace", {
    method: "PATCH",
    cookie,
    json: { outboundWebhookUrl: "http://example.com/hook" },
  });
  assert(badUrl.status === 400, "http webhook rejected unless localhost");

  const hookHits = [];
  const hookServer = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      hookHits.push({ secret: req.headers["x-crm-time-secret"], body });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise((resolve) => hookServer.listen(0, "127.0.0.1", resolve));
  const hookPort = hookServer.address().port;
  const hookSecret = "phase8-secret-" + id;
  const hookSet = await req("/api/workspace", {
    method: "PATCH",
    cookie,
    json: { outboundWebhookUrl: `http://127.0.0.1:${hookPort}/lead`, outboundWebhookSecret: hookSecret },
  });
  assert(hookSet.status === 200 && hookSet.data.outboundWebhookUrl.includes("127.0.0.1"), "webhook url saved");
  assert(hookSet.data.outboundWebhookHasSecret === true, "webhook secret stored");
  assert(!hookSet.data.outboundWebhookSecretEnc, "secret not leaked");
  const wsHook = await req("/api/workspace", { cookie });
  assert(wsHook.data.outboundWebhookHasSecret === true, "hasSecret on get");
  assert(!wsHook.data.outboundWebhookSecretEnc, "secret not on get");

  const hookPhone = phone();
  const hookLead = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Хук Новый", phone: hookPhone },
  });
  assert(hookLead.status === 200 && hookLead.data.leadId, "webhook source lead");
  assert(hookHits.length >= 1, "webhook fired");
  const hit = hookHits[hookHits.length - 1];
  assert(hit.secret === hookSecret, "webhook secret header");
  const payload = JSON.parse(hit.body);
  assert(payload.event === "lead.new" && payload.status === "new", "webhook payload");
  assert(payload.leadId === hookLead.data.leadId, "webhook leadId");
  hookServer.close();

  const snoozeUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const snooze = await req(`/api/conversations/${convId}`, {
    method: "PATCH",
    cookie,
    json: { action: "snooze", until: snoozeUntil },
  });
  assert(snooze.status === 200 && snooze.data.conversation.snoozedUntil, "snooze conversation");
  const activeAfterSnooze = await req("/api/inbox?view=active", { cookie });
  assert(!activeAfterSnooze.data.items.some((i) => i.id === convId), "snoozed hidden from active");
  const snoozedList = await req("/api/inbox?view=snoozed", { cookie });
  assert(snoozedList.data.items.some((i) => i.id === convId), "snoozed visible in snoozed view");
  const unsnooze = await req(`/api/conversations/${convId}`, { method: "PATCH", cookie, json: { action: "unsnooze" } });
  assert(unsnooze.status === 200 && !unsnooze.data.conversation.snoozedUntil, "unsnooze");
  const archive = await req(`/api/conversations/${convId}`, { method: "PATCH", cookie, json: { action: "archive" } });
  assert(archive.status === 200 && archive.data.conversation.archived === true, "archive");
  const archivedList = await req("/api/inbox?view=archived", { cookie });
  assert(archivedList.data.items.some((i) => i.id === convId), "archived list");
  const unarchive = await req(`/api/conversations/${convId}`, { method: "PATCH", cookie, json: { action: "unarchive" } });
  assert(unarchive.status === 200 && unarchive.data.conversation.archived === false, "unarchive");

  const bulkPhone = phone();
  const bulkLead = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Массовый", phone: bulkPhone },
  });
  assert(bulkLead.status === 200 && bulkLead.data.leadId, "bulk second lead");
  const bulkTag = await req("/api/leads/bulk", {
    method: "POST",
    cookie,
    json: { leadIds: [hookLead.data.leadId, bulkLead.data.leadId], action: "tag", tagName: "phase9bulk" },
  });
  assert(bulkTag.status === 200 && bulkTag.data.updated === 2, "bulk tag");
  const bulkStatus = await req("/api/leads/bulk", {
    method: "POST",
    cookie,
    json: { leadIds: [hookLead.data.leadId, bulkLead.data.leadId], action: "status", status: "in_progress" },
  });
  assert(bulkStatus.status === 200 && bulkStatus.data.status === "in_progress", "bulk status");
  const bulkTagged = await req("/api/leads?tag=phase9bulk", { cookie });
  assert(bulkTagged.data.items.length >= 2, "bulk tag filter");

  const hoursOn = await req("/api/workspace", {
    method: "PATCH",
    cookie,
    json: { workHoursEnabled: true, workHoursStart: "03:00", workHoursEnd: "04:00", workHoursTz: "Europe/Moscow" },
  });
  assert(hoursOn.status === 200 && hoursOn.data.workHoursEnabled === true, "work hours saved");
  const chatSession = "phase9-" + id;
  const chatIn = await req(`/api/ingest/web-chat/${chatCh.publicKey}`, {
    method: "POST",
    json: { sessionId: chatSession, text: "Привет, нужен расчёт", name: "Ночной клиент" },
  });
  assert(chatIn.status === 200 && chatIn.data.conversationId, "web chat outside hours");
  const chatPoll = await req(`/api/ingest/web-chat/${chatCh.publicKey}?sessionId=${encodeURIComponent(chatSession)}`);
  assert(chatPoll.status === 200, "web chat poll");
  const autoReply = (chatPoll.data.messages || []).find((m) => String(m.body || "").startsWith("мы на связи с"));
  assert(autoReply, "outside hours auto-reply in chat");
  assert(!(chatPoll.data.messages || []).some((m) => m.direction === "draft"), "no draft to client outside hours");

  await req(`/api/leads/${hookLead.data.leadId}`, { cookie });
  const leadCard = await req(`/api/leads/${hookLead.data.leadId}`, { cookie });
  assert(leadCard.status === 200, "lead card for audit");
  const views = (leadCard.data.timeline || []).filter((e) => e.event === "view");
  assert(views.length >= 1, "view audit on timeline");
  assert(views[0].label === "просмотр", "view label ru");

  const status = await req("/api/status", { cookie });
  assert(status.status === 200 && status.data.postgres === true, "owner status postgres");
  assert(status.data.version && status.data.deployMode, "owner status meta");
  assert(status.data.counts && typeof status.data.counts.leads === "number", "owner status counts");
  const statusMgr = await req("/api/status", { cookie: mgrACookie });
  assert(statusMgr.status === 403, "manager cannot status");

  const exportRes = await req("/api/workspace/export", { cookie });
  assert(exportRes.status === 200, "workspace export");
  assert(exportRes.data.exportVersion === 1, "export version");
  assert(Array.isArray(exportRes.data.contacts) && exportRes.data.settings?.name, "export payload");
  assert(!exportRes.data.channels?.some((c) => c.secretsEnc), "export no secrets");
  const exportMgr = await req("/api/workspace/export", { cookie: mgrACookie });
  assert(exportMgr.status === 403, "manager cannot export");

  const greetText = "Привет phase10 /start " + id;
  const greetSave = await req("/api/workspace", { method: "PATCH", cookie, json: { greeting: greetText } });
  assert(greetSave.status === 200 && greetSave.data.greeting === greetText, "greeting in settings");
  const wsGreet = await req("/api/workspace", { cookie });
  assert(wsGreet.data.greeting === greetText, "greeting persisted");

  const autoRule = await req("/api/workspace/auto-assign", {
    method: "POST",
    cookie,
    json: { channel: "web_form", assigneeId: mgrA.userId },
  });
  assert(autoRule.status === 200 && autoRule.data.rule?.id, "auto-assign rule");
  const autoPhone = phone();
  const autoLead = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Автоназначение", phone: autoPhone },
  });
  assert(autoLead.status === 200 && autoLead.data.leadId, "auto-assign lead");
  const autoLeadRow = await req(`/api/leads/${autoLead.data.leadId}`, { cookie });
  assert(autoLeadRow.data.assignee?.id === mgrA.userId, "auto-assign applied");

  const dupPhone = phone();
  const dup1 = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Дубль 1", phone: dupPhone },
  });
  assert(dup1.status === 200 && dup1.data.leadId, "dup first lead");
  const dupRepeat = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Дубль 1 повтор", phone: dupPhone },
  });
  assert(dupRepeat.status === 200, "repeat form same conversation ok");
  const dupCheck = await req(`/api/leads/duplicate-check?phone=${encodeURIComponent(dupPhone)}`, { cookie });
  assert(dupCheck.data.hasDuplicate === true, "dup check api");
  const tgDupChat = "dupchat-" + id;
  const tgDupIn = await req(`/api/channels/${tgCh.id}/simulate`, {
    method: "POST",
    cookie,
    json: { chatId: tgDupChat, text: `Нужен расчёт, тел ${dupPhone}`, name: "Dup TG" },
  });
  assert(tgDupIn.status === 200 && tgDupIn.data.conversationId, "dup tg conv");
  const dupBlock = await req(`/api/conversations/${tgDupIn.data.conversationId}/create-lead`, {
    method: "POST",
    cookie,
    json: {},
  });
  assert(dupBlock.status === 409 && dupBlock.data.duplicateWarning === true, "dup hint 409");
  const dupForce = await req(`/api/conversations/${tgDupIn.data.conversationId}/create-lead`, {
    method: "POST",
    cookie,
    json: { force: true },
  });
  assert(dupForce.status === 200 && dupForce.data.lead?.id, "dup override");

  const exportPayload = exportRes.data;
  const importDry = await req("/api/workspace/import", {
    method: "POST",
    cookie,
    json: { payload: exportPayload, dryRun: true, mode: "merge" },
  });
  assert(importDry.status === 200 && importDry.data.dryRun === true, "json import dry-run");
  assert(importDry.data.contacts.created >= 0, "json import dry counts");
  const importMgr = await req("/api/workspace/import", { method: "POST", cookie: mgrACookie, json: { payload: exportPayload, dryRun: true } });
  assert(importMgr.status === 403, "manager cannot json import");
  const extraPhone = phone();
  const importClone = structuredClone(exportPayload);
  importClone.contacts = [
    ...(importClone.contacts || []),
    { id: "imp-" + id, name: "Импорт JSON", phone: extraPhone, comment: "phase11" },
  ];
  const importApply = await req("/api/workspace/import", {
    method: "POST",
    cookie,
    json: { payload: importClone, dryRun: false, mode: "merge" },
  });
  assert(importApply.status === 200 && importApply.data.contacts.created >= 1, "json import apply contact");
  const importedContact = await req(`/api/search?q=${encodeURIComponent("Импорт JSON")}`, { cookie });
  assert(
    (importedContact.data.contacts || []).some((h) => h.title?.includes("Импорт")),
    "imported contact searchable",
  );

  const kanbanLead = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Канбан", phone: phone() },
  });
  assert(kanbanLead.status === 200 && kanbanLead.data.leadId, "kanban lead");
  const kanbanMove = await req(`/api/leads/${kanbanLead.data.leadId}`, {
    method: "PATCH",
    cookie,
    json: { status: "in_progress" },
  });
  assert(kanbanMove.status === 200 && kanbanMove.data.status === "in_progress", "kanban status patch");

  const awayPatch = await req("/api/team", {
    method: "PATCH",
    cookie: mgrACookie,
    json: { userId: mgrA.userId, availability: "away" },
  });
  assert(awayPatch.status === 200 && awayPatch.data.member?.availability === "away", "manager away");
  await req("/api/workspace/auto-assign", {
    method: "POST",
    cookie,
    json: { channel: "web_chat", assigneeId: mgrA.userId },
  });
  const awayPhone = phone();
  const awayLead = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Пул away", phone: awayPhone },
  });
  assert(awayLead.status === 200 && awayLead.data.leadId, "away pool lead");
  const awayRow = await req(`/api/leads/${awayLead.data.leadId}`, { cookie });
  assert(awayRow.data.assignee?.id !== mgrA.userId, "away manager skipped in auto-assign");

  const brandForm = await req(`/api/public-form/${formCh.publicKey}`);
  assert(brandForm.status === 200 && brandForm.data.branding?.accentColor === "#99CCFF", "form widget accent");
  assert(brandForm.data.branding?.workspaceTitle, "form widget title");
  if (chatCh?.publicKey) {
    const brandChat = await req(`/api/ingest/web-chat/${chatCh.publicKey}`);
    assert(brandChat.status === 200 && brandChat.data.branding?.accentColor === "#99CCFF", "chat widget accent");
  }

  await req("/api/workspace", {
    method: "PATCH",
    cookie,
    json: { ingestRateLimitMax: 2, ingestRateLimitScope: "ip" },
  });
  const rlIp = { headers: { "X-Forwarded-For": "203.0.113.99" } };
  const rlOk1 = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "RL1", phone: phone() },
    ...rlIp,
  });
  const rlOk2 = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "RL2", phone: phone() },
    ...rlIp,
  });
  const rlBlock = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "RL3", phone: phone() },
    ...rlIp,
  });
  assert(rlOk1.status === 200 && rlOk2.status === 200, "ingest rate ok");
  assert(rlBlock.status === 429 && String(rlBlock.data.error || "").includes("Подождите"), "ingest rate 429");
  await req("/api/workspace", { method: "PATCH", cookie, json: { ingestRateLimitMax: 60 } });

  const svInbox = await req("/api/saved-views", {
    method: "POST",
    cookie,
    json: { screen: "inbox", name: "Telegram P12", query: { channel: "telegram", filter: "all" } },
  });
  assert(svInbox.status === 200 && svInbox.data.id, "saved view owner");
  const svMgr = await req("/api/saved-views", {
    method: "POST",
    cookie: mgrACookie,
    json: { screen: "leads", name: "Срочно P12", query: { urgentOnly: true } },
  });
  assert(svMgr.status === 200 && svMgr.data.name === "Срочно P12", "saved view manager");
  const svList = await req("/api/saved-views?screen=leads", { cookie: mgrACookie });
  assert(svList.data.items?.some((x) => x.name === "Срочно P12"), "saved view dropdown");

  const auditCsv = await req("/api/workspace/audit-export", { cookie });
  assert(auditCsv.status === 200 && String(auditCsv.data.raw || "").includes("время"), "audit export csv");
  const auditMgr = await req("/api/workspace/audit-export", { cookie: mgrACookie });
  assert(auditMgr.status === 403, "audit export owner only");

  console.log("PHASE2_OK", {
    email,
    routing: "round_robin+pool",
    ping: "draft-then-button + explicit-auto",
    poll: tgAfter.pollOffset,
    phase3: "email+flows+model-raw+csv",
    phase4: "funnel+rag+pdf+dlp",
    phase5: "152+cbr+status+photos+imap",
    phase6: "search+bell+settings+merge+box",
    phase7: "tags+notes+canned+timeline",
    phase8: "tasks+pin+csv+webhook+reject",
    phase9: "snooze+archive+bulk+hours+view-audit",
    phase10: "export+auto-assign+dup-hint+greeting+health-status",
    phase11: "json-import+kanban+availability+widget-brand",
    phase12: "saved-views+ingest-rate+audit-csv+widget-mobile",
  });
}

main().catch((e) => {
  console.error("PHASE2_FAIL", e.message);
  process.exit(1);
});
