import { prisma } from "./prisma";

export async function ensureTag(workspaceId: string, name: string) {
  const trimmed = name.trim();
  const existing = await prisma.tag.findFirst({
    where: { workspaceId, name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing;
  return prisma.tag.create({ data: { workspaceId, name: trimmed } });
}
