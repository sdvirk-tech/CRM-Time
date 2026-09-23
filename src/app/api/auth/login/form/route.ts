import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applySessionCookie, jsonError, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") || "").toLowerCase();
  const password = String(form.get("password") || "");
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: true },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return jsonError("Неверная почта или пароль", 401);
  }
  const membership = user.memberships[0];
  const origin = req.headers.get("origin") || `http://${req.headers.get("host")}`;
  const dest = new URL(membership ? "/flow" : "/onboard", origin);
  const res = NextResponse.redirect(dest, 303);
  await applySessionCookie(res, {
    userId: user.id,
    workspaceId: membership?.workspaceId ?? "",
    role: membership?.role === "owner" ? "owner" : membership ? "manager" : "owner",
    name: user.name,
    email: user.email,
  });
  return res;
}
