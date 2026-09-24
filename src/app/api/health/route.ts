import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deployMode, extraPublicRegisterAllowed } from "@/lib/env";

export async function GET() {
  await prisma.$queryRaw`SELECT 1`;
  const users = await prisma.user.count();
  const mode = deployMode();
  return NextResponse.json({
    ok: true,
    deployMode: mode,
    publicRegistration: extraPublicRegisterAllowed(users),
    boxSingleWorkspace: mode === "box",
  });
}
