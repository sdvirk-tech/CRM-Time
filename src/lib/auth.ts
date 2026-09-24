import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { appSecret, deployMode } from "./env";
import { NextResponse } from "next/server";

export type Session = {
  userId: string;
  workspaceId: string;
  role: "owner" | "manager";
  name: string;
  email: string;
};

const cookieName = "crm_session";

function secretKey() {
  return new TextEncoder().encode(appSecret());
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT(s)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secretKey());
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.userId || payload.workspaceId === undefined || payload.workspaceId === null || !payload.role) {
      return null;
    }
    return {
      userId: String(payload.userId),
      workspaceId: String(payload.workspaceId),
      role: payload.role === "owner" ? "owner" : "manager",
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
    };
  } catch {
    return null;
  }
}

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 14,
};

export async function applySessionCookie(res: NextResponse, session: Session) {
  const token = await signSession(session);
  res.cookies.set(cookieName, token, cookieOpts);
  return res;
}

export async function setSessionCookie(session: Session) {
  const token = await signSession(session);
  const jar = await cookies();
  jar.set(cookieName, token, cookieOpts);
}

export function clearSessionOn(res: NextResponse) {
  res.cookies.set(cookieName, "", { ...cookieOpts, maxAge: 0 });
  return res;
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(cookieName);
}

export async function jsonWithSession(data: object, session: Session, status = 200) {
  const res = NextResponse.json(data, { status });
  await applySessionCookie(res, session);
  return res;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function requireSession(): Promise<Session> {
  const s = await readSession();
  if (!s) {
    throw Object.assign(new Error("unauthorized"), { status: 401 });
  }
  return s;
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function requireOwner(): Promise<Session> {
  const s = await requireSession();
  if (s.role !== "owner") {
    throw Object.assign(new Error("forbidden"), { status: 403 });
  }
  return s;
}

export function publicRegistrationOpen(): boolean {
  return deployMode() !== "box";
}

export async function userCount() {
  return prisma.user.count();
}

const LOGIN_FAIL_LIMIT = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

export async function attemptLogin(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { memberships: true },
  });
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false as const, status: 429, error: "Слишком много попыток. Подождите 15 минут." };
  }
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    if (user) {
      const fails = user.loginFailCount + 1;
      const locked = fails >= LOGIN_FAIL_LIMIT;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginFailCount: fails,
          lockedUntil: locked ? new Date(Date.now() + LOGIN_LOCK_MS) : null,
        },
      });
      if (locked) {
        return { ok: false as const, status: 429, error: "Слишком много попыток. Подождите 15 минут." };
      }
    }
    return { ok: false as const, status: 401, error: "Неверная почта или пароль" };
  }
  if (user.loginFailCount || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { loginFailCount: 0, lockedUntil: null },
    });
  }
  return { ok: true as const, user };
}
