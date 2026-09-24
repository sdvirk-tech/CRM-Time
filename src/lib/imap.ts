import net from "node:net";
import tls from "node:tls";
import { prisma } from "./prisma";
import { ingestInbound } from "./pipeline";

function env(name: string) {
  return (process.env[name] || "").trim();
}

function extractHeader(raw: string, name: string) {
  const re = new RegExp(`^${name}:\\s*(.+)$`, "im");
  const m = raw.match(re);
  return m ? m[1].replace(/\r/g, "").trim() : "";
}

function extractEmail(from: string) {
  const m = from.match(/<([^>]+)>/) || from.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  return (m?.[1] || from).trim().toLowerCase();
}

async function connect(host: string, port: number) {
  return new Promise<net.Socket>((resolve, reject) => {
    const s =
      port === 143
        ? net.connect({ host, port }, () => resolve(s))
        : tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => resolve(s));
    s.setTimeout(8000, () => {
      s.destroy();
      reject(new Error("IMAP timeout"));
    });
    s.once("error", reject);
  });
}

function quote(s: string) {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function readUntilTagged(socket: net.Socket, tag: string) {
  let buf = "";
  return new Promise<string>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      if (new RegExp(`^${tag} `, "m").test(buf)) {
        cleanup();
        resolve(buf);
      }
    };
    const onErr = (e: Error) => {
      cleanup();
      reject(e);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onErr);
    };
    socket.on("data", onData);
    socket.once("error", onErr);
  });
}

async function tagged(socket: net.Socket, tag: string, line: string) {
  socket.write(`${tag} ${line}\r\n`);
  return readUntilTagged(socket, tag);
}

export async function pollImapInbox(): Promise<{
  skipped?: boolean;
  reason?: string;
  ingested?: number;
  error?: string;
}> {
  const host = env("IMAP_HOST");
  const user = env("IMAP_USER");
  const pass = env("IMAP_PASS");
  if (!host || !user || !pass) return { skipped: true, reason: "no IMAP_*" };
  const port = Number(env("IMAP_PORT") || "993");
  const mailbox = env("IMAP_MAILBOX") || "INBOX";
  const publicKey = env("IMAP_CHANNEL_KEY");
  const channel = publicKey
    ? await prisma.channel.findFirst({ where: { publicKey, type: "email", enabled: true } })
    : await prisma.channel.findFirst({ where: { type: "email", enabled: true }, orderBy: { createdAt: "asc" } });
  if (!channel) return { skipped: true, reason: "no email channel" };

  let socket: net.Socket | null = null;
  try {
    socket = await connect(host, port);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("IMAP greeting timeout")), 5000);
      socket!.once("data", () => {
        clearTimeout(t);
        resolve();
      });
      socket!.once("error", reject);
    });
    const login = await tagged(socket, "a1", `LOGIN ${quote(user)} ${quote(pass)}`);
    if (!/^a1 OK/im.test(login)) throw new Error("IMAP LOGIN не ок");
    const sel = await tagged(socket, "a2", `SELECT ${mailbox}`);
    if (!/^a2 OK/im.test(sel)) throw new Error("IMAP SELECT не ок");
    const search = await tagged(socket, "a3", "SEARCH UNSEEN");
    const ids = [...(search.match(/\* SEARCH[^\r\n]*/i)?.[0].match(/\d+/g) ?? [])].slice(0, 8);
    let ingested = 0;
    for (const id of ids) {
      const fetch = await tagged(socket, `f${id}`, `FETCH ${id} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID)] BODY.PEEK[TEXT])`);
      const from = extractEmail(extractHeader(fetch, "From"));
      const subject = extractHeader(fetch, "Subject");
      const messageId = extractHeader(fetch, "Message-ID") || extractHeader(fetch, "Message-Id");
      const textMatch = fetch.match(/BODY\[TEXT\][^\r\n]*\r?\n([\s\S]*?)\n\)\s*$/im);
      let text = (textMatch?.[1] || "").replace(/\r/g, "").trim();
      if (text.length > 4000) text = text.slice(0, 4000);
      if (!from || !text) continue;
      const body = [subject && `Тема: ${subject}`, `От: ${from}`, text].filter(Boolean).join("\n");
      await ingestInbound({
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        source: "email",
        externalId: from,
        username: from,
        name: from.split("@")[0] || "Почта",
        body,
        eventKey: messageId || `imap:${id}:${Date.now()}`,
      });
      await tagged(socket, `s${id}`, `STORE ${id} +FLAGS (\\Seen)`);
      ingested += 1;
    }
    await tagged(socket, "a9", "LOGOUT").catch(() => "");
    socket.destroy();
    return { ingested };
  } catch (e) {
    socket?.destroy();
    return { error: e instanceof Error ? e.message : "IMAP ошибка" };
  }
}
