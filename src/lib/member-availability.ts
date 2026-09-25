export type MemberAvailability = "online" | "away" | "busy";

const LABELS: Record<MemberAvailability, string> = {
  online: "На линии",
  away: "Отошёл",
  busy: "Занят",
};

export function asAvailability(raw: string | null | undefined): MemberAvailability {
  if (raw === "away" || raw === "busy") return raw;
  return "online";
}

export function availabilityLabel(raw: string | null | undefined) {
  return LABELS[asAvailability(raw)];
}

/** Свободен для пула / автоназначения. */
export function isAssignable(raw: string | null | undefined) {
  return asAvailability(raw) === "online";
}
