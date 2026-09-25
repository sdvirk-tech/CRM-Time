import { z } from "zod";

export const inboxQuerySchema = z.object({
  view: z.enum(["active", "archived", "snoozed"]).optional(),
  filter: z.enum(["all", "unread", "urgent", "stale"]).optional(),
  channel: z.enum(["all", "web_form", "web_chat", "telegram", "email"]).optional(),
  status: z.enum(["all", "ai", "manager", "closed"]).optional(),
  overdueTasks: z.boolean().optional(),
});

export const leadsQuerySchema = z.object({
  tag: z.string().optional(),
  urgentOnly: z.boolean().optional(),
  overdueTasks: z.boolean().optional(),
  status: z.enum(["all", "new", "in_progress", "qualified", "rejected"]).optional(),
});

export type InboxQuery = z.infer<typeof inboxQuerySchema>;
export type LeadsQuery = z.infer<typeof leadsQuerySchema>;

export function parseSavedQuery(screen: string, raw: unknown) {
  if (screen === "inbox") return inboxQuerySchema.parse(raw);
  if (screen === "leads") return leadsQuerySchema.parse(raw);
  throw new Error("Неизвестный экран");
}
