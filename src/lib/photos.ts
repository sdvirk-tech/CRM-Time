export type PhotoRef = {
  href: string;
  kind: "upload" | "url" | "telegram";
  label: string;
};

const PHOTO_RE =
  /(?:фото:\s*)?(file_id:[A-Za-z0-9_\-]+|\/uploads\/[A-Za-z0-9._\-]+|https?:\/\/[^\s;,]+\.(?:jpe?g|png|webp|gif)(?:\?[^\s;,]*)?)/gi;

export function extractPhotoRefs(text?: string | null): PhotoRef[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: PhotoRef[] = [];
  const re = new RegExp(PHOTO_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[1] || m[0];
    const href = raw.replace(/^фото:\s*/i, "").trim().replace(/[.,;]+$/, "");
    if (!href || seen.has(href)) continue;
    seen.add(href);
    if (href.startsWith("file_id:")) {
      const id = href.slice("file_id:".length);
      out.push({
        href: `/api/media/telegram?file_id=${encodeURIComponent(id)}`,
        kind: "telegram",
        label: "фото Telegram",
      });
    } else if (href.startsWith("/uploads/")) {
      out.push({ href, kind: "upload", label: href.split("/").pop() || "фото" });
    } else {
      out.push({ href, kind: "url", label: "фото" });
    }
  }
  return out;
}
