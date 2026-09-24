import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { runOpsTick } from "@/lib/ops-loop";

export async function POST() {
  return withSession(async (session) => {
    const result = await runOpsTick(session.workspaceId);
    return NextResponse.json({ ok: true, ...result });
  });
}
