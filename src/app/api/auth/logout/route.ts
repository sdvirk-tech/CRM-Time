import { NextResponse } from "next/server";
import { clearSessionOn } from "@/lib/auth";

export async function POST() {
  return clearSessionOn(NextResponse.json({ ok: true }));
}
