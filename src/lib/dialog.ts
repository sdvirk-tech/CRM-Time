export function isStartCommand(body: string): boolean {
  return /^\/start\b/i.test(body.trim());
}

export function wantsManager(body: string): boolean {
  const t = body.toLowerCase();
  return (
    /хочу\s+менеджер/.test(t) ||
    /позовите\s+(менеджер|оператор|человек)/.test(t) ||
    /переведите\s+(на\s+)?(менеджер|оператор|человек)/.test(t) ||
    /нужен\s+(живой\s+)?(менеджер|оператор)/.test(t) ||
    /живой\s+оператор/.test(t) ||
    /свяжите\s+с\s+менеджер/.test(t)
  );
}

export function sanitizeModelText(text: string): string {
  let t = text.replace(/\r\n/g, "\n");
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, "");
  t = t.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  t = t.replace(/```(?:thinking|reason(?:ing)?)[\s\S]*?```/gi, "");
  t = t.replace(/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g, "[токен]");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

export function defaultGreeting(): string {
  return "Здравствуйте! Напишите задачу или попросите менеджера.";
}
