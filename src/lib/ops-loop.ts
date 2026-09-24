import { runFollowups } from "./ping";
import { pollTelegramChannels } from "./telegram-poll";
import { pollImapInbox } from "./imap";

const g = globalThis as unknown as { __crmOpsLoop?: ReturnType<typeof setInterval> };

export async function runOpsTick(workspaceId?: string) {
  const followups = await runFollowups(workspaceId);
  const poll = await pollTelegramChannels();
  const imap = await pollImapInbox().catch((e) => ({ error: e instanceof Error ? e.message : "IMAP" }));
  return { followups, poll, imap };
}

export function startOpsLoop() {
  if (g.__crmOpsLoop) return;
  g.__crmOpsLoop = setInterval(() => {
    runOpsTick().catch(() => {});
  }, 20_000);
  g.__crmOpsLoop.unref?.();
}
