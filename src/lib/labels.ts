export function sourceLabel(source: string, variant: "short" | "long" = "short") {
  if (source === "web_form") return variant === "long" ? "форма сайта" : "сайт";
  if (source === "web_chat") return variant === "long" ? "чат сайта" : "чат";
  return "Telegram";
}

export function leadStatusLabel(status: string) {
  if (status === "new") return "Новый";
  if (status === "in_progress") return "В работе";
  if (status === "qualified") return "Квалифицирован";
  if (status === "lost" || status === "rejected") return "Отказ";
  return status;
}

export function channelLabel(type: string) {
  if (type === "web_form") return "форма";
  if (type === "web_chat") return "чат";
  return "Telegram";
}

export function urgentReasonLabel(reason: string | null | undefined) {
  if (reason === "default_model") return "дефолт модели — человек в контуре";
  if (reason === "ai_error") return "сбой модели";
  if (reason === "handoff") return "клиент просит человека";
  if (reason === "ai_limit") return "лимит черновиков ИИ";
  if (reason === "silent_client") return "клиент молчит — пинг";
  return "";
}
