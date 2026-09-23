import { NextResponse } from "next/server";
import { publicRegistrationOpen, readSession, userCount } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deployMode } from "@/lib/env";
import { listModels } from "@/lib/ai";

export async function GET() {
  const session = await readSession();
  const registrationOpen = publicRegistrationOpen() || (await userCount()) === 0;
  if (!session) {
    return NextResponse.json({ user: null, deployMode: deployMode(), registrationOpen });
  }
  const member = session.workspaceId
    ? await prisma.workspaceMember.findFirst({
        where: { workspaceId: session.workspaceId, userId: session.userId },
      })
    : null;
  const workspace = session.workspaceId
    ? await prisma.workspace.findUnique({ where: { id: session.workspaceId } })
    : null;
  return NextResponse.json({
    user: {
      id: session.userId,
      name: session.name,
      email: session.email,
      role: member?.role ?? session.role,
      workspaceId: session.workspaceId || null,
      workspaceName: workspace?.name ?? null,
      onboarded: Boolean(member),
    },
    deployMode: deployMode(),
    registrationOpen,
    models: listModels(),
  });
}
