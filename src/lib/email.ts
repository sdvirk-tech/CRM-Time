import net from "node:net";
import tls from "node:tls";
import { decryptSecret, encryptSecret } from "./crypto";

export type EmailSecrets = {
  fromAddress?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
};

export function parseEmailSecrets(enc?: string | null): EmailSecrets {
  if (!enc) return {};
  try {
    const raw = decryptSecret(enc);
    const parsed = JSON.parse(raw) as EmailSecrets;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* не JSON — не почта */
  }
  return {};
}

export function encodeEmailSecrets(s: EmailSecrets) {
  return encryptSecret(JSON.stringify(s));
}

export function emailFromSecrets(enc?: string | null) {
  return parseEmailSecrets(enc).fromAddress || "";
}

function readLine(socket: net.Socket) {
  return new Promise<string>((resolve, reject) => {
    const onData = (buf: Buffer) => {
      socket.off("error", onErr);
      resolve(buf.toString("utf8"));
    };
    const onErr = (e: Error) => {
      socket.off("data", onData);
      reject(e);
    };
    socket.once("data", onData);
    socket.once("error", onErr);
  });
}

async function cmd(socket: net.Socket, line: string) {
  socket.write(line + "\r\n");
  return readLine(socket);
}

/** Короткий SMTP: 465 TLS или 25/587 без STARTTLS. Нет хоста — пропускаем. */
export async function sendSmtp(opts: {
  host: string;
  port?: number;
  user?: string;
  pass?: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!opts.host || !opts.from || !opts.to) return { ok: false, error: "нет SMTP" };
  const port = opts.port || 465;
  const timeout = 8000;
  try {
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const onErr = (e: Error) => reject(e);
      const s =
        port === 465
          ? tls.connect({ host: opts.host, port, servername: opts.host, rejectUnauthorized: false }, () => resolve(s))
          : net.connect({ host: opts.host, port }, () => resolve(s));
      s.setTimeout(timeout, () => {
        s.destroy();
        reject(new Error("SMTP timeout"));
      });
      s.once("error", onErr);
    });
    await readLine(socket);
    await cmd(socket, `EHLO crm-time`);
    if (opts.user && opts.pass) {
      await cmd(socket, "AUTH LOGIN");
      await cmd(socket, Buffer.from(opts.user).toString("base64"));
      const auth = await cmd(socket, Buffer.from(opts.pass).toString("base64"));
      if (!/^235/.test(auth)) {
        socket.end();
        return { ok: false, error: auth.slice(0, 180) };
      }
    }
    await cmd(socket, `MAIL FROM:<${opts.from}>`);
    const rcpt = await cmd(socket, `RCPT TO:<${opts.to}>`);
    if (!/^25/.test(rcpt)) {
      socket.end();
      return { ok: false, error: rcpt.slice(0, 180) };
    }
    await cmd(socket, "DATA");
    const payload = [
      `From: ${opts.from}`,
      `To: ${opts.to}`,
      `Subject: ${opts.subject.replace(/\r?\n/g, " ")}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      opts.text,
      ".",
    ].join("\r\n");
    const data = await cmd(socket, payload);
    await cmd(socket, "QUIT").catch(() => "");
    socket.end();
    return /^25/.test(data) ? { ok: true } : { ok: false, error: data.slice(0, 180) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "SMTP не отправил" };
  }
}
