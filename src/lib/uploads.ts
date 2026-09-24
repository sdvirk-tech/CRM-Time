import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export async function saveChatPhoto(buf: Buffer, mime: string): Promise<string> {
  if (buf.length > MAX_BYTES) throw new Error("Фото больше 2 МБ");
  const ext = ALLOWED[mime] || (buf[0] === 0x89 ? ".png" : ".jpg");
  if (!ALLOWED[mime] && ext === ".jpg" && buf[0] !== 0xff && buf[0] !== 0x89) {
    throw new Error("Нужен JPEG, PNG, WebP или GIF");
  }
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const name = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}${ext}`;
  await writeFile(path.join(dir, name), buf);
  return `/uploads/${name}`;
}

export function photoNoteFromUrl(url: string) {
  const u = url.trim();
  if (!u) return "";
  if (/^file_id:/i.test(u)) return `фото: ${u}`;
  if (u.startsWith("/uploads/")) return `фото: ${u}`;
  if (/^https?:\/\//i.test(u)) return `фото: ${u}`;
  return `фото: ${u}`;
}
