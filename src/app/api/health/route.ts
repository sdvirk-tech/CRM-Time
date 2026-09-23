import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deployMode } from "@/lib/env";

export async function GET() {
  await prisma.$queryRaw`SELECT 1`;
  return NextResponse.json({ ok: true, deployMode: deployMode() });
}
