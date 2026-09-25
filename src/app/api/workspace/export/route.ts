import { NextResponse } from "next/server";
import { withOwner } from "@/lib/api";
import { buildWorkspaceExport } from "@/lib/workspace-export";

export async function GET() {
  return withOwner(async (session) => {
    const payload = await buildWorkspaceExport(session.workspaceId);
    const filename = `crm-time-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });
}
