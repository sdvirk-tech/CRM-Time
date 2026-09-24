import { extractCargoFromText, formatItogo, isCardComplete, nextAsk, missingCardSlots } from "./sales";
import { env } from "./env";
import { sanitizeModelText } from "./dialog";

export type ModelOption = {
  provider: string;
  model: string;
  label: string;
  available: boolean;
  envKey?: string;
};

type ProviderDef = {
  id: string;
  label: string;
  envKey: string;
  baseUrlEnv: string;
  defaultBase: string;
  modelsEnv: string;
  defaultModels: string[];
};

const PROVIDERS: ProviderDef[] = [
  {
    id: "jev",
    label: "JEV",
    envKey: "JEV_API_KEY",
    baseUrlEnv: "JEV_BASE_URL",
    defaultBase: "https://api.jev.ai/v1",
    modelsEnv: "JEV_MODELS",
    defaultModels: ["jev-lite", "jev-pro"],
  },
  {
    id: "qwen",
    label: "Qwen",
    envKey: "QWEN_API_KEY",
    baseUrlEnv: "QWEN_BASE_URL",
    defaultBase: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelsEnv: "QWEN_MODELS",
    defaultModels: ["qwen-plus"],
  },
  {
    id: "openai",
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    baseUrlEnv: "OPENAI_BASE_URL",
    defaultBase: "https://api.openai.com/v1",
    modelsEnv: "OPENAI_MODELS",
    defaultModels: ["gpt-4o-mini"],
  },
];

export function listModels(): ModelOption[] {
  const out: ModelOption[] = [
    { provider: "mock", model: "ok", label: "Тест (мок A)", available: true },
    { provider: "mock", model: "ok-b", label: "Тест (мок B, черновик)", available: true },
    { provider: "mock", model: "fail", label: "Тест (сбой модели)", available: true },
  ];
  for (const p of PROVIDERS) {
    const key = env(p.envKey);
    const models = (env(p.modelsEnv) || p.defaultModels.join(","))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const m of models) {
      out.push({
        provider: p.id,
        model: m,
        label: `${p.label} · ${m}`,
        available: Boolean(key),
        envKey: p.envKey,
      });
    }
  }
  return out;
}

export function modelAvailable(provider: string, model: string): boolean {
  return listModels().some((m) => m.provider === provider && m.model === model && m.available);
}

export function deepAnalysisEnabled(): boolean {
  return Boolean(env("QWEN_API_KEY") || env("JEV_API_KEY") || env("OPENAI_API_KEY"));
}

function parseBinding(raw: string | null | undefined): { provider: string; model: string } | null {
  if (!raw) return null;
  const [provider, ...rest] = raw.split(":");
  const model = rest.join(":");
  if (!provider || !model) return null;
  return { provider, model };
}

export function formatBinding(provider: string, model: string) {
  return `${provider}:${model}`;
}

async function completeOpenAiCompatible(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
}): Promise<string> {
  const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Модель ${opts.model}: ${res.status} ${text.slice(0, 240)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Пустой ответ модели");
  return sanitizeModelText(content);
}

export async function runModel(opts: {
  provider: string;
  model: string;
  system: string;
  user: string;
}): Promise<string> {
  if (opts.provider === "mock") {
    if (opts.model === "fail") throw new Error("Искусственный сбой модели (mock:fail)");
    const isB = opts.model === "ok-b";
    if (opts.system.includes("ROLE=parse_cargo_json")) {
      const cargo = extractCargoFromText(opts.user);
      const ready = isCardComplete(cargo);
      return sanitizeModelText(
        JSON.stringify({
          name: cargo.name ?? null,
          phone: cargo.phone ?? null,
          telegram: cargo.telegram ?? null,
          max: cargo.max ?? null,
          cargo: cargo.cargo ?? null,
          weight: cargo.weight ?? null,
          volume: cargo.volume ?? null,
          origin: cargo.origin ?? null,
          destination: cargo.destination ?? null,
          route: cargo.route ?? null,
          eta: cargo.eta ?? null,
          ready,
          summary: cargo.summary || opts.user.slice(0, 180),
          fields: {
            ...(cargo.telegram ? { telegram: cargo.telegram } : {}),
            ...(cargo.max ? { max: cargo.max } : {}),
            ...(cargo.cargo ? { cargo: cargo.cargo } : {}),
            ...(cargo.weight ? { weight: cargo.weight } : {}),
            ...(cargo.volume ? { volume: cargo.volume } : {}),
            ...(cargo.origin ? { origin: cargo.origin } : {}),
            ...(cargo.destination ? { destination: cargo.destination } : {}),
            ...(cargo.route ? { route: cargo.route } : {}),
            ...(cargo.eta ? { eta: cargo.eta } : {}),
          },
        }),
      );
    }
    const byBook = opts.system.includes("--- знания ---") ? "По методике. " : "";
    const tag = isB ? "модель B. " : "";
    const sales = /Ты МАКС|код ТН ВЭД|карточка/i.test(opts.system);
    if (sales) {
      const byCardAsk = opts.system.match(/Спроси следующее одним предложением:\s*([^\n]+)/);
      if (byCardAsk && /Нет:/.test(opts.system) && !/Всё собрано/.test(opts.system)) {
        return sanitizeModelText(`<think>не клиенту</think>${byBook}${tag}${byCardAsk[1]}`);
      }
      const cargo = extractCargoFromText(opts.user);
      const missing = missingCardSlots(cargo);
      if (/Всё собрано/.test(opts.system) || missing.length === 0) {
        return sanitizeModelText(`<think>не клиенту</think>${byBook}${tag}${formatItogo(cargo)}`);
      }
      if (!cargo.cargo && !cargo.weight && !cargo.route && missing.includes("cargo")) {
        return sanitizeModelText(
          `<think>не клиенту</think>${byBook}${tag}Здравствуйте! Помогу предварительно определить код ТН ВЭД. Опишите товар, пришлите ссылку или фото.`,
        );
      }
      return sanitizeModelText(`<think>не клиенту</think>${byBook}${tag}${nextAsk(missing)}`);
    }
    return sanitizeModelText(
      `<think>не клиенту</think>${byBook}${tag}Здравствуйте! Спасибо за обращение. Мы получили: «${opts.user.slice(0, 120)}». Уточните, пожалуйста, удобное время для связи.`,
    );
  }

  const def = PROVIDERS.find((p) => p.id === opts.provider);
  if (!def) throw new Error(`Неизвестный провайдер ${opts.provider}`);
  const apiKey = env(def.envKey);
  if (!apiKey) throw new Error(`Нет ключа ${def.envKey}`);
  return completeOpenAiCompatible({
    baseUrl: env(def.baseUrlEnv, def.defaultBase),
    apiKey,
    model: opts.model,
    system: opts.system,
    user: opts.user,
  });
}

export { parseBinding };
