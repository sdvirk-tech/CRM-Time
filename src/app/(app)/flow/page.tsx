"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Model = { provider: string; model: string; label: string; available: boolean };
type Channel = {
  id: string;
  type: string;
  name: string;
  publicKey: string;
  snippet: string;
  formUrl: string;
  webhookUrl: string;
  hasToken: boolean;
  allowedOrigins: string[];
};
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
      <aside className="w-56 shrink-0 border-r border-line bg-[#0e1116] p-4">
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
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-pine">Цепочка</p>
            <h1 className="mt-2 text-3xl font-semibold">Куда класть и как соединять</h1>
            <p className="mt-2 max-w-2xl text-muted">
              Слоты только по порядку, без веток. Превью: <span className="text-ink">{preview}</span>
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
                      className={`slot-card px-4 py-4 text-left ${emptyModel ? "ring-1 ring-urgent" : ""}`}
                    >
                      <p className="text-[10px] uppercase tracking-wider text-muted">
                        {block.type === "channel" ? "Канал" : block.type === "ai_process" ? "AI-процесс" : "Действие"}
                      </p>
                      <p className="text-lg font-semibold">{block.label}</p>
                      {emptyModel && <p className="mt-2 text-xs font-semibold text-urgent">срочно человек</p>}
                      {proc?.binding && (
                        <p className="mt-2 text-xs text-pine">
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
            <table className="mt-6 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
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
  owner,
  onClose,
  onSaved,
}: {
  block: Block;
  channel?: Channel;
  process?: Process;
  models: Model[];
  owner: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [origins, setOrigins] = useState(channel?.allowedOrigins.join(", ") ?? "");
  const [prompt, setPrompt] = useState(process?.prompt ?? "");
  const [modelVal, setModelVal] = useState(
    process?.binding ? `${process.binding.provider}:${process.binding.model}` : "",
  );
  const [msg, setMsg] = useState("");
  const [tgChat, setTgChat] = useState("");
  const [tgText, setTgText] = useState("нужен контейнер / FCA");

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
    if (!channel) return;
    await navigator.clipboard.writeText(channel.snippet);
    setMsg("Сниппет скопирован");
  }

  async function remove() {
    await fetch(`/api/flow/blocks/${block.id}`, { method: "DELETE" });
    await onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/70">
      <div className="h-full w-full max-w-md overflow-auto border-l border-line bg-slot p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-semibold">{block.label}</h2>
          <button onClick={onClose} className="text-sm text-muted">
            Закрыть
          </button>
        </div>

        {channel?.type === "web_form" && (
          <div className="mt-6 space-y-3 text-sm">
            <p>
              Ключ формы: <code>{channel.publicKey}</code>
            </p>
            <p>
              Тестовая страница:{" "}
              <a className="text-pine underline" href={channel.formUrl} target="_blank">
                {channel.formUrl}
              </a>
            </p>
            <label className="block">
              Разрешённые домены (через запятую)
              <input className="mt-1 w-full rounded border border-line bg-paper px-3 py-2" value={origins} onChange={(e) => setOrigins(e.target.value)} disabled={!owner} />
            </label>
            <p className="text-muted">Сниппет на сайт</p>
            <textarea readOnly className="h-40 w-full rounded border border-line bg-paper p-3 font-mono text-xs" value={channel.snippet} />
            <button type="button" onClick={copySnippet} className="rounded border border-line px-3 py-1.5">
              Копировать сниппет
            </button>
          </div>
        )}

        {channel?.type === "telegram" && (
          <div className="mt-6 space-y-3 text-sm">
            {owner ? (
              <label className="block">
                Токен бота
                <input className="mt-1 w-full rounded border border-line bg-paper px-3 py-2" value={token} onChange={(e) => setToken(e.target.value)} placeholder={channel.hasToken ? "•••• сохранён" : "123:ABC"} />
              </label>
            ) : (
              <p className="text-muted">Токен бота скрыт. Работайте во входящих.</p>
            )}
            <p className="break-all text-xs text-muted">Webhook: {channel.webhookUrl}</p>
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
        {msg && <p className="mt-4 text-sm text-pine">{msg}</p>}

        {owner && (
          <div className="mt-8 flex flex-wrap gap-2">
            <button onClick={() => save()} className="rounded bg-ink px-4 py-2 text-paper">
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
