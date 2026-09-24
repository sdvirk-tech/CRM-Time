export type WorkHoursConfig = {
  enabled: boolean;
  start: string;
  end: string;
  tz: string;
};

function parseHm(raw: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function formatHm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isWithinWorkHours(cfg: WorkHoursConfig, at: Date = new Date()) {
  if (!cfg.enabled) return true;
  const start = parseHm(cfg.start);
  const end = parseHm(cfg.end);
  if (start === null || end === null) return true;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: cfg.tz || "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const nowMin = hour * 60 + minute;
  if (start === end) return true;
  if (start < end) return nowMin >= start && nowMin < end;
  return nowMin >= start || nowMin < end;
}

export function outsideHoursReply(cfg: WorkHoursConfig) {
  const start = parseHm(cfg.start);
  const label = start !== null ? formatHm(start) : cfg.start || "09:00";
  return `мы на связи с ${label}`;
}

export function workHoursFromWorkspace(ws: {
  workHoursEnabled?: boolean;
  workHoursStart?: string;
  workHoursEnd?: string;
  workHoursTz?: string;
}): WorkHoursConfig {
  return {
    enabled: Boolean(ws.workHoursEnabled),
    start: ws.workHoursStart || "09:00",
    end: ws.workHoursEnd || "18:00",
    tz: ws.workHoursTz || "Europe/Moscow",
  };
}
