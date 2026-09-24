export function shouldMask(role?: string | null) {
  return role === "manager";
}

export function maskPhone(raw?: string | null) {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 10) return "••••";
  const tail = digits.slice(-2);
  if (digits.length >= 11) return `${digits[0]}••••••••${tail}`;
  return `••••••••${tail}`;
}

export function maskEmail(raw?: string | null) {
  if (!raw) return "";
  const v = String(raw).trim();
  const at = v.indexOf("@");
  if (at < 1) return "•••";
  return `${v[0]}•••${v.slice(at)}`;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /\+?\d[\d\s().-]{8,18}\d/g;

function looksLikePhone(digits: string) {
  if (digits.length >= 11 && digits.length <= 15) return true;
  if (digits.length === 10 && digits.startsWith("9")) return true;
  return false;
}

export function maskPii(text?: string | null) {
  if (!text) return "";
  let t = String(text).replace(EMAIL_RE, (m) => maskEmail(m));
  t = t.replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (!looksLikePhone(digits)) return m;
    return maskPhone(digits);
  });
  return t;
}

export function maskValue(role: string | undefined | null, value?: string | null) {
  if (!shouldMask(role)) return value ?? "";
  return maskPii(value);
}

export function maskPhoneIf(role: string | undefined | null, value?: string | null) {
  if (!value) return value ?? null;
  if (!shouldMask(role)) return value;
  return maskPhone(value);
}

export function maskEmailIf(role: string | undefined | null, value?: string | null) {
  if (!value) return value ?? null;
  if (!shouldMask(role)) return value;
  return maskEmail(value);
}

function maskChannel(ch: { type: string; externalId?: string; username?: string | null; [k: string]: unknown }) {
  if (ch.type !== "email") return ch;
  return {
    ...ch,
    externalId: ch.externalId ? maskEmail(ch.externalId) : ch.externalId,
    username: ch.username ? maskEmail(ch.username) : ch.username,
  };
}

function maskFields(values?: { value: string; field?: { fieldType?: string }; [k: string]: unknown }[]) {
  return (values ?? []).map((v) => ({
    ...v,
    value: v.field?.fieldType === "phone" ? maskPhone(v.value) : maskPii(v.value),
  }));
}

export function dlpContact<T>(role: string | undefined | null, contact: T): T {
  if (!shouldMask(role) || !contact || typeof contact !== "object") return contact;
  const c = contact as Record<string, unknown> & {
    phone?: string | null;
    comment?: string;
    channels?: { type: string; externalId?: string; username?: string | null }[];
    fieldValues?: { value: string; field?: { fieldType?: string } }[];
    conversations?: { messages?: { body: string }[] }[];
  };
  return {
    ...c,
    phone: c.phone ? maskPhone(c.phone) : c.phone,
    comment: c.comment ? maskPii(c.comment) : c.comment,
    channels: c.channels?.map(maskChannel),
    fieldValues: c.fieldValues ? maskFields(c.fieldValues) : c.fieldValues,
    conversations: c.conversations?.map((conv) => ({
      ...conv,
      messages: conv.messages?.map((m) => ({ ...m, body: maskPii(m.body) })),
    })),
  } as T;
}

export function dlpLead<T>(role: string | undefined | null, lead: T): T {
  if (!shouldMask(role) || !lead || typeof lead !== "object") return lead;
  const l = lead as Record<string, unknown> & {
    comment?: string;
    contact?: unknown;
    fieldValues?: { value: string; field?: { fieldType?: string } }[];
  };
  return {
    ...l,
    comment: l.comment ? maskPii(l.comment) : l.comment,
    contact: l.contact ? dlpContact(role, l.contact) : l.contact,
    fieldValues: l.fieldValues ? maskFields(l.fieldValues) : l.fieldValues,
  } as T;
}

export function dlpMessageBody(role: string | undefined | null, body?: string | null) {
  if (!shouldMask(role)) return body ?? "";
  return maskPii(body);
}

