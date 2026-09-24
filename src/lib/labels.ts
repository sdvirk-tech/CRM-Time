export function sourceLabel(source: string, variant: "short" | "long" = "short") {
  if (source === "web_form") return variant === "long" ? "форма сайта" : "сайт";
  if (source === "web_chat") return variant === "long" ? "чат сайта" : "чат";
  return "Telegram";
}

export function channelLabel(type: string) {
  if (type === "web_form") return "форма";
  if (type === "web_chat") return "чат";
  return "Telegram";
}
