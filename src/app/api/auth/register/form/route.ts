import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  applySessionCookie,
  hashPassword,
  jsonError,
  publicRegistrationOpen,
  userCount,
} from "@/lib/auth";
import { deployMode } from "@/lib/env";

export async function POST(req: Request) {
  const form = await req.formData();
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").toLowerCase();
  const password = String(form.get("password") || "");
  if (name.length < 2 || !email.includes("@") || password.length < 6) {
    return jsonError("Проверьте имя, почту и пароль (от 6 символов)");
  }
  const count = await userCount();
  if ((!publicRegistrationOpen() && count > 0) || (deployMode() === "box" && count > 0)) {
    return jsonError("В режиме коробки публичная регистрация выключена", 403);
  }
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return jsonError("Такая почта уже есть");
  const user = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password) },
  });
  const origin = req.headers.get("origin") || `http://${req.headers.get("host")}`;
  const res = NextResponse.redirect(new URL("/onboard", origin), 303);
  await applySessionCookie(res, {
    userId: user.id,
    workspaceId: "",
    role: "owner",
    name: user.name,
    email: user.email,
  });
  return res;
}
