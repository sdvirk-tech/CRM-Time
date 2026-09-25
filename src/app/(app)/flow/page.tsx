"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Model = { provider: string; model: string; label: string; available: boolean };
type Channel = {
  id: string;
  type: string;
  name: string;
  publicKey?: string;
  snippet?: string;
  formUrl?: string;
  chatUrl?: string;
  webhookUrl?: string;
  ingestUrl?: string;
  mailto?: string;
  fromAddress?: string;
  hasToken: boolean;
  enabled: boolean;
  topicId?: string | null;
  allowedOrigins: string[];
  pollMode?: boolean;
  pollOffset?: number;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
};
type Topic = { id: string; name: string };
type Process = {
  id: string;
  type: string;
  name: string;
  prompt: string;
  binding: { provider: string; model: string } | null;
};
type Block = {
  id: string;
  type: string;
  label: string;
  position: number;
  lastError: string | null;
  config: {
    channelId?: string;
    channelType?: string;
    aiProcessId?: string;
    processType?: string;
    actionType?: string;
  };
};

const palette = [
  { kind: "channel_web_form", group: "Канал", label: "Форма сайта" },
  { kind: "channel_web_chat", group: "Канал", label: "Чат на сайте" },
  { kind: "channel_telegram", group: "Канал", label: "Telegram" },
  { kind: "channel_email", group: "Канал", label: "Почта" },
  { kind: "ai_parse", group: "AI", label: "Разобрать входящее" },
  { kind: "ai_draft", group: "AI", label: "Черновик ответа" },
  { kind: "ai_ping", group: "AI", label: "Пинг клиента" },
  { kind: "ai_deep", group: "AI", label: "Глубокий анализ" },
  { kind: "action_create_lead", group: "Действие", label: "Создать лид" },
  { kind: "action_show_draft", group: "Действие", label: "Показать черновик" },
];

export default function FlowPage() {
  const [data, setData] = useState<{
    flow?: { id: string; name: string; published?: boolean };
    flows?: { id: string; name: string; published: boolean; compact: string; blockCount: number }[];
    blocks: Block[];
    channels: Channel[];
    processes: Process[];
    models: Model[];
    deepAnalysisEnabled: boolean;
    role: string;
    defaultModel: string | null;
    greeting: string;
    salesPrompt?: string;
    routingMode?: string;
    topics: Topic[];
    publicUrl?: string;
    httpsWebhook?: boolean;
    preview?: string;
    compact?: string;
    onboarding?: {
      show: boolean;
      steps: { hasBlocks: boolean; hasChannel: boolean; hasExplicitModel: boolean; hasRealLead: boolean };
    };
  } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"chain" | "models">("chain");
  const [salesPrompt, setSalesPrompt] = useState("");
  const [flowId, setFlowId] = useState<string | null>(null);
  const [sampleUser, setSampleUser] = useState("пинг");
  const [modelRaw, setModelRaw] = useState("");

  const load = useCallback(async (id?: string | null) => {
    const q = id ? `/api/flow?flowId=${encodeURIComponent(id)}` : "/api/flow";
    const res = await fetch(q);
    const json = await res.json();
    setData(json);
    if (typeof json.salesPrompt === "string") setSalesPrompt(json.salesPrompt);
    if (json.flow?.id) setFlowId(json.flow.id);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const owner = data?.role === "owner";

  async function add(kind: string) {
    if (kind === "ai_deep" && data && !data.deepAnalysisEnabled) {
      setNotice("Глубокий анализ серый: нет ключа QWEN/JEV/OPENAI в env. Цепочка без него работает.");
      return;
    }
    await fetch("/api/flow/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, flowId }),
    });
    await load(flowId);
  }

  async function saveDefault(value: string) {
    await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultModel: value || null }),
    });
    await load(flowId);
  }

  async function saveGreeting(value: string) {
    await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ greeting: value }),
    });
    await load(flowId);
  }

  async function saveSalesPrompt() {
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ salesPrompt }),
    });
    const json = await res.json();
    setNotice(res.ok ? "Промт МАКС сохранён в воркспейсе" : json.error || "Ошибка");
    await load(flowId);
  }

  async function pingModel(processId?: string) {
    const raw = data?.defaultModel || "mock:ok";
    const [provider, ...rest] = raw.split(":");
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        model: rest.join(":") || "ok",
        processId,
        user: sampleUser,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setModelRaw(json.raw || json.preview || "");
      setNotice(`Модель отвечает: ${json.provider}:${json.model} · ${json.ms} мс`);
    } else {
      setModelRaw("");
      setNotice(json.error || "Модель не ответила");
    }
  }

  async function createFlow() {
    const res = await fetch("/api/flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Новая цепочка" }),
    });
    const json = await res.json();
    if (res.ok && json.flow?.id) await load(json.flow.id);
    else setNotice(json.error || "Не удалось создать цепочку");
  }

  async function renameFlow(name: string) {
    if (!flowId || !name.trim()) return;
    await fetch("/api/flow", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: flowId, name: name.trim() }),
    });
    await load(flowId);
  }

  async function togglePublished(published: boolean) {
    if (!flowId) return;
    await fetch("/api/flow", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: flowId, published }),
    });
    await load(flowId);
  }

  async function deleteFlow() {
    if (!flowId) return;
    const res = await fetch(`/api/flow?id=${encodeURIComponent(flowId)}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setNotice(json.error || "Нельзя убрать цепочку");
      return;
    }
    setOpenId(null);
    await load();
  }

  const preview = useMemo(() => {
    if (!data?.blocks.length) return "положите канал";
    return data.blocks
      .map((b) => {
        if (b.type === "ai_process") {
          const proc = data.processes.find((p) => p.id === b.config.aiProcessId);
          if (!proc?.binding) return `${b.label} (срочно человек)`;
          return `${b.label} (${proc.binding.provider}:${proc.binding.model})`;
        }
        return b.label;
      })
      .join(" → ");
  }, [data]);

  if (!data) return <div className="p-8 text-muted">Загрузка холста…</div>;

  const open = data.blocks.find((b) => b.id === openId) ?? null;

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-line bg-mist p-4">
        <p className="text-xs uppercase tracking-widest text-muted">Палитра</p>
        <div className="mt-3 space-y-2">
          {palette.map((p) => {
            const disabled = !owner || (p.kind === "ai_deep" && !data.deepAnalysisEnabled);
            return (
              <button
                key={p.kind}
                disabled={disabled}
                onClick={() => add(p.kind)}
                className="w-full rounded border border-line bg-slot px-3 py-2 text-left text-sm disabled:opacity-40"
                title={p.kind === "ai_deep" && !data.deepAnalysisEnabled ? "Нет ключа в env" : p.group}
              >
                <span className="block text-[10px] uppercase tracking-wider text-muted">{p.group}</span>
                {p.label}
              </button>
            );
          })}
        </div>
      </aside>
      <section className="min-w-0 flex-1 p-8">
        <div className="flex gap-2 text-sm">
          <button className={tab === "chain" ? "chip chip-on" : "chip"} onClick={() => setTab("chain")}>
            Цепочка
          </button>
          <button className={tab === "models" ? "chip chip-on" : "chip"} onClick={() => setTab("models")}>
            Процесс → модель
          </button>
        </div>

        {tab === "chain" && (
          <>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-ink">Цепочка</p>
            <h1 className="mt-2 text-3xl font-semibold">Куда класть и как соединять</h1>
            {data.onboarding?.show && (
              <div className="mt-6 max-w-2xl rounded-2xl border border-accent bg-mist p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold">Первый лид — чеклист</p>
                  <button
                    type="button"
                    className="text-sm text-muted underline"
                    onClick={async () => {
                      await fetch("/api/workspace", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ dismissOnboardingChecklist: true }),
                      });
                      await load(flowId);
                    }}
                  >
                    Скрыть
                  </button>
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {[
                    { ok: data.onboarding.steps.hasBlocks, label: "Положить слоты на цепочку" },
                    { ok: data.onboarding.steps.hasChannel, label: "Включить канал (форма, чат или Telegram)" },
                    { ok: data.onboarding.steps.hasExplicitModel, label: "Выбрать явную модель на AI-слоте" },
                    { ok: data.onboarding.steps.hasRealLead, label: "Получить первый реальный лид (не тестовая кнопка)" },
                  ].map((s) => (
                    <li key={s.label} className={s.ok ? "text-ink" : "text-muted"}>
                      {s.ok ? "✓" : "○"} {s.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-2 max-w-2xl text-muted">
              Слоты только по порядку, без веток. Превью: <span className="text-ink">{data.preview || preview}</span>
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {(data.flows || []).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={flowId === f.id ? "chip chip-on" : "chip"}
                  onClick={() => {
                    setOpenId(null);
                    void load(f.id);
                  }}
                >
                  {f.name}
                  {!f.published ? " · черновик" : ""}
                </button>
              ))}
              {owner && (
                <button type="button" className="chip" onClick={createFlow}>
                  Ещё цепочка
                </button>
              )}
            </div>
            {owner && data.flow && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <label>
                  Имя
                  <input
                    className="ml-2 rounded border border-line bg-slot px-2 py-1"
                    defaultValue={data.flow.name}
                    key={data.flow.id}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value.trim() !== data.flow?.name) {
                        void renameFlow(e.target.value);
                      }
                    }}
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(data.flow.published)}
                    onChange={(e) => togglePublished(e.target.checked)}
                  />
                  Опубликована
                </label>
                {(data.flows || []).length > 1 && (
                  <button type="button" className="text-urgent" onClick={deleteFlow}>
                    Убрать цепочку
                  </button>
                )}
              </div>
            )}
            <p className="mt-2 text-xs text-muted">
              Несколько линейных цепочек в одном воркспейсе — например «Сайт-чат» и «Telegram». Веток нет.
            </p>
            {notice && <p className="mt-3 text-sm text-urgent">{notice}</p>}
            <div className="mt-10 flex flex-wrap items-center gap-3">
              {data.blocks.length === 0 && (
                <div className="slot-card px-6 py-8 text-muted">Пустая цепочка. Положите канал слева.</div>
              )}
              {data.blocks.map((block, i) => {
                const proc = data.processes.find((p) => p.id === block.config.aiProcessId);
                const emptyModel = block.type === "ai_process" && !proc?.binding;
                return (
                  <div key={block.id} className="flex items-center gap-3">
                    {i > 0 && <span className="text-2xl text-muted">→</span>}
                    <button
                      onClick={() => setOpenId(block.id)}
                      className={`slot-card px-4 py-4 text-left ${emptyModel ? "ring-1 ring-urgent" : ""} ${openId === block.id ? "slot-on" : ""}`}
                    >
                      <p className="text-[10px] uppercase tracking-wider text-muted">
                        {block.type === "channel" ? "Канал" : block.type === "ai_process" ? "AI-процесс" : "Действие"}
                      </p>
                      <p className="text-lg font-semibold">{block.label}</p>
                      {emptyModel && <p className="mt-2 text-xs font-semibold text-urgent">срочно человек</p>}
                      {proc?.binding && (
                        <p className="mt-2 text-xs text-ink">
                          {proc.binding.provider}:{proc.binding.model}
                        </p>
                      )}
                      {block.lastError && <p className="mt-2 text-xs text-urgent">{block.lastError}</p>}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "models" && (
          <div className="mt-6 max-w-2xl">
            <h1 className="text-3xl font-semibold">Процесс → модель</h1>
            <p className="mt-2 text-sm text-muted">
              Пустой слот берёт дефолт воркспейса и сразу ставит «срочно» человеку. Явная модель — без авто-срочности.
            </p>
            {owner && (
              <label className="mt-6 block text-sm">
                Приветствие на /start (сброс сессии в Telegram)
                <textarea
                  className="mt-1 w-full rounded border border-line bg-slot px-3 py-2"
                  rows={3}
                  defaultValue={data.greeting}
                  onBlur={(e) => {
                    if (e.target.value !== data.greeting) saveGreeting(e.target.value);
                  }}
                />
              </label>
            )}
            {owner && (
              <div className="mt-6">
                <label className="block text-sm">
                  Промт МАКС (продажник) — системный текст черновика на воркспейс. Не Git, не файл на диске.
                  <textarea
                    className="mt-1 w-full rounded border border-line bg-slot px-3 py-2 font-mono text-xs"
                    rows={12}
                    value={salesPrompt}
                    onChange={(e) => setSalesPrompt(e.target.value)}
                  />
                </label>
                <button type="button" onClick={saveSalesPrompt} className="mt-2 rounded bg-accent px-4 py-2 text-sm text-ink">
                  Сохранить промт
                </button>
                <p className="mt-2 text-xs text-muted">
                  Сохранённый текст подставляется во все процессы «черновик ответа». Пинг клиента — отдельный слот в палитре.
                </p>
              </div>
            )}
            {owner && (
              <label className="mt-6 block text-sm">
                Дефолт воркспейса (запасной ключ, не автопилот)
                <select
                  className="mt-1 w-full rounded border border-line bg-slot px-3 py-2"
                  value={data.defaultModel ?? ""}
                  onChange={(e) => saveDefault(e.target.value)}
                >
                  <option value="">не задан</option>
                  {data.models.map((m) => (
                    <option key={`${m.provider}:${m.model}`} value={`${m.provider}:${m.model}`} disabled={!m.available}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {owner && (
              <div className="mt-6">
                <label className="block text-sm">
                  Пробный промпт (curl-папка модели)
                  <textarea
                    className="mt-1 w-full rounded border border-line bg-slot px-3 py-2 font-mono text-xs"
                    rows={3}
                    value={sampleUser}
                    onChange={(e) => setSampleUser(e.target.value)}
                  />
                </label>
                <button type="button" onClick={() => pingModel()} className="mt-3 rounded bg-accent px-4 py-2 text-sm text-ink">
                  Проверить запуск модели
                </button>
                {notice && /отвечает|ок/i.test(notice) && (
                  <p className="ok-banner mt-3 inline-block rounded px-3 py-2 text-sm">{notice}</p>
                )}
                {notice && !/отвечает|ок/i.test(notice) && <p className="mt-3 text-sm text-urgent">{notice}</p>}
                {modelRaw && (
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-line bg-slot p-3 text-xs">
                    {modelRaw}
                  </pre>
                )}
              </div>
            )}
            <table className="mt-6 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-mist text-left text-ink">
                  <th className="py-2 font-medium">Процесс</th>
                  <th className="py-2 font-medium">Модель</th>
                  <th className="py-2 font-medium">Режим</th>
                  <th className="py-2 font-medium">Проверка</th>
                </tr>
              </thead>
              <tbody>
                {data.processes.map((p) => (
                  <tr key={p.id} className="border-b border-line">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2">
                      {p.binding ? `${p.binding.provider}:${p.binding.model}` : data.defaultModel || "—"}
                    </td>
                    <td className="py-2">{p.binding ? "явная" : "срочно человек"}</td>
                    <td className="py-2">
                      {owner && (
                        <button type="button" className="link text-sm" onClick={() => pingModel(p.id)}>
                          Проверить
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {data.processes.length === 0 && (
                  <tr>
                    <td className="py-3 text-muted" colSpan={4}>
                      Положите AI-слот на цепочке.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && (
        <Sheet
          block={open}
          channel={data.channels.find((c) => c.id === open.config.channelId)}
          process={data.processes.find((p) => p.id === open.config.aiProcessId)}
          models={data.models}
          topics={data.topics ?? []}
          publicUrl={data.publicUrl ?? ""}
          httpsWebhook={Boolean(data.httpsWebhook)}
          owner={owner}
          onClose={() => setOpenId(null)}
          onSaved={async () => {
            await load(flowId);
          }}
        />
      )}
    </div>
  );
}

function Sheet({
  block,
  channel,
  process,
  models,
  topics,
  publicUrl,
  httpsWebhook,
  owner,
  onClose,
  onSaved,
}: {
  block: Block;
  channel?: Channel;
  process?: Process;
  models: Model[];
  topics: Topic[];
  publicUrl: string;
  httpsWebhook: boolean;
  owner: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [origins, setOrigins] = useState(channel?.allowedOrigins.join(", ") ?? "");
  const [enabled, setEnabled] = useState(channel?.enabled ?? true);
  const [topicId, setTopicId] = useState(channel?.topicId ?? "");
  const [prompt, setPrompt] = useState(process?.prompt ?? "");
  const [modelVal, setModelVal] = useState(
    process?.binding ? `${process.binding.provider}:${process.binding.model}` : "",
  );
  const [msg, setMsg] = useState("");
  const [tgChat, setTgChat] = useState("");
  const [tgText, setTgText] = useState("модули памяти, 20 кг, Шанхай → Москва, АВИА");
  const [pollMode, setPollMode] = useState(Boolean(channel?.pollMode) || !httpsWebhook);
  const [fromAddress, setFromAddress] = useState(channel?.fromAddress ?? "");
  const [smtpHost, setSmtpHost] = useState(channel?.smtpHost ?? "");
  const [smtpPort, setSmtpPort] = useState(String(channel?.smtpPort || 465));
  const [smtpUser, setSmtpUser] = useState(channel?.smtpUser ?? "");
  const [smtpPass, setSmtpPass] = useState("");
  const [mailFrom, setMailFrom] = useState("client@example.com");
  const [mailSubject, setMailSubject] = useState("Заявка");
  const [mailText, setMailText] = useState("модули памяти, 20 кг, Шанхай → Москва, АВИА");

  async function save(extra: Record<string, unknown> = {}) {
    const [provider, ...rest] = modelVal.split(":");
    const model = rest.join(":");
    const res = await fetch(`/api/flow/blocks/${block.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: token || undefined,
        allowedOrigins: origins
          ? origins.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        enabled: channel ? enabled : undefined,
        topicId: channel ? topicId || null : undefined,
        prompt,
        provider: modelVal ? provider : "",
        model: modelVal ? model : "",
        ...(channel?.type === "email"
          ? {
              fromAddress,
              smtpHost,
              smtpPort: Number(smtpPort) || 465,
              smtpUser,
              ...(smtpPass ? { smtpPass } : {}),
            }
          : {}),
        ...extra,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "Ошибка");
      return;
    }
    setMsg("Сохранено");
    await onSaved();
  }

  async function test() {
    if (!channel) return;
    await save();
    const res = await fetch(`/api/channels/${channel.id}/test`, { method: "POST" });
    const data = await res.json();
    setMsg(
      res.ok
        ? data.username
          ? `Ок, бот @${data.username}`
          : channel.type === "email"
            ? "Тестовое письмо во входящих"
            : "Тестовая заявка ушла во входящие и в лиды"
        : data.error,
    );
    await onSaved();
  }

  async function reregisterWebhook() {
    if (!channel) return;
    const res = await fetch(`/api/channels/${channel.id}/webhook`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) setMsg(data.error || "Ошибка webhook");
    else if (data.ok) setMsg(`Webhook: ${data.description || "зарегистрирован"}`);
    else setMsg(data.description || data.error || "Telegram не принял URL — нужен HTTPS PUBLIC_URL");
    if (data.pollMode) {
      setPollMode(true);
      setMsg(data.description || "Включён опрос getUpdates");
    }
  }

  async function savePoll(on: boolean) {
    if (!channel) return;
    setPollMode(on);
    const res = await fetch(`/api/channels/${channel.id}/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pollMode: on }),
    });
    const data = await res.json();
    setMsg(res.ok ? (on ? "Опрос getUpdates включён" : "Опрос выключен") : data.error || "Ошибка опроса");
    await onSaved();
  }

  async function runPoll() {
    if (!channel) return;
    const res = await fetch(`/api/channels/${channel.id}/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run: true }),
    });
    const data = await res.json();
    setMsg(res.ok ? `Опрос: входящих ${data.processed ?? 0}` : data.error || "Опрос не удался");
    await onSaved();
  }

  async function simulateTg() {
    if (!channel) return;
    const res = await fetch(`/api/channels/${channel.id}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: tgChat || "demo-chat", text: tgText, name: "Клиент TG" }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Сообщение во входящих" : data.error);
    await onSaved();
  }

  async function simulateEmail() {
    if (!channel) return;
    const res = await fetch(`/api/channels/${channel.id}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: mailFrom, subject: mailSubject, text: mailText, name: "Клиент почты" }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Письмо во входящих" : data.error);
    await onSaved();
  }

  async function copySnippet() {
    if (!channel?.snippet) return;
    await navigator.clipboard.writeText(channel.snippet);
    setMsg("Сниппет скопирован");
  }

  async function remove() {
    await fetch(`/api/flow/blocks/${block.id}`, { method: "DELETE" });
    await onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-ink/40">
      <div className="h-full w-full max-w-md overflow-auto border-l border-accent bg-paper p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-semibold">{block.label}</h2>
          <button onClick={onClose} className="text-sm text-muted">
            Закрыть
          </button>
        </div>

        {channel && (
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!owner} />
            Принимать входящие
          </label>
        )}
        {channel && (
          <label className="mt-3 block text-sm">
            Папка знаний
            <select
              className="mt-1 w-full rounded border border-line bg-paper px-3 py-2"
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              disabled={!owner}
            >
              <option value="">все статьи</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {(channel?.type === "web_form" || channel?.type === "web_chat") && (
          owner && channel.publicKey ? (
          <div className="mt-6 space-y-3 text-sm">
            <p>
              {channel.type === "web_chat" ? "Ключ чата" : "Ключ формы"}: <code>{channel.publicKey}</code>
            </p>
            <p>
              {channel.type === "web_chat" ? "Страница чата: " : "Тестовая страница: "}
              <a className="link" href={channel.type === "web_chat" ? channel.chatUrl : channel.formUrl} target="_blank">
                {channel.type === "web_chat" ? channel.chatUrl : channel.formUrl}
              </a>
            </p>
            <label className="block">
              Разрешённые домены (через запятую)
              <input className="mt-1 w-full rounded border border-line bg-paper px-3 py-2" value={origins} onChange={(e) => setOrigins(e.target.value)} disabled={!owner} />
            </label>
            <p className="text-muted">Сниппет на сайт</p>
            <textarea readOnly className="h-40 w-full rounded border border-line bg-paper p-3 font-mono text-xs" value={channel.snippet ?? ""} />
            <button type="button" onClick={copySnippet} className="rounded border border-line px-3 py-1.5">
              Копировать сниппет
            </button>
          </div>
          ) : (
            <p className="mt-6 text-sm text-muted">Ключ виджета скрыт. Работайте во входящих и лидах.</p>
          )
        )}

        {channel?.type === "telegram" && (
          <div className="mt-6 space-y-3 text-sm">
            {owner ? (
              <label className="block">
                Токен бота
                <input className="mt-1 w-full rounded border border-line bg-paper px-3 py-2" value={token} onChange={(e) => setToken(e.target.value)} placeholder={channel.hasToken ? "•••• сохранён" : "123:ABC"} />
              </label>
            ) : (
              <p className="text-muted">Токен бота и webhook скрыты. Работайте во входящих.</p>
            )}
            {owner && (
              <>
            <p className="break-all text-xs text-muted">Публичный URL: {publicUrl || "APP_URL / PUBLIC_URL"}</p>
            <p className="break-all text-xs text-muted">Webhook: {channel.webhookUrl}</p>
            {!httpsWebhook && (
              <p className="text-xs text-muted">
                Нет HTTPS — живой бот идёт опросом getUpdates с этой машины, webhook не обязателен.
              </p>
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={pollMode} onChange={(e) => savePoll(e.target.checked)} />
              Опрос Telegram (getUpdates)
            </label>
              </>
            )}
            {owner && (
              <button type="button" onClick={reregisterWebhook} className="rounded border border-accent bg-paper px-3 py-1.5">
                Перерегистрировать webhook
              </button>
            )}
            {owner && pollMode && (
              <button type="button" onClick={runPoll} className="rounded border border-line px-3 py-1.5">
                Опросить сейчас
              </button>
            )}
            {owner && (
              <div className="space-y-2 border-t border-line pt-3">
                <p className="text-muted">Симуляция входящего (без живого бота)</p>
                <input className="w-full rounded border border-line bg-paper px-3 py-2" placeholder="chat id" value={tgChat} onChange={(e) => setTgChat(e.target.value)} />
                <textarea className="w-full rounded border border-line bg-paper px-3 py-2" rows={3} value={tgText} onChange={(e) => setTgText(e.target.value)} />
                <button type="button" onClick={simulateTg} className="rounded border border-line px-3 py-1.5">
                  Симулировать
                </button>
              </div>
            )}
          </div>
        )}

        {channel?.type === "email" && (
          <div className="mt-6 space-y-3 text-sm">
            {owner ? (
              <>
                <p className="break-all text-xs text-muted">Приём: {channel.ingestUrl || channel.webhookUrl}</p>
                {channel.mailto && (
                  <p className="break-all text-xs text-muted">
                    mailto: <a className="link" href={channel.mailto}>{channel.fromAddress}</a>
                  </p>
                )}
                <label className="block">
                  Адрес ящика (From / mailto)
                  <input
                    className="mt-1 w-full rounded border border-line bg-paper px-3 py-2"
                    value={fromAddress}
                    onChange={(e) => setFromAddress(e.target.value)}
                    placeholder="inbox@example.com"
                  />
                </label>
                <label className="block">
                  SMTP хост (пусто — ответ только во входящих)
                  <input
                    className="mt-1 w-full rounded border border-line bg-paper px-3 py-2"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.example.com"
                  />
                </label>
                <label className="block">
                  SMTP порт
                  <input
                    className="mt-1 w-full rounded border border-line bg-paper px-3 py-2"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                  />
                </label>
                <label className="block">
                  SMTP логин
                  <input
                    className="mt-1 w-full rounded border border-line bg-paper px-3 py-2"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                  />
                </label>
                <label className="block">
                  SMTP пароль
                  <input
                    type="password"
                    className="mt-1 w-full rounded border border-line bg-paper px-3 py-2"
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder={channel.hasToken ? "•••• сохранён" : ""}
                  />
                </label>
                <p className="text-muted">Сниппет form-to-mailbox (POST JSON from/subject/text)</p>
                <textarea readOnly className="h-40 w-full rounded border border-line bg-paper p-3 font-mono text-xs" value={channel.snippet ?? ""} />
                <button type="button" onClick={copySnippet} className="rounded border border-line px-3 py-1.5">
                  Копировать сниппет
                </button>
                <div className="space-y-2 border-t border-line pt-3">
                  <p className="text-muted">Симуляция входящего письма</p>
                  <input
                    className="w-full rounded border border-line bg-paper px-3 py-2"
                    placeholder="from"
                    value={mailFrom}
                    onChange={(e) => setMailFrom(e.target.value)}
                  />
                  <input
                    className="w-full rounded border border-line bg-paper px-3 py-2"
                    placeholder="тема"
                    value={mailSubject}
                    onChange={(e) => setMailSubject(e.target.value)}
                  />
                  <textarea
                    className="w-full rounded border border-line bg-paper px-3 py-2"
                    rows={3}
                    value={mailText}
                    onChange={(e) => setMailText(e.target.value)}
                  />
                  <button type="button" onClick={simulateEmail} className="rounded border border-line px-3 py-1.5">
                    Симулировать
                  </button>
                </div>
              </>
            ) : (
              <p className="text-muted">Секреты почты скрыты. Работайте во входящих.</p>
            )}
          </div>
        )}

        {process && (
          <div className="mt-6 space-y-3 text-sm">
            <label className="block">
              Модель на процессе
              <select
                className="mt-1 w-full rounded border border-line bg-paper px-3 py-2"
                value={modelVal}
                onChange={(e) => setModelVal(e.target.value)}
                disabled={!owner}
              >
                <option value="">Не выбрана — срочно человек (дефолт воркспейса)</option>
                {models.map((m) => (
                  <option key={`${m.provider}:${m.model}`} value={`${m.provider}:${m.model}`} disabled={!m.available}>
                    {m.label}
                    {!m.available ? " (нет ключа)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted">
              {process.type === "client_ping"
                ? "Пинг после SLA. Черновик всегда. В чат уходит сам только если здесь выбрана явная модель. Дефолт воркспейса — срочно менеджеру, без автоотправки."
                : "Пусто = дефолт воркспейса и сразу менеджеру. Явная модель — без авто-срочности, пока не упадёт."}
            </p>
            <label className="block">
              Промт
              <textarea className="mt-1 w-full rounded border border-line bg-paper px-3 py-2" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={!owner} />
            </label>
          </div>
        )}

        {block.type === "action" && (
          <p className="mt-6 text-sm text-muted">
            {block.config.actionType === "create_lead"
              ? "Форма всегда создаёт контакт и лид «Новый», даже если parse упал."
              : "Черновик виден в карточке. В мессенджер — только после кнопки «Отправить»."}
          </p>
        )}

        {block.lastError && <p className="mt-4 text-sm text-urgent">Ошибка слота: {block.lastError}</p>}
        {msg && /ок|сохран|скопир|ушла|сообщение|webhook|письм|входящ/i.test(msg) && (
          <p className="ok-banner mt-4 rounded px-3 py-2 text-sm">{msg}</p>
        )}
        {msg && !/ок|сохран|скопир|ушла|сообщение|webhook|письм|входящ/i.test(msg) && <p className="mt-4 text-sm text-urgent">{msg}</p>}

        {owner && (
          <div className="mt-8 flex flex-wrap gap-2">
            <button onClick={() => save()} className="rounded bg-accent px-4 py-2 text-ink">
              Сохранить
            </button>
            {channel && (
              <button onClick={test} className="rounded border border-line px-4 py-2">
                Тест
              </button>
            )}
            <button onClick={remove} className="rounded px-4 py-2 text-urgent">
              Убрать слот
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
