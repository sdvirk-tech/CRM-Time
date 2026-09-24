import { attemptLogin, jsonError, jsonWithSession } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Укажите почту и пароль");

  const result = await attemptLogin(parsed.data.email, parsed.data.password);
  if (!result.ok) return jsonError(result.error, result.status);

  const membership = result.user.memberships[0];
  return jsonWithSession(
    { ok: true, needsOnboarding: !membership },
    {
      userId: result.user.id,
      workspaceId: membership?.workspaceId ?? "",
      role: membership?.role === "owner" ? "owner" : membership ? "manager" : "owner",
      name: result.user.name,
      email: result.user.email,
    },
  );
}
