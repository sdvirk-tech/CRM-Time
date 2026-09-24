export function sourceLabel(source: string, variant: "short" | "long" = "short") {
  if (source === "web_form") return variant === "long" ? "форма сайта" : "сайт";
  if (source === "web_chat") return variant === "long" ? "чат сайта" : "чат";
  if (source === "email") return variant === "long" ? "почта" : "почта";
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
  if (type === "email") return "почта";
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

export function activityLabel(event: string) {
  if (event === "message" || event === "ingest") return "сообщение";
  if (event === "send" || event === "reply") return "отправка";
  if (event === "status") return "статус";
  if (event === "merge") return "склейка";
  if (event === "consent") return "согласие";
  if (event === "note") return "внутренняя заметка";
  if (event === "tag") return "метка";
  if (event === "take") return "взяли";
  if (event === "close") return "закрыли";
  if (event === "webhook") return "webhook";
  if (event === "task") return "задача";
  if (event === "pin") return "закрепили";
  if (event === "import") return "импорт";
  return event;
}
