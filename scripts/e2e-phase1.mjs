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

function extraPublicRegisterAllowed(mode, userCount) {
  return mode !== "box" || userCount === 0;
}

async function main() {
  assert(extraPublicRegisterAllowed("box", 0) === true, "box first owner");
  assert(extraPublicRegisterAllowed("box", 1) === false, "box extra register closed");
  assert(extraPublicRegisterAllowed("saas", 9) === true, "saas stays open");

  const health = await req("/api/health");
  assert(health.status === 200 && health.data.ok === true, "health");
  assert(health.data.deployMode === "saas" || health.data.deployMode === "box", "deployMode flag");
  assert(typeof health.data.publicRegistration === "boolean", "publicRegistration flag");
  assert(health.data.boxSingleWorkspace === (health.data.deployMode === "box"), "boxSingleWorkspace");
  if (health.data.deployMode === "box") {
    const blocked = await req("/api/auth/register", {
      method: "POST",
      json: { name: "Лишний", email: `box-${stamp()}@example.com`, password: "secret12" },
    });
    assert(blocked.status === 403, "box blocks extra register");
  }

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

  const empty = await req("/api/flow", { cookie });
  assert(empty.status === 200, "flow after onboard");
  assert((empty.data.blocks || []).length === 0, "empty canvas after onboard");
  assert(empty.data.preview === "положите канал", "empty preview " + empty.data.preview);
  assert(empty.data.compact === "положите канал", "empty compact");
  assert(/ТН ВЭД/.test(empty.data.greeting || ""), "sales greeting seeded");

  const vedFields = await req("/api/fields", { cookie });
  assert(vedFields.status === 200, "fields");
  const fieldKeys = (vedFields.data.fields || []).map((f) => f.key);
  for (const key of ["telegram", "max", "cargo", "weight", "volume", "origin", "destination", "route", "eta"]) {
    assert(fieldKeys.includes(key), "cargo field " + key);
  }
  assert((vedFields.data.fields || []).some((f) => f.key === "route" && f.fieldType === "route"), "route field type");
  const knowledge0 = await req("/api/knowledge", { cookie });
  assert((knowledge0.data.topics || []).some((t) => t.name === "ВЭД"), "ВЭД topic seeded");
  assert(
    (knowledge0.data.articles || []).some((a) => /ТН ВЭД|курс ЦБ|МАКС/i.test(a.body) || /ТН ВЭД|курс ЦБ|МАКС/i.test(a.title)),
    "baza-znaniy seeded",
  );

  async function add(kind) {
    const x = await req("/api/flow/blocks", { method: "POST", cookie, json: { kind } });
    assert(x.status === 200, "add " + kind + " " + JSON.stringify(x.data));
    return x.data.block;
  }

  const formBlock = await add("channel_web_form");
  const parseBlock = await add("ai_parse");
  await add("action_create_lead");
  const assembled = await req("/api/flow", { cookie });
  assert(
    assembled.data.compact === "форма → разобрать (срочно человек) → создать лид",
    "preview форма → разобрать → создать лид: " + assembled.data.compact,
  );

  const tgBlock = await add("channel_telegram");
  const draftBlock = await add("ai_draft");

  const flow = await req("/api/flow", { cookie });
  assert(flow.status === 200, "flow");
  const formCh = flow.data.channels.find((c) => c.type === "web_form");
  const tgCh = flow.data.channels.find((c) => c.type === "telegram");
  const parseProc = flow.data.processes.find((p) => p.type === "parse_inbound");
  const draftProc = flow.data.processes.find((p) => p.type === "draft_reply");
  assert(formCh && tgCh && parseProc && draftProc, "slots created");
  assert(/Ты МАКС/.test(String(draftProc.prompt || "")), "sales prompt on draft");
  assert(/ROLE=parse_cargo_json/.test(String(parseProc.prompt || "")), "parse cargo prompt");
  assert(String(formCh.snippet).includes("#F2F2F2"), "widget paper #F2F2F2");
  assert(String(formCh.snippet).includes("#99CCFF"), "widget accent #99CCFF");
  assert(String(formCh.snippet).includes("#C5E2FF"), "widget mist #C5E2FF");
  assert(String(formCh.snippet).includes("color:#1a1a1a"), "widget dark text");
  assert(String(formCh.snippet).includes("Написать в чат"), "short form chat link");
  assert(!/tnved|Incoterms|контейнер/i.test(String(formCh.snippet)), "snippet is not VED form");
  assert(
    (flow.data.models || []).some((m) => m.provider === "mock" && m.model === "ok-b"),
    "mock:ok-b listed",
  );

  r = await req(`/api/flow/blocks/${parseBlock.id}`, {
    method: "PATCH",
    cookie,
    json: { provider: "mock", model: "ok" },
  });
  assert(r.status === 200, "explicit parse model");
  r = await req(`/api/flow/blocks/${draftBlock.id}`, {
    method: "PATCH",
    cookie,
    json: { provider: "mock", model: "ok-b" },
  });
  assert(r.status === 200, "explicit draft model B");

  const previewFlow = await req("/api/flow", { cookie });
  const parseBound = previewFlow.data.processes.find((p) => p.type === "parse_inbound").binding;
  const draftBound = previewFlow.data.processes.find((p) => p.type === "draft_reply").binding;
  assert(parseBound.model === "ok" && draftBound.model === "ok-b", "two different explicit models");
  assert(String(previewFlow.data.compact).includes("разобрать (mock:ok)"), "compact parse model");
  assert(String(previewFlow.data.compact).includes("черновик (mock:ok-b)"), "compact draft model");

  r = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: {
      name: "Клиент А",
      phone: phoneA,
      comment: "перезвоните, продолжим в чате",
    },
  });
  assert(r.status === 200 && r.data.leadId, "valid form creates lead: " + JSON.stringify(r.data));
  assert(r.data.urgent === false, "explicit model is not auto-urgent");
  const leadA = r.data.leadId;
  const contactA = r.data.contactId;

  const contactCard = await req(`/api/contacts/${contactA}`, { cookie });
  assert(contactCard.status === 200 && contactCard.data.id === contactA, "contact card");
  assert((contactCard.data.channels || []).length >= 1, "contact channels");
  assert((contactCard.data.leads || []).some((l) => l.id === leadA), "contact leads");
  assert(contactCard.data.name === "Клиент А", "short form stores name");
  assert(contactCard.data.phone === phoneA, "short form stores phone");
  r = await req(`/api/contacts/${contactA}`, { method: "PATCH", cookie, json: { phone: "abc" } });
  assert(r.status === 400, "contact invalid phone");

  const formHtml = await req(`/f/${formCh.publicKey}`);
  assert(formHtml.status === 200, "public form page");
  const formRaw = formHtml.data?.raw || JSON.stringify(formHtml.data);
  assert(/Имя и телефон/.test(formRaw), "short form title");
  assert(/Написать в чат/.test(formRaw), "short form chat CTA");
  assert(!/Оставить заявку/.test(formRaw), "rejected long VED form title");
  assert(!/name="tnved"/.test(formRaw), "no tnved input");
  assert(!/name="incoterms"/.test(formRaw), "no incoterms input");

  r = await req(`/api/channels/${formCh.id}/test`, { method: "POST", cookie, json: {} });
  assert(r.status === 200 && r.data.ok === true && r.data.leadId, "canvas form test " + JSON.stringify(r.data));

  r = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: {
      name: "Клиент А повтор",
      phone: phoneA,
      comment: "ещё раз",
    },
  });
  assert(r.status === 200, "second form");
  assert(r.data.contactId === contactA, "same phone does not duplicate contact");

  const leads1 = await req("/api/leads", { cookie });
  const beforeInvalid = leads1.data.items.length;

  r = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: { name: "Брак тел", phone: "12", comment: "bad" },
  });
  assert(r.status === 400, "invalid phone rejected");
  const leads2 = await req("/api/leads", { cookie });
  assert(leads2.data.items.length === beforeInvalid, "invalid phone does not create lead");

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
  assert(!r.data.leadId, "incomplete telegram does not create lead");
  const tgContactId = r.data.contactId;
  assert(tgContactId, "telegram contact");
  r = await req(`/api/channels/${tgCh.id}/simulate`, {
    method: "POST",
    cookie,
    json: { chatId: "tg-" + id, text: "ещё раз тот же чат", username: "clientb", name: "Клиент Б" },
  });
  assert(r.status === 200 && r.data.contactId === tgContactId, "same telegram chatId merges contact");
  const inbox = await req("/api/inbox", { cookie });
  const tgItem = inbox.data.items.find((i) => i.channel.type === "telegram");
  assert(tgItem, "telegram in inbox");
  const convTg = await req(`/api/conversations/${tgItem.id}`, { cookie });
  const draft = convTg.data.messages.find((m) => m.direction === "draft");
  assert(draft, "draft exists");
  assert(
    (convTg.data.messages || []).some((m) => m.direction === "outbound"),
    "explicit telegram bot replies in-channel",
  );
  const tgOut = [...convTg.data.messages].reverse().find((m) => m.direction === "outbound");
  assert(tgOut && !String(tgOut.body).includes("<think>"), "think tags stripped from telegram reply");
  assert(!/"ready"\s*:/.test(String(tgOut.body)), "telegram client does not see parse JSON");
  assert(String(draft.body).includes("По методике"), "knowledge stuffed into draft prompt");
  assert(String(draft.body).includes("модель B"), "draft uses other explicit model");
  assert(!/"ready"\s*:/.test(String(draft.body)), "draft is sales text not cargo JSON");

  r = await req(`/api/conversations/${tgItem.id}`, {
    method: "POST",
    cookie,
    json: { text: "Ответ из CRM в Telegram", send: true },
  });
  assert(r.status === 200 && r.data.sent === true, "CRM send outbound");
  const convSent = await req(`/api/conversations/${tgItem.id}`, { cookie });
  assert(
    (convSent.data.messages || []).some((m) => m.direction === "outbound" && String(m.body).includes("Ответ из CRM")),
    "outbound persisted for Telegram",
  );

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
  const mgrFlow = await req("/api/flow", { cookie: mgrCookie });
  assert(mgrFlow.status === 200, "manager can read flow");
  const mgrChans = mgrFlow.data.channels || [];
  assert(mgrChans.length > 0, "manager sees channel names");
  for (const ch of mgrChans) {
    assert(!ch.publicKey && !ch.snippet && !ch.webhookUrl && !ch.formUrl && !ch.chatUrl, "manager no channel secrets " + ch.type);
    assert(!ch.tokenPreview, "manager no token preview");
  }

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
    json: { name: "Выкл", phone: "79990001122" },
  });
  assert(r.status === 403, "disabled channel rejects ingest");
  r = await req(`/api/flow/blocks/${formBlock.id}`, { method: "PATCH", cookie, json: { enabled: true } });
  assert(r.status === 200, "re-enable channel");

  r = await req("/api/models", { method: "POST", cookie, json: { provider: "mock", model: "ok" } });
  assert(r.status === 200 && r.data.ok === true, "model ping ok");
  r = await req("/api/auth/password", { method: "POST", cookie, json: { current: "secret12", next: "secret12" } });
  assert(r.status === 200 && r.data.ok === true, "change password");

  const chatBlock = await add("channel_web_chat");
  const flowChat = await req("/api/flow", { cookie });
  const chatCh = flowChat.data.channels.find((c) => c.type === "web_chat");
  assert(chatCh, "web chat channel");
  assert(String(chatCh.snippet).includes("#F2F2F2"), "chat snippet paper");
  assert(String(chatCh.snippet).includes("#99CCFF"), "chat snippet accent");
  assert(String(chatCh.chatUrl).includes("/c/"), "chat url");
  const chatHtml = await req(`/c/${chatCh.publicKey}`);
  assert(chatHtml.status === 200, "public chat page");
  const chatRaw = chatHtml.data?.raw || JSON.stringify(chatHtml.data);
  assert(/Чат/.test(chatRaw), "public chat title");

  r = await req(`/api/flow/blocks/${draftBlock.id}`, {
    method: "PATCH",
    cookie,
    json: { provider: "", model: "" },
  });
  assert(r.status === 200, "clear draft model");
  r = await req(`/api/ingest/web-chat/${chatCh.publicKey}`, {
    method: "POST",
    json: { sessionId: "chat-default-" + id, name: "Гость дефолт", text: "нужен контейнер без явной модели" },
  });
  assert(r.status === 200 && r.data.conversationId, "web chat default ingest");
  assert(r.data.urgent === true, "chat default model is urgent");
  const chatDefPoll = await req(`/api/ingest/web-chat/${chatCh.publicKey}?sessionId=chat-default-${id}`);
  assert(chatDefPoll.status === 200, "web chat default poll");
  assert(
    !(chatDefPoll.data.messages || []).some((m) => m.direction === "outbound"),
    "default model does not auto-reply in chat",
  );
  r = await req(`/api/channels/${tgCh.id}/simulate`, {
    method: "POST",
    cookie,
    json: { chatId: "tg-default-" + id, text: "привет без явной модели", name: "ТГ дефолт" },
  });
  assert(r.status === 200, "telegram default ingest");
  assert(r.data.urgent === true, "telegram default model is urgent");
  const convTgDef = await req(`/api/conversations/${r.data.conversationId}`, { cookie });
  assert(
    !(convTgDef.data.messages || []).some((m) => m.direction === "outbound"),
    "default/empty model does not auto-send telegram",
  );
  r = await req(`/api/flow/blocks/${draftBlock.id}`, {
    method: "PATCH",
    cookie,
    json: { provider: "mock", model: "ok-b" },
  });
  assert(r.status === 200, "restore explicit draft B");

  r = await req(`/api/ingest/web-chat/${chatCh.publicKey}`, {
    method: "POST",
    json: { sessionId: "chat-" + id, name: "Гость", text: "нужен контейнер FCA" },
  });
  assert(r.status === 200 && r.data.conversationId, "web chat ingest " + JSON.stringify(r.data));
  const chatConvId = r.data.conversationId;
  const chatPoll = await req(`/api/ingest/web-chat/${chatCh.publicKey}?sessionId=chat-${id}`);
  assert(chatPoll.status === 200, "web chat poll");
  assert(
    (chatPoll.data.messages || []).some((m) => m.direction === "outbound"),
    "explicit model publishes chat reply",
  );
  assert(
    !(chatPoll.data.messages || []).some((m) => /"ready"\s*:/.test(String(m.body))),
    "chat client does not see parse JSON",
  );
  if (r.data.leadId) {
    const chatLead = await req(`/api/leads/${r.data.leadId}`, { cookie });
    assert(chatLead.data.source === "web_chat", "web_chat lead source");
  }

  const deepAdd = await add("ai_deep");
  assert(deepAdd.type === "ai_process", "deep slot added");
  const afterDeep = await req("/api/flow", { cookie });
  assert(
    (afterDeep.data.processes || []).some((p) => p.type === "deep_analysis"),
    "deep_analysis visible",
  );
  assert(typeof afterDeep.data.deepAnalysisEnabled === "boolean", "deep flag");
  r = await req(`/api/flow/blocks/${parseBlock.id}`, {
    method: "PATCH",
    cookie,
    json: { provider: "mock", model: "ok" },
  });
  assert(r.status === 200, "restore parse after fail");
  const phoneDeep = "7999555" + String(Math.floor(1000 + Math.random() * 8999));
  r = await req(`/api/ingest/web-form/${formCh.publicKey}`, {
    method: "POST",
    json: {
      name: "После deep",
      phone: phoneDeep,
      comment: "цепочка жива",
    },
  });
  assert(r.status === 200 && r.data.leadId, "chain works with deep slot present");
  assert(r.data.urgent === false, "deep slot without key does not auto-urgent");

  const missSid = "chat-miss-" + id;
  r = await req(`/api/ingest/web-chat/${chatCh.publicKey}`, {
    method: "POST",
    json: {
      sessionId: missSid,
      name: "Анна",
      text: "Груз: модули памяти ЭВМ, ссылка https://example.com/mod",
    },
  });
  assert(r.status === 200, "partial chat ingest " + JSON.stringify(r.data));
  assert(!r.data.leadId, "incomplete card does not create lead");
  assert(r.data.cardComplete === false, "cardComplete false");
  assert((r.data.missing || []).length > 0, "missing slots listed");
  const missPoll = await req(`/api/ingest/web-chat/${chatCh.publicKey}?sessionId=${missSid}`);
  const missOut = [...(missPoll.data.messages || [])].reverse().find((m) => m.direction === "outbound");
  assert(missOut, "bot asks remaining field");
  assert(
    /телефон|вес|объём|объем|Max|макс|телеграм|отправк|прибыт|маршрут|срок|фото|инвойс|штук|имя/i.test(missOut.body),
    "follow-up asks a card field: " + missOut.body,
  );
  assert(!/"ready"\s*:/.test(String(missOut.body)), "follow-up is not JSON");
  r = await req(`/api/ingest/web-chat/${chatCh.publicKey}`, {
    method: "POST",
    json: {
      sessionId: missSid,
      name: "Анна",
      text: "Вес 12 кг, объём 0.5 м3",
      photoUrl: "https://cdn.example.com/mod.jpg",
    },
  });
  assert(r.status === 200 && !r.data.leadId, "still no lead until card is full");
  const missPhone = "7999888" + String(Math.floor(1000 + Math.random() * 8999));
  r = await req(`/api/ingest/web-chat/${chatCh.publicKey}`, {
    method: "POST",
    json: {
      sessionId: missSid,
      name: "Анна",
      text:
        "Имя Анна. Телефон " +
        missPhone +
        " телеграм @annaved max:maxanna. Отправка Шанхай, прибытие Москва. Приоритет АВИА. Срок октябрь 2026. Инвойсная стоимость 10000 USD, 20 шт. фото есть",
    },
  });
  assert(r.status === 200 && r.data.leadId, "follow-up complete creates lead " + JSON.stringify(r.data));
  assert(r.data.cardComplete === true, "follow-up cardComplete");
  const missLead = await req(`/api/leads/${r.data.leadId}`, { cookie });
  assert(missLead.data.status === "new", "follow-up lead status new");
  const missMap = Object.fromEntries((missLead.data.fieldValues || []).map((v) => [v.field.key, v.value]));
  for (const k of ["telegram", "max", "cargo", "weight", "volume", "origin", "destination", "route", "eta"]) {
    assert(missMap[k] && String(missMap[k]).trim(), "follow-up filled " + k + " " + missMap[k]);
  }
  assert(missMap.route === "АВИА", "follow-up АВИА");
  assert(/https?:\/\//.test(missMap.cargo || "") && /фото/i.test(missMap.cargo || ""), "link+photo in cargo");
  const missPoll2 = await req(`/api/ingest/web-chat/${chatCh.publicKey}?sessionId=${missSid}`);
  assert(
    (missPoll2.data.messages || []).some((m) => m.direction === "outbound" && /Итоговые данные/i.test(m.body)),
    "итоговые данные after full card",
  );

  r = await req(`/api/channels/${tgCh.id}/simulate`, {
    method: "POST",
    cookie,
    json: {
      chatId: "tg-photo-" + id,
      text: "фото модуля памяти",
      photoFileId: "AgAC-test-file-id",
      name: "ФотоКлиент",
    },
  });
  assert(r.status === 200 && !r.data.leadId, "telegram photo note does not auto-complete card");
  const convPhoto = await req(`/api/conversations/${r.data.conversationId}`, { cookie });
  assert(
    (convPhoto.data.messages || []).some((m) => m.direction === "inbound" && /file_id:AgAC-test-file-id/.test(m.body)),
    "telegram file_id stored in chat",
  );

  const cargoPhone = "7999666" + String(Math.floor(1000 + Math.random() * 8999));
  const cargoPhoneTg = "7999777" + String(Math.floor(1000 + Math.random() * 8999));
  const cargoText =
    "Имя Павел. Груз: модули памяти ЭВМ, ссылка https://example.com/mod, фото есть, инвойсная стоимость 10000, 20 шт. Вес 12 кг, объём 0.5 м3. Отправка Шанхай, прибытие Москва. Приоритет АИВА. Срок октябрь 2026. Телефон " +
    cargoPhone +
    " телеграм @pavelved max:maxpavel";
  r = await req(`/api/ingest/web-chat/${chatCh.publicKey}`, {
    method: "POST",
    json: { sessionId: "chat-cargo-" + id, name: "Павел", text: cargoText },
  });
  assert(r.status === 200 && r.data.leadId, "chat cargo creates lead " + JSON.stringify(r.data));
  assert(r.data.cardComplete === true, "full cargo cardComplete");
  assert(r.data.urgent === false, "explicit cargo chat is not auto-urgent");
  const cargoContact = await req(`/api/contacts/${r.data.contactId}`, { cookie });
  const cargoMap = Object.fromEntries(
    (cargoContact.data.fieldValues || []).map((v) => [v.field.key, v.value]),
  );
  assert(cargoContact.data.name === "Павел" || cargoContact.data.name === "из текста", "cargo name");
  assert(cargoContact.data.phone === cargoPhone, "cargo phone on contact");
  assert(cargoMap.telegram === "@pavelved", "cargo telegram " + cargoMap.telegram);
  assert(cargoMap.max === "maxpavel", "cargo max " + cargoMap.max);
  assert(/модул/i.test(cargoMap.cargo || ""), "cargo description " + cargoMap.cargo);
  assert(String(cargoMap.weight || "").includes("12"), "cargo weight " + cargoMap.weight);
  assert(/0\.5/.test(String(cargoMap.volume || "")), "cargo volume " + cargoMap.volume);
  assert(/Шанхай/.test(String(cargoMap.origin || "")), "cargo origin " + cargoMap.origin);
  assert(/Москва/.test(String(cargoMap.destination || "")), "cargo destination " + cargoMap.destination);
  assert(cargoMap.route === "АВИА", "АИВА → АВИА, got " + cargoMap.route);
  assert(/октябр/i.test(String(cargoMap.eta || "")), "cargo eta " + cargoMap.eta);
  const cargoLead = await req(`/api/leads/${r.data.leadId}`, { cookie });
  assert(cargoLead.data.status === "new", "complete chat lead is Новый");
  const leadMap = Object.fromEntries(
    (cargoLead.data.fieldValues || []).map((v) => [v.field.key, v.value]),
  );
  assert(leadMap.route === "АВИА", "lead card route АВИА");
  for (const k of ["telegram", "max", "cargo", "weight", "volume", "origin", "destination", "route", "eta"]) {
    assert(leadMap[k] && String(leadMap[k]).trim() !== "", "no empty card field " + k);
  }
  const cargoChatPoll = await req(`/api/ingest/web-chat/${chatCh.publicKey}?sessionId=chat-cargo-${id}`);
  assert(
    (cargoChatPoll.data.messages || []).some((m) => m.direction === "outbound" && /Итоговые данные/i.test(m.body)),
    "sales bot writes итоговые данные when card is full",
  );

  r = await req(`/api/channels/${tgCh.id}/simulate`, {
    method: "POST",
    cookie,
    json: {
      chatId: "tg-cargo-" + id,
      text: cargoText
        .replace("Павел", "Олег")
        .replace("@pavelved", "@olegved")
        .replace(cargoPhone, cargoPhoneTg)
        .replace("maxpavel", "maxoleg"),
      username: "olegved",
      name: "Олег",
    },
  });
  assert(r.status === 200 && r.data.leadId, "telegram cargo creates lead");
  const tgCargoConv = await req(`/api/conversations/${r.data.conversationId}`, { cookie });
  assert(
    (tgCargoConv.data.messages || []).some((m) => m.direction === "outbound"),
    "explicit telegram cargo bot replies",
  );
  const tgCargoContact = await req(`/api/contacts/${r.data.contactId}`, { cookie });
  const tgCargoMap = Object.fromEntries(
    (tgCargoContact.data.fieldValues || []).map((v) => [v.field.key, v.value]),
  );
  assert(tgCargoMap.route === "АВИА", "telegram АИВА → АВИА");

  const team = await req("/api/team", { cookie });
  const mgr = (team.data.members || []).find((m) => m.role === "manager");
  assert(mgr?.userId, "manager userId");
  r = await req(`/api/conversations/${chatConvId}`, {
    method: "PATCH",
    cookie,
    json: { action: "redirect", userId: mgr.userId },
  });
  assert(r.status === 200 && r.data.conversation.assigneeId === mgr.userId, "redirect to manager");
  const convBeforeAi = await req(`/api/conversations/${r.data.conversation.id}`, { cookie });
  const outBefore = (convBeforeAi.data.messages || []).filter((m) => m.direction === "outbound").length;
  r = await req(`/api/conversations/${convBeforeAi.data.id}`, { method: "PATCH", cookie, json: { action: "ai" } });
  assert(r.status === 200 && r.data.conversation.status === "ai", "return to AI");
  assert(r.data.resent === true, "repeat last answer");
  const convAfterAi = await req(`/api/conversations/${convBeforeAi.data.id}`, { cookie });
  const outAfter = (convAfterAi.data.messages || []).filter((m) => m.direction === "outbound").length;
  assert(outAfter === outBefore + 1, "last answer resent as outbound");

  r = await req("/api/knowledge/topics", { method: "POST", cookie, json: { name: "Логистика" } });
  assert(r.status === 200 && r.data.topic.id, "create knowledge topic");
  const topicId = r.data.topic.id;
  r = await req("/api/knowledge", {
    method: "POST",
    cookie,
    json: { title: "FCA папка", body: "FCA — риск на покупателе после передачи.", topicId },
  });
  assert(r.status === 200 && r.data.article.topicId === topicId, "article in topic");
  r = await req(`/api/flow/blocks/${chatBlock.id}`, { method: "PATCH", cookie, json: { topicId } });
  assert(r.status === 200, "bind topic to chat channel");
  r = await req("/api/knowledge/topics", { method: "POST", cookie: mgrCookie, json: { name: "нет" } });
  assert(r.status === 403, "manager cannot create topic");

  const log = await req("/api/log", { cookie });
  assert(log.status === 200 && (log.data.items || []).length > 0, "activity log has events");
  assert(
    (log.data.items || []).some((i) => i.event === "ingest" || i.event === "redirect"),
    "log contains ingest or redirect",
  );
  r = await req("/api/log", { cookie: mgrCookie });
  assert(r.status === 200, "manager can read log");

  const stats = await req("/api/stats", { cookie });
  assert(stats.status === 200, "stats");
  assert(typeof stats.data.today?.inbound === "number", "today inbound");
  assert(stats.data.today.leads >= 1, "today leads");
  assert(typeof stats.data.stale === "number", "stale count");
  assert(stats.data.slaMinutes === 15, "default sla 15");
  r = await req("/api/workspace", { method: "PATCH", cookie, json: { slaMinutes: 0 } });
  assert(r.status === 200 && r.data.slaMinutes === 0, "sla immediate");
  const inboxStale = await req("/api/inbox", { cookie });
  assert(
    (inboxStale.data.items || []).some((i) => i.stale === true),
    "unanswered conversation flagged stale",
  );
  r = await req("/api/workspace", { method: "PATCH", cookie, json: { slaMinutes: 15 } });
  assert(r.status === 200 && r.data.slaMinutes === 15, "sla restored");
  r = await req("/api/workspace", { method: "PATCH", cookie: mgrCookie, json: { slaMinutes: 0 } });
  assert(r.status === 403, "manager cannot set sla");

  const flowPub = await req("/api/flow", { cookie });
  assert(String(flowPub.data.publicUrl || "").includes("http"), "public url on flow");
  r = await req(`/api/channels/${tgCh.id}/webhook`, { method: "POST", cookie });
  assert(r.status === 400, "webhook re-register without token");

  const csv = await req("/api/log?format=csv", { cookie });
  const csvText = csv.data?.raw || "";
  assert(csv.status === 200 && csvText.includes("событие"), "csv header");
  assert(/ingest|redirect/.test(csvText), "csv has events");
  assert(String(csv.headers.get("content-type") || "").includes("text/csv"), "csv content type");

  const lockEmail = `lock-${id}@example.com`;
  r = await req("/api/auth/register", { method: "POST", json: { name: "Лок", email: lockEmail, password: "secret12" } });
  assert(r.status === 200, "lock user");
  let last = null;
  for (let i = 0; i < 5; i++) {
    last = await req("/api/auth/login", { method: "POST", json: { email: lockEmail, password: "wrong-pass" } });
  }
  assert(last.status === 429, "fifth fail locks " + JSON.stringify(last.data));
  r = await req("/api/auth/login", { method: "POST", json: { email: lockEmail, password: "secret12" } });
  assert(r.status === 429, "lock holds for correct password");
  const softEmail = `soft-${id}@example.com`;
  await req("/api/auth/register", { method: "POST", json: { name: "Софт", email: softEmail, password: "secret12" } });
  await req("/api/auth/login", { method: "POST", json: { email: softEmail, password: "bad" } });
  r = await req("/api/auth/login", { method: "POST", json: { email: softEmail, password: "secret12" } });
  assert(r.status === 200, "correct password after few fails");

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
