import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { searchWorkspace } from "@/lib/search";

export async function GET(req: Request) {
  return withSession(async (session) => {
    const q = new URL(req.url).searchParams.get("q") || "";
    if (q.trim().length < 2) {
      return NextResponse.json({ q, contacts: [], leads: [], conversations: [] });
    }
    const data = await searchWorkspace({ workspaceId: session.workspaceId, role: session.role, q });
    return NextResponse.json({ q, ...data });
  });
}
