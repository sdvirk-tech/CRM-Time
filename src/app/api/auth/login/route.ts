import { prisma } from "@/lib/prisma";
import { jsonError, jsonWithSession, verifyPassword } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Укажите почту и пароль");

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: { memberships: true },
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return jsonError("Неверная почта или пароль", 401);
  }

  const membership = user.memberships[0];
  return jsonWithSession(
    { ok: true, needsOnboarding: !membership },
    {
      userId: user.id,
      workspaceId: membership?.workspaceId ?? "",
      role: membership?.role === "owner" ? "owner" : membership ? "manager" : "owner",
      name: user.name,
      email: user.email,
    },
  );
}
