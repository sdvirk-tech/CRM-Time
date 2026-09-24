#!/usr/bin/env node
/**
 * Приёмка фазы 2: промт в UI, пинг после SLA, маршрутизация, опрос Telegram.
 * Сервер на BASE_URL (по умолчанию http://localhost:3000).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
void ROOT;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.json) headers["Content-Type"] = "application/json";
  if (opts.cookie) headers.Cookie = opts.cookie;
  const res = await fetch(BASE + path, {
    method: opts.method || "GET",
    headers,
    body: opts.json ? JSON.stringify(opts.json) : opts.body,
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

  console.log("PHASE2_OK", {
    email,
    routing: "round_robin+pool",
    ping: "draft-then-button + explicit-auto",
    poll: tgAfter.pollOffset,
  });
}

main().catch((e) => {
  console.error("PHASE2_FAIL", e.message);
  process.exit(1);
});
