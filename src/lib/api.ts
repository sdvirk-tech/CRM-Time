import { NextResponse } from "next/server";
import { jsonError, requireOwner, requireSession, type Session } from "./auth";

export async function withSession(
  handler: (session: Session) => Promise<NextResponse>,
) {
  try {
    const session = await requireSession();
    return await handler(session);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : "Ошибка";
    if (status === 401) return jsonError("Нужен вход", 401);
    if (status === 403) return jsonError("Недостаточно прав", 403);
    return jsonError(message, status);
  }
}

export async function withOwner(handler: (session: Session) => Promise<NextResponse>) {
  try {
    const session = await requireOwner();
    return await handler(session);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    const message = e instanceof Error ? e.message : "Ошибка";
    if (status === 401) return jsonError("Нужен вход", 401);
    if (status === 403) return jsonError("Недостаточно прав", 403);
    return jsonError(message, status);
  }
}
