import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deployMode, extraPublicRegisterAllowed } from "@/lib/env";
import pkg from "../../../../package.json";

export async function GET() {
  let postgres = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    postgres = true;
  } catch {
    postgres = false;
  }
  const users = await prisma.user.count();
  const workspaces = await prisma.workspace.count();
  const mode = deployMode();
  return NextResponse.json({
    ok: postgres,
    postgres,
    version: pkg.version,
    deployMode: mode,
    publicRegistration: extraPublicRegisterAllowed(users),
    boxSingleWorkspace: mode === "box",
    workspaceCount: workspaces,
  });
}
