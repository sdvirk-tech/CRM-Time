const INCOTERMS = ["EXW", "FOB", "FCA", "CIF", "CIP", "CFR", "DAP", "DDP", "CPT", "FAS", "DPU"];

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

export function validatePhone(raw: string): string | null {
  return normalizePhone(raw) ? null : "Укажите телефон (10–15 цифр)";
}

/** ТН ВЭД: 10 цифр, глава 01–97 кроме 77. */
export function validateTnved(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 10) return "ТН ВЭД — 10 цифр";
  const chapter = Number(digits.slice(0, 2));
  if (chapter < 1 || chapter > 97 || chapter === 77) return "Глава ТН ВЭД должна быть 01–97, кроме 77";
  return null;
}

export function validateIncoterms(raw: string): string | null {
  const v = raw.trim().toUpperCase();
  if (!INCOTERMS.includes(v)) return `Incoterms: ${INCOTERMS.join(", ")}`;
  return null;
}

export function validateContainer(raw: string): string | null {
  const v = raw.trim().toUpperCase().replace(/\s/g, "");
  if (!/^[A-Z]{3}U\d{7}$/.test(v)) return "Контейнер: 4 буквы (последняя U) и 7 цифр, например MSKU1234567";
  return null;
}

export function validateField(fieldType: string, value: string, required: boolean): string | null {
  const v = value.trim();
  if (!v) return required ? "Обязательное поле" : null;
  switch (fieldType) {
    case "phone":
      return validatePhone(v);
    case "tnved":
      return validateTnved(v);
    case "incoterms":
      return validateIncoterms(v);
    case "container":
      return validateContainer(v);
    case "number":
      return Number.isFinite(Number(v.replace(",", "."))) ? null : "Нужно число";
    default:
      return null;
  }
}

export const incotermsList = INCOTERMS;
