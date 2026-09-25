import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { jsonError } from "@/lib/auth";
import { findOpenDuplicateLeads } from "@/lib/duplicate-leads";
import { normalizePhone } from "@/lib/validators";

export async function GET(req: Request) {
  return withSession(async (session) => {
    const url = new URL(req.url);
    const phoneRaw = url.searchParams.get("phone")?.trim() || "";
    const telegram = url.searchParams.get("telegram")?.trim() || "";
    const contactId = url.searchParams.get("contactId")?.trim() || "";
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    if (phoneRaw && !phone) return jsonError("Некорректный телефон", 400);

    const duplicates = await findOpenDuplicateLeads(session.workspaceId, {
      phone,
      telegramExternalId: telegram || undefined,
      contactId: contactId || undefined,
    });
    return NextResponse.json({
      hasDuplicate: duplicates.length > 0,
      duplicates: duplicates.map((d) => ({
        id: d.id,
        status: d.status,
        contactName: d.contactName,
        phone: d.phone,
        createdAt: d.createdAt,
      })),
    });
  });
}
