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
  hasToken: boolean;
  enabled: boolean;
  topicId?: string | null;
  allowedOrigins: string[];
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
  { kind: "ai_parse", group: "AI", label: "Разобрать входящее" },
  { kind: "ai_draft", group: "AI", label: "Черновик ответа" },
  { kind: "ai_deep", group: "AI", label: "Глубокий анализ" },
  { kind: "action_create_lead", group: "Действие", label: "Создать лид" },
  { kind: "action_show_draft", group: "Действие", label: "Показать черновик" },
];

export default function FlowPage() {
  const [data, setData] = useState<{
    blocks: Block[];
    channels: Channel[];
    processes: Process[];
    models: Model[];
    deepAnalysisEnabled: boolean;
    role: string;
    defaultModel: string | null;
    greeting: string;
    topics: Topic[];
    publicUrl?: string;
    preview?: string;
    compact?: string;
  } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"chain" | "models">("chain");

  const load = useCallback(async () => {
    const res = await fetch("/api/flow");
    setData(await res.json());
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
      body: JSON.stringify({ kind }),
    });
    await load();
  }

  async function saveDefault(value: string) {
    await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultModel: value || null }),
    });
    await load();
  }

  async function saveGreeting(value: string) {
    await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ greeting: value }),
    });
    await load();
  }

  async function pingModel() {
    const raw = data?.defaultModel || "mock:ok";
    const [provider, ...rest] = raw.split(":");
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model: rest.join(":") || "ok" }),
    });
    const json = await res.json();
    setNotice(res.ok ? `Модель отвечает: ${json.preview}` : json.error || "Модель не ответила");
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
            <p className="mt-2 max-w-2xl text-muted">
              Слоты только по порядку, без веток. Превью: <span className="text-ink">{data.preview || preview}</span>
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
              <button type="button" onClick={pingModel} className="mt-3 rounded bg-accent px-4 py-2 text-sm text-ink">
                Проверить запуск модели
              </button>
            )}
            {notice && tab === "models" && /отвечает|ок/i.test(notice) && (
              <p className="ok-banner mt-3 inline-block rounded px-3 py-2 text-sm">{notice}</p>
            )}
            <table className="mt-6 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-mist text-left text-ink">
                  <th className="py-2 font-medium">Процесс</th>
                  <th className="py-2 font-medium">Модель</th>
                  <th className="py-2 font-medium">Режим</th>
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
                  </tr>
                ))}
                {data.processes.length === 0 && (
                  <tr>
                    <td className="py-3 text-muted" colSpan={3}>
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
          owner={owner}
          onClose={() => setOpenId(null)}
          onSaved={async () => {
            await load();
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
    setMsg(res.ok ? (data.username ? `Ок, бот @${data.username}` : "Тестовая заявка ушла во входящие и в лиды") : data.error);
    await onSaved();
  }

  async function reregisterWebhook() {
    if (!channel) return;
    const res = await fetch(`/api/channels/${channel.id}/webhook`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) setMsg(data.error || "Ошибка webhook");
    else if (data.ok) setMsg(`Webhook: ${data.description || "зарегистрирован"}`);
    else setMsg(data.description || data.error || "Telegram не принял URL — нужен HTTPS PUBLIC_URL");
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
              </>
            )}
            {owner && (
              <button type="button" onClick={reregisterWebhook} className="rounded border border-accent bg-paper px-3 py-1.5">
                Перерегистрировать webhook
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
              Пусто = дефолт воркспейса и сразу менеджеру. Явная модель — без авто-срочности, пока не упадёт.
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
        {msg && /ок|сохран|скопир|ушла|сообщение|webhook/i.test(msg) && (
          <p className="ok-banner mt-4 rounded px-3 py-2 text-sm">{msg}</p>
        )}
        {msg && !/ок|сохран|скопир|ушла|сообщение|webhook/i.test(msg) && <p className="mt-4 text-sm text-urgent">{msg}</p>}

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
