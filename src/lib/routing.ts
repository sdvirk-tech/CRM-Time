import { prisma } from "./prisma";

export type RoutingMode = "pool" | "round_robin";

export function asRoutingMode(raw: string | null | undefined): RoutingMode {
  return raw === "round_robin" ? "round_robin" : "pool";
}

/** Свободный пул = меньше открытых лидов. round_robin = по кругу среди менеджеров (иначе владелец). */
export async function pickAssignee(workspaceId: string): Promise<string> {
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
  });
  const managers = members.filter((m) => m.role === "manager");
  const owner = members.find((m) => m.role === "owner");
  const pool = managers.length ? managers : owner ? [owner] : [];
  if (!pool.length) throw new Error("В воркспейсе нет людей");

  if (asRoutingMode(ws.routingMode) === "round_robin") {
    const idx = ((ws.roundRobinAt % pool.length) + pool.length) % pool.length;
    const chosen = pool[idx];
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { roundRobinAt: (idx + 1) % pool.length },
    });
    return chosen.userId;
  }

  const open = await prisma.lead.groupBy({
    by: ["assigneeId"],
    where: { workspaceId, status: { in: ["new", "in_progress"] }, assigneeId: { not: null } },
    _count: { _all: true },
  });
  const countBy = new Map(open.map((r) => [r.assigneeId, r._count._all]));
  pool.sort((a, b) => (countBy.get(a.userId) ?? 0) - (countBy.get(b.userId) ?? 0));
  return pool[0].userId;
}
