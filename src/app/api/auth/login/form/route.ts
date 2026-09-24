import { NextResponse } from "next/server";
import { applySessionCookie, attemptLogin } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") || "").toLowerCase();
  const password = String(form.get("password") || "");
  const origin = req.headers.get("origin") || `http://${req.headers.get("host")}`;
  const result = await attemptLogin(email, password);
  if (!result.ok) {
    const dest = new URL("/login", origin);
    dest.searchParams.set("error", result.error);
    return NextResponse.redirect(dest, 303);
  }
  const membership = result.user.memberships[0];
  const dest = new URL(membership ? "/flow" : "/onboard", origin);
  const res = NextResponse.redirect(dest, 303);
  await applySessionCookie(res, {
    userId: result.user.id,
    workspaceId: membership?.workspaceId ?? "",
    role: membership?.role === "owner" ? "owner" : membership ? "manager" : "owner",
    name: result.user.name,
    email: result.user.email,
  });
  return res;
}
