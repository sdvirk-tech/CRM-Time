"use client";

import { CannedManager } from "@/components/CannedManager";

type Model = { provider: string; model: string; label: string; available: boolean };

export default function SettingsPage() {
  const [role, setRole] = useState("");
  const [sla, setSla] = useState("15");
  const [pingEnabled, setPingEnabled] = useState(true);
  const [routingMode, setRoutingMode] = useState<"pool" | "round_robin">("pool");
  const [defaultModel, setDefaultModel] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [box, setBox] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const [ws, me] = await Promise.all([fetch("/api/workspace").then((r) => r.json()), fetch("/api/auth/me").then((r) => r.json())]);
    setSla(String(ws.slaMinutes ?? 15));
    setPingEnabled(ws.pingEnabled !== false);
    if (ws.routingMode === "round_robin" || ws.routingMode === "pool") setRoutingMode(ws.routingMode);
    setDefaultModel(ws.defaultModel || "");
    setModels(ws.models || []);
    setBox(Boolean(ws.dataOnThisMachine) || me.deployMode === "box");
    setRole(me.user?.role || "");
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
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMsg(data.error || "Ошибка");
    else setMsg("Сохранили");
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
          <button className="rounded-xl bg-accent px-4 py-2 text-ink">Сохранить</button>
        )}
        {msg && <p className="ok-banner rounded px-3 py-2 text-sm">{msg}</p>}
      </form>
      <CannedManager />
    </main>
  );
}
