"use client";

import { FormEvent, useEffect, useState } from "react";
import { CannedManager } from "@/components/CannedManager";

type Model = { provider: string; model: string; label: string; available: boolean };
type ImportErr = { row: number; error: string };

export default function SettingsPage() {
  const [role, setRole] = useState("");
  const [sla, setSla] = useState("15");
  const [pingEnabled, setPingEnabled] = useState(true);
  const [routingMode, setRoutingMode] = useState<"pool" | "round_robin">("pool");
  const [defaultModel, setDefaultModel] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [box, setBox] = useState(false);
  const [msg, setMsg] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [hookSecret, setHookSecret] = useState("");
  const [hookHasSecret, setHookHasSecret] = useState(false);
  const [hookLast, setHookLast] = useState("");
  const [csvText, setCsvText] = useState("имя,телефон,телеграм,макс\n");
  const [importMsg, setImportMsg] = useState("");
  const [importErrors, setImportErrors] = useState<ImportErr[]>([]);
  const [workHoursEnabled, setWorkHoursEnabled] = useState(false);
  const [workHoursStart, setWorkHoursStart] = useState("09:00");
  const [workHoursEnd, setWorkHoursEnd] = useState("18:00");
  const [workHoursTz, setWorkHoursTz] = useState("Europe/Moscow");
  const [greeting, setGreeting] = useState("");
  const [autoRules, setAutoRules] = useState<
    { id: string; channel: string | null; tagName: string | null; assigneeId: string; assigneeName: string }[]
  >([]);
  const [teamMembers, setTeamMembers] = useState<{ userId: string; name: string; role: string }[]>([]);
  const [ruleChannel, setRuleChannel] = useState("");
  const [ruleTag, setRuleTag] = useState("");
  const [ruleAssignee, setRuleAssignee] = useState("");
  const [ruleMsg, setRuleMsg] = useState("");
  const [statusLine, setStatusLine] = useState("");

  async function load() {
    const [ws, me, team, rules] = await Promise.all([
      fetch("/api/workspace").then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/team").then((r) => r.json()),
      fetch("/api/workspace/auto-assign").then((r) => (r.ok ? r.json() : { rules: [] })),
    ]);
    setSla(String(ws.slaMinutes ?? 15));
    setPingEnabled(ws.pingEnabled !== false);
    if (ws.routingMode === "round_robin" || ws.routingMode === "pool") setRoutingMode(ws.routingMode);
    setDefaultModel(ws.defaultModel || "");
    setModels(ws.models || []);
    setBox(Boolean(ws.dataOnThisMachine) || me.deployMode === "box");
    setRole(me.user?.role || "");
    setHookUrl(ws.outboundWebhookUrl || "");
    setHookHasSecret(Boolean(ws.outboundWebhookHasSecret));
    setHookLast(ws.outboundWebhookLastError || "");
    setWorkHoursEnabled(Boolean(ws.workHoursEnabled));
    setWorkHoursStart(ws.workHoursStart || "09:00");
    setWorkHoursEnd(ws.workHoursEnd || "18:00");
    setWorkHoursTz(ws.workHoursTz || "Europe/Moscow");
    setGreeting(ws.greeting || "");
    setAutoRules(rules.rules || []);
    setTeamMembers((team.members || []).map((m: { userId: string; name: string; role: string }) => m));
    if (me.user?.role === "owner") {
      fetch("/api/status")
        .then((r) => r.json())
        .then((s) => {
          if (s.postgres !== undefined) {
            setStatusLine(
              `Postgres: ${s.postgres ? "ок" : "ошибка"} · v${s.version} · ${s.deployMode} · лидов ${s.counts?.leads ?? "—"}`,
            );
          }
        })
        .catch(() => {});
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slaMinutes: Number(sla),
        pingEnabled,
        routingMode,
        defaultModel: defaultModel || null,
        outboundWebhookUrl: hookUrl,
        outboundWebhookSecret: hookSecret || undefined,
        workHoursEnabled,
        workHoursStart,
        workHoursEnd,
        workHoursTz,
        greeting,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMsg(data.error || "Ошибка");
    else {
      setMsg("Сохранили");
      setHookSecret("");
      await load();
    }
  }

  async function downloadExport() {
    const res = await fetch("/api/workspace/export");
    if (!res.ok) {
      setMsg("Экспорт недоступен");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crm-time-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg("JSON экспорт скачан");
  }

  async function addAutoRule(e: FormEvent) {
    e.preventDefault();
    if (!ruleAssignee || (!ruleChannel && !ruleTag.trim())) {
      setRuleMsg("Канал или метка и менеджер обязательны");
      return;
    }
    const res = await fetch("/api/workspace/auto-assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: ruleChannel || null,
        tagName: ruleTag.trim() || null,
        assigneeId: ruleAssignee,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setRuleMsg(d.error || "Ошибка");
    else {
      setRuleMsg("Правило добавлено");
      setRuleChannel("");
      setRuleTag("");
      await load();
    }
  }

  async function removeRule(id: string) {
    await fetch("/api/workspace/auto-assign", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  async function runImport(dryRun: boolean) {
    const res = await fetch("/api/contacts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: csvText, dryRun }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setImportMsg(d.error || "Ошибка");
      setImportErrors([]);
      return;
    }
    setImportErrors(d.errors || []);
    setImportMsg(
      dryRun
        ? `Проверка: +${d.created} / обновить ${d.updated} / пропуск ${d.skipped} / ошибок ${d.errors?.length || 0}`
        : `Импорт: +${d.created} / обновлено ${d.updated} / пропуск ${d.skipped} / ошибок ${d.errors?.length || 0}`,
    );
  }

  const owner = role === "owner";

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Настройки</h1>
      <p className="mt-2 text-muted">SLA, пинг, назначение и дефолт модели — здесь, не только в коде.</p>
      {box && (
        <p className="ok-banner mt-4 max-w-xl rounded px-3 py-2 text-sm">
          Данные на этой машине. Публичная регистрация выключена.
        </p>
      )}
      <form onSubmit={save} className="mt-8 max-w-xl space-y-6">
        <label className="block text-sm">
          SLA, минут (0 = сразу «завис»)
          <input
            className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2"
            value={sla}
            onChange={(e) => setSla(e.target.value)}
            disabled={!owner}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={pingEnabled}
            onChange={(e) => setPingEnabled(e.target.checked)}
            disabled={!owner}
          />
          Пинг клиента после SLA
        </label>
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium">Назначение менеджеров</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="routing"
              checked={routingMode === "pool"}
              onChange={() => setRoutingMode("pool")}
              disabled={!owner}
            />
            Свободный пул
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="routing"
              checked={routingMode === "round_robin"}
              onChange={() => setRoutingMode("round_robin")}
              disabled={!owner}
            />
            По кругу
          </label>
        </fieldset>
        <fieldset className="space-y-2 rounded-xl border border-line bg-slot p-4 text-sm">
          <legend className="px-1 font-medium">Рабочие часы</legend>
          <p className="text-muted">
            Вне часов — один короткий автоответ в чат сайта и Telegram («мы на связи с …»). Коммерческий текст сам не уходит.
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={workHoursEnabled}
              onChange={(e) => setWorkHoursEnabled(e.target.checked)}
              disabled={!owner}
            />
            Включить рабочие часы
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block">
              С
              <input
                className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2"
                value={workHoursStart}
                onChange={(e) => setWorkHoursStart(e.target.value)}
                disabled={!owner}
                placeholder="09:00"
              />
            </label>
            <label className="block">
              До
              <input
                className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2"
                value={workHoursEnd}
                onChange={(e) => setWorkHoursEnd(e.target.value)}
                disabled={!owner}
                placeholder="18:00"
              />
            </label>
            <label className="block">
              Часовой пояс
              <input
                className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2"
                value={workHoursTz}
                onChange={(e) => setWorkHoursTz(e.target.value)}
                disabled={!owner}
              />
            </label>
          </div>
        </fieldset>
        <label className="block text-sm">
          Приветствие Telegram /start (новая сессия чата)
          <textarea
            className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2"
            rows={3}
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            disabled={!owner}
          />
        </label>
        <label className="block text-sm">
          Дефолт модели (запасной ключ, не автопилот)
          <select
            className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            disabled={!owner}
          >
            <option value="">не задан</option>
            {models.map((m) => (
              <option key={`${m.provider}:${m.model}`} value={`${m.provider}:${m.model}`} disabled={!m.available}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {owner && (
          <>
            <h2 className="text-xl font-semibold">Webhook лида «Новый»</h2>
            <p className="text-sm text-muted">
              HTTPS POST на ваш URL, заголовок X-CRM-Time-Secret. Не Bitrix и не Amo — сырой JSON события.
            </p>
            <label className="block text-sm">
              URL
              <input
                className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2"
                value={hookUrl}
                onChange={(e) => setHookUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="block text-sm">
              Секрет {hookHasSecret ? "(уже задан, пустое поле не меняет)" : ""}
              <input
                className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2"
                value={hookSecret}
                onChange={(e) => setHookSecret(e.target.value)}
                placeholder="секрет в заголовке"
              />
            </label>
            {hookLast && <p className="text-sm text-urgent">Последняя ошибка: {hookLast}</p>}
          </>
        )}
        {owner && (
          <button className="rounded-xl bg-accent px-4 py-2 text-ink">Сохранить</button>
        )}
        {msg && <p className="ok-banner rounded px-3 py-2 text-sm">{msg}</p>}
      </form>
      {owner && (
        <section className="mt-12 max-w-xl space-y-4">
          <h2 className="text-xl font-semibold">Автоназначение лидов «Новый»</h2>
          <p className="text-sm text-muted">
            Если канал или метка совпали — назначить менеджера (канал ИЛИ метка в одной строке).
          </p>
          <ul className="space-y-2 text-sm">
            {autoRules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-slot px-3 py-2">
                <span>
                  {r.channel ? `канал ${r.channel}` : ""}
                  {r.channel && r.tagName ? " · " : ""}
                  {r.tagName ? `метка «${r.tagName}»` : ""} → {r.assigneeName}
                </span>
                <button type="button" className="text-urgent" onClick={() => removeRule(r.id)}>
                  Удалить
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={addAutoRule} className="grid gap-2 sm:grid-cols-3">
            <select
              className="rounded-xl border border-line bg-paper px-3 py-2 text-sm"
              value={ruleChannel}
              onChange={(e) => setRuleChannel(e.target.value)}
            >
              <option value="">любой канал</option>
              <option value="telegram">telegram</option>
              <option value="web_form">web_form</option>
              <option value="web_chat">web_chat</option>
              <option value="email">email</option>
            </select>
            <input
              className="rounded-xl border border-line bg-paper px-3 py-2 text-sm"
              placeholder="метка (необяз.)"
              value={ruleTag}
              onChange={(e) => setRuleTag(e.target.value)}
            />
            <select
              className="rounded-xl border border-line bg-paper px-3 py-2 text-sm"
              value={ruleAssignee}
              onChange={(e) => setRuleAssignee(e.target.value)}
            >
              <option value="">менеджер</option>
              {teamMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
            <button type="submit" className="sm:col-span-3 rounded-xl bg-accent px-4 py-2 text-sm text-ink">
              Добавить правило
            </button>
          </form>
          {ruleMsg && <p className="text-sm text-muted">{ruleMsg}</p>}
        </section>
      )}
      {owner && (
        <section className="mt-12 max-w-xl space-y-3">
          <h2 className="text-xl font-semibold">Резервная копия воркспейса</h2>
          <p className="text-sm text-muted">
            JSON: контакты, лиды, знания, настройки, цепочки без секретов каналов — для переноса на другую машину.
          </p>
          <button type="button" className="rounded-xl border border-line px-4 py-2 text-sm" onClick={downloadExport}>
            Скачать JSON
          </button>
          {statusLine && <p className="text-sm text-muted">Статус: {statusLine}</p>}
          <p className="text-xs text-muted">Публично: GET /api/health · подробнее здесь для владельца (/api/status).</p>
        </section>
      )}
      <section className="mt-12 max-w-xl">
        <h2 className="text-xl font-semibold">Импорт контактов CSV</h2>
        <p className="mt-1 text-sm text-muted">
          Колонки: имя, телефон, телеграм, макс. Проверка без записи, затем импорт. Существующие не стираем — обновляем по телефону.
        </p>
        <textarea
          className="mt-3 w-full rounded-xl border border-line bg-slot p-3 text-sm"
          rows={6}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl border border-line px-4 py-2 text-sm"
            onClick={() => runImport(true)}
          >
            Проверить
          </button>
          <button type="button" className="rounded-xl bg-accent px-4 py-2 text-sm text-ink" onClick={() => runImport(false)}>
            Импортировать
          </button>
        </div>
        {importMsg && <p className="ok-banner mt-2 rounded px-3 py-2 text-sm">{importMsg}</p>}
        {importErrors.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-urgent">
            {importErrors.map((e, i) => (
              <li key={`${e.row}-${i}`}>
                Строка {e.row}: {e.error}
              </li>
            ))}
          </ul>
        )}
      </section>
      <CannedManager />
    </main>
  );
}
