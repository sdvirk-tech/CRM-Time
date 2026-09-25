import { NextResponse } from "next/server";
import { withOwner } from "@/lib/api";
import { buildActivityAuditCsv } from "@/lib/activity-export";

export async function GET() {
  return withOwner(async (session) => {
    const body = await buildActivityAuditCsv(session.workspaceId);
    const filename = `crm-time-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });
}
