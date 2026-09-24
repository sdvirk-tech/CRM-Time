export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startOpsLoop } = await import("./src/lib/ops-loop");
  startOpsLoop();
}
