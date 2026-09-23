#!/usr/bin/env node
/**
 * Приёмка фазы 1 по API (критерии ТЗ MVP).
 * Требует запущенный сервер на BASE_URL (по умолчанию http://localhost:3000).
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";

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

async function main() {
  const id = stamp();
  const email = `owner-${id}@example.com`;
  const phoneA = "7999111" + String(Math.floor(1000 + Math.random() * 8999));
  const phoneB = "7999222" + String(Math.floor(1000 + Math.random() * 8999));
  const phoneC = "7999333" + String(Math.floor(1000 + Math.random() * 8999));

  let r = await req("/api/auth/register", {
    method: "POST",
    json: { name: "Дмитрий", email, password: "secret12" },
  });
  assert(r.status === 200, "register: " + JSON.stringify(r.data));
  let cookie = r.cookie;
  assert(cookie, "session cookie");

  r = await req("/api/onboarding", {
    method: "POST",
    cookie,
    json: {
      name: "Пилот ВЭД",
      tradeDescription: "контейнеры и FCA",
      vedTemplate: true,
      defaultModel: "mock:ok",
    },
  });
  assert(r.status === 200, "onboarding: " + JSON.stringify(r.data));
  if (r.cookie) cookie = r.cookie;

  async function add(kind) {
    const x = await req("/api/flow/blocks", { method: "POST", cookie, json: { kind } });
    assert(x.status === 200, "add " + kind + " " + JSON.stringify(x.data));
    return x.data.block;
  }

  const formBlock = await add("channel_web_form");
  const parseBlock = await add("ai_parse");
  await add("action_create_lead");
  const tgBlock = await add("channel_telegram");
  const draftBlock = await add("ai_draft");

  const flow = await req("/api/flow", { cookie });
  assert(flow.status === 200, "flow");
  const formCh = flow.data.channels.find((c) => c.type === "web_form");
  const tgCh = flow.data.channels.find((c) => c.type === "telegram");
  const parseProc = flow.data.processes.find((p) => p.type === "parse_inbound");
  const draftProc = flow.data.processes.find((p) => p.type === "draft_reply");
  assert(formCh && tgCh && parseProc && draftProc, "slots created");
  assert(String(formCh.snippet).includes("#F2F2F2"), "widget paper #F2F2F2");
  assert(String(formCh.snippet).includes("#99CCFF"), "widget accent #99CCFF");
  assert(String(formCh.snippet).includes("#C5E2FF"), "widget mist #C5E2FF");
  assert(String(formCh.snippet).includes("color:#1a1a1a"), "widget dark text");

  r = await req(`/api/flow/blocks/${parseBlock.id}`, {
    method: "PATCH",
    cookie,
    json: { provider: "mock", model: "ok" },
  });
  assert(r.status === 200, "explicit parse model");
  r = await req(`/api/flow/blocks/${draftBlock.id}`, {
    method: "PATCH",
    cookie,
    json: { provider: "mock", model: "ok" },
  });
  assert(r.status === 200, "explicit draft model (other process)");

  const previewFlow = await req("/api/flow", { cookie });
  const parseBound = previewFlow.data.processes.find((p) => p.type === "parse_inbound").binding;
  const draftBound = previewFlow.data.processes.find((p) => p.type === "draft_reply").binding;
  assert(parseBound.model === "ok" && draftBound.model === "ok", "two explicit models");

  r = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: {
      name: "Клиент А",
      phone: phoneA,
      comment: "нужен контейнер FCA",
      tnved: "0101210000",
      incoterms: "FCA",
    },
  });
  assert(r.status === 200 && r.data.leadId, "valid form creates lead: " + JSON.stringify(r.data));
  assert(r.data.urgent === false, "explicit model is not auto-urgent");
  const leadA = r.data.leadId;
  const contactA = r.data.contactId;

  r = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: {
      name: "Клиент А повтор",
      phone: phoneA,
      comment: "ещё раз",
      tnved: "0101210000",
    },
  });
  assert(r.status === 200, "second form");
  assert(r.data.contactId === contactA, "same phone does not duplicate contact");

  const leads1 = await req("/api/leads", { cookie });
  const beforeInvalid = leads1.data.items.length;

  r = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Брак", phone: "79990001122", comment: "bad", tnved: "7700000000" },
  });
  assert(r.status === 400, "invalid tnved rejected");
  const leads2 = await req("/api/leads", { cookie });
  assert(leads2.data.items.length === beforeInvalid, "invalid tnved does not create lead");

  r = await req(`/api/flow/blocks/${parseBlock.id}`, {
    method: "PATCH",
    cookie,
    json: { provider: "", model: "" },
  });
  assert(r.status === 200, "clear model");

  r = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: {
      name: "Клиент дефолт",
      phone: phoneB,
      comment: "без явной модели",
      tnved: "0201100001",
    },
  });
  assert(r.status === 200 && r.data.leadId, "default model still creates lead");
  assert(r.data.urgent === true, "default model is urgent immediately");
  const leadDefault = await req(`/api/leads/${r.data.leadId}`, { cookie });
  assert(leadDefault.data.urgent === true, "lead urgent badge");
  assert(leadDefault.data.assigneeId, "assignee set on default-model path");
  const convDefault = await req(`/api/conversations/${r.data.conversationId}`, { cookie });
  assert(convDefault.data.urgent === true, "inbox urgent");

  r = await req(`/api/flow/blocks/${parseBlock.id}`, {
    method: "PATCH",
    cookie,
    json: { provider: "mock", model: "fail" },
  });
  assert(r.status === 200, "fail model");
  r = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: {
      name: "Клиент сбой",
      phone: phoneC,
      comment: "сломать parse",
      tnved: "0301110000",
    },
  });
  assert(r.status === 200 && r.data.leadId, "AI fail still creates lead");
  const convFail = await req(`/api/conversations/${r.data.conversationId}`, { cookie });
  assert(convFail.data.aiError, "ai error on inbox");
  const leadFail = await req(`/api/leads/${r.data.leadId}`, { cookie });
  assert(leadFail.data.id, "lead survived AI fail");
  assert(leadFail.data.urgent === true, "explicit model fail is urgent");

  r = await req(`/api/channels/${tgCh.id}/simulate`, {
    method: "POST",
    cookie,
    json: { chatId: "tg-" + id, text: "нужен контейнер / FCA", username: "clientb", name: "Клиент Б" },
  });
  assert(r.status === 200, "telegram simulate " + JSON.stringify(r.data));
  const inbox = await req("/api/inbox", { cookie });
  const tgItem = inbox.data.items.find((i) => i.channel.type === "telegram");
  assert(tgItem, "telegram in inbox");
  const convTg = await req(`/api/conversations/${tgItem.id}`, { cookie });
  const draft = convTg.data.messages.find((m) => m.direction === "draft");
  assert(draft, "draft exists and is not sent");
  assert(!convTg.data.messages.some((m) => m.direction === "outbound"), "draft not auto-sent");
  assert(!String(draft.body).includes("<think>"), "think tags stripped from draft");
  assert(String(draft.body).includes("По методике"), "knowledge stuffed into draft prompt");

  r = await req("/api/knowledge", { cookie });
  assert(r.status === 200 && (r.data.articles || []).length >= 1, "ved knowledge seeded");
  r = await req("/api/knowledge", {
    method: "POST",
    cookie,
    json: { title: "FCA", body: "FCA — покупатель забирает у продавца, дальше его риск." },
  });
  assert(r.status === 200 && r.data.article.id, "add knowledge article");

  const leadsBeforeStart = (await req("/api/leads", { cookie })).data.items.length;
  r = await req(`/api/channels/${tgCh.id}/simulate`, {
    method: "POST",
    cookie,
    json: { chatId: "tg-start-" + id, text: "/start", name: "Старт" },
  });
  assert(r.status === 200 && r.data.start === true, "telegram /start " + JSON.stringify(r.data));
  assert(!r.data.leadId, "/start does not create lead");
  const leadsAfterStart = (await req("/api/leads", { cookie })).data.items.length;
  assert(leadsAfterStart === leadsBeforeStart, "/start does not add a lead");
  const convStart = await req(`/api/conversations/${r.data.conversationId}`, { cookie });
  assert(
    convStart.data.messages.some((m) => m.direction === "system" && /сброшена/i.test(m.body)),
    "session reset system message",
  );
  assert(
    convStart.data.messages.some((m) => m.direction === "outbound" && /Здравствуйте/i.test(m.body)),
    "greeting on /start",
  );

  r = await req(`/api/channels/${tgCh.id}/simulate`, {
    method: "POST",
    cookie,
    json: { chatId: "tg-hand-" + id, text: "хочу менеджера", name: "Ханд" },
  });
  assert(r.status === 200 && r.data.urgent === true, "handoff is urgent");
  assert(r.data.leadId, "handoff creates lead");
  const convHand = await req(`/api/conversations/${r.data.conversationId}`, { cookie });
  assert(convHand.data.urgentReason === "handoff", "handoff reason");

  r = await req(`/api/ingest/telegram/${tgCh.publicKey}`, {
    method: "POST",
    json: {
      update_id: 91001,
      message: { chat: { id: 77001 }, from: { first_name: "Дуп" }, text: "один раз" },
    },
  });
  assert(r.status === 200, "telegram webhook first");
  r = await req(`/api/ingest/telegram/${tgCh.publicKey}`, {
    method: "POST",
    json: {
      update_id: 91001,
      message: { chat: { id: 77001 }, from: { first_name: "Дуп" }, text: "один раз" },
    },
  });
  assert(r.status === 200 && r.data.duplicate === true, "telegram update_id dedup");
  const inboxDup = await req("/api/inbox", { cookie });
  const dupItem = inboxDup.data.items.find((i) => i.contact.name === "Дуп");
  assert(dupItem, "dedup conversation in inbox");
  const convDup = await req(`/api/conversations/${dupItem.id}`, { cookie });
  const inboundDup = convDup.data.messages.filter((m) => m.direction === "inbound");
  assert(inboundDup.length === 1, "duplicate webhook does not add a second inbound");

  r = await req(`/api/conversations/${tgItem.id}/create-lead`, { method: "POST", cookie });
  assert(r.status === 200 && r.data.lead, "telegram create lead button");

  r = await req(`/api/leads/${leadA}/claim`, { method: "POST", cookie });
  assert(r.status === 200, "claim lead");
  assert(r.data.lead.status === "in_progress", "claim sets in_progress");

  r = await req("/api/team", { method: "POST", cookie, json: {} });
  assert(r.status === 200 && r.data.invite.token, "invite");
  const token = r.data.invite.token;
  const mgrEmail = `mgr-${id}@example.com`;
  r = await req(`/api/invite/${token}`, {
    method: "POST",
    json: { name: "Менеджер", email: mgrEmail, password: "secret12" },
  });
  assert(r.status === 200, "accept invite " + JSON.stringify(r.data));
  const mgrCookie = r.cookie;
  r = await req("/api/flow/blocks", { method: "POST", cookie: mgrCookie, json: { kind: "ai_parse" } });
  assert(r.status === 403, "manager cannot edit flow");
  r = await req("/api/knowledge", { method: "POST", cookie: mgrCookie, json: { title: "x", body: "yy" } });
  assert(r.status === 403, "manager cannot edit knowledge");
  r = await req("/api/knowledge", { cookie: mgrCookie });
  assert(r.status === 200, "manager can read knowledge");
  r = await req("/api/inbox", { cookie: mgrCookie });
  assert(r.status === 200, "manager inbox");
  r = await req("/api/leads", { cookie: mgrCookie });
  assert(r.status === 200 && r.data.items.length > 0, "manager sees leads");

  const phoneChat = "tg-phone-" + id;
  r = await req(`/api/channels/${tgCh.id}/simulate`, {
    method: "POST",
    cookie,
    json: { chatId: phoneChat, text: "перезвоните 79994445566, нужен FCA", name: "Телефон" },
  });
  assert(r.status === 200, "phone extract ingest");
  const inboxPhone = await req("/api/inbox", { cookie });
  const phoneItem = inboxPhone.data.items.find((i) => i.contact.name === "Телефон");
  assert(phoneItem, "phone conversation");
  assert(phoneItem.contact.phone === "79994445566", "phone extracted from telegram text");

  const convPhone = await req(`/api/conversations/${phoneItem.id}`, { cookie });
  const draftsBeforeTake = (convPhone.data.messages || []).filter((m) => m.direction === "draft").length;
  r = await req(`/api/conversations/${phoneItem.id}`, { method: "PATCH", cookie, json: { action: "take" } });
  assert(r.status === 200 && r.data.conversation.status === "manager", "take conversation");
  r = await req(`/api/channels/${tgCh.id}/simulate`, {
    method: "POST",
    cookie,
    json: { chatId: phoneChat, text: "ещё одно сообщение после взять", name: "Телефон" },
  });
  assert(r.status === 200, "inbound after take");
  const convTaken = await req(`/api/conversations/${phoneItem.id}`, { cookie });
  const draftsAfterTake = (convTaken.data.messages || []).filter((m) => m.direction === "draft").length;
  assert(draftsAfterTake === draftsBeforeTake, "no new AI draft after take");

  r = await req(`/api/conversations/${phoneItem.id}`, { method: "PATCH", cookie, json: { action: "close" } });
  assert(r.status === 200 && r.data.conversation.status === "closed", "close conversation");
  r = await req(`/api/conversations/${phoneItem.id}`, { method: "PATCH", cookie, json: { action: "reset" } });
  assert(r.status === 200 && r.data.conversation.status === "ai" && r.data.reset === true, "reset conversation");

  const arts = await req("/api/knowledge", { cookie });
  const allArts = arts.data.articles || [];
  assert(allArts.length >= 1, "seed article");
  for (const a of allArts) {
    r = await req(`/api/knowledge/${a.id}`, { method: "PATCH", cookie, json: { enabled: false } });
    assert(r.status === 200 && r.data.article.enabled === false, "disable knowledge");
  }
  r = await req(`/api/channels/${tgCh.id}/simulate`, {
    method: "POST",
    cookie,
    json: { chatId: "tg-noknow-" + id, text: "просто привет без методики", name: "БезЗнаний" },
  });
  assert(r.status === 200, "simulate without knowledge");
  const inboxNk = await req("/api/inbox", { cookie });
  const nk = inboxNk.data.items.find((i) => i.contact.name === "БезЗнаний");
  assert(nk, "conversation without knowledge");
  const convNk = await req(`/api/conversations/${nk.id}`, { cookie });
  const nkDraft = [...convNk.data.messages].reverse().find((m) => m.direction === "draft");
  assert(nkDraft && !String(nkDraft.body).includes("По методике"), "disabled article is not stuffed");
  for (const a of allArts) {
    r = await req(`/api/knowledge/${a.id}`, { method: "PATCH", cookie, json: { enabled: true } });
    assert(r.status === 200 && r.data.article.enabled === true, "re-enable knowledge");
  }

  r = await req(`/api/flow/blocks/${formBlock.id}`, { method: "PATCH", cookie, json: { enabled: false } });
  assert(r.status === 200, "disable web form channel");
  r = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Выкл", phone: "79990001122", tnved: "0101210000" },
  });
  assert(r.status === 403, "disabled channel rejects ingest");
  r = await req(`/api/flow/blocks/${formBlock.id}`, { method: "PATCH", cookie, json: { enabled: true } });
  assert(r.status === 200, "re-enable channel");

  r = await req("/api/models", { method: "POST", cookie, json: { provider: "mock", model: "ok" } });
  assert(r.status === 200 && r.data.ok === true, "model ping ok");
  r = await req("/api/auth/password", { method: "POST", cookie, json: { current: "secret12", next: "secret12" } });
  assert(r.status === 200 && r.data.ok === true, "change password");

  const deep = await req("/api/models", { cookie });
  assert(deep.data.deepAnalysisEnabled === false || typeof deep.data.deepAnalysisEnabled === "boolean", "deep flag");

  console.log("PHASE1_OK", {
    email,
    formKey: formCh.publicKey,
    leads: (await req("/api/leads", { cookie })).data.items.length,
  });
}

main().catch((e) => {
  console.error("PHASE1_FAIL", e.message);
  process.exit(1);
});
