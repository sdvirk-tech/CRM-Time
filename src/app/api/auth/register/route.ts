import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  jsonError,
  jsonWithSession,
  publicRegistrationOpen,
  userCount,
} from "@/lib/auth";
import { deployMode } from "@/lib/env";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Проверьте имя, почту и пароль (от 6 символов)");

  const count = await userCount();
  if (!publicRegistrationOpen() && count > 0) {
    return jsonError("В режиме коробки публичная регистрация выключена", 403);
  }

  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (exists) return jsonError("Такая почта уже есть");

  if (deployMode() === "box" && count > 0) {
    return jsonError("В коробке один воркспейс — войдите или примите приглашение", 403);
  }

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      passwordHash: await hashPassword(parsed.data.password),
    },
  });

  return jsonWithSession(
    { ok: true, needsOnboarding: true },
    {
      userId: user.id,
      workspaceId: "",
      role: "owner",
      name: user.name,
      email: user.email,
    },
  );
}
