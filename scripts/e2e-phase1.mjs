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
  r = await req("/api/inbox", { cookie: mgrCookie });
  assert(r.status === 200, "manager inbox");
  r = await req("/api/leads", { cookie: mgrCookie });
  assert(r.status === 200 && r.data.items.length > 0, "manager sees leads");

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
