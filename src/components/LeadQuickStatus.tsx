"use client";

export function LeadQuickStatus(opts: {
  leadId: string;
  status: string;
  onDone?: () => void;
}) {
  async function setStatus(status: "qualified" | "rejected" | "in_progress") {
    await fetch(`/api/leads/${opts.leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    opts.onDone?.();
  }
  if (!opts.leadId) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {opts.status !== "qualified" && (
        <button
          type="button"
          onClick={() => setStatus("qualified")}
          className="rounded-xl border border-line bg-ok px-4 py-2 text-sm text-ink"
        >
          Квалифицирован
        </button>
      )}
      {opts.status !== "rejected" && (
        <button type="button" onClick={() => setStatus("rejected")} className="rounded-xl border border-line px-4 py-2 text-sm">
          Отказ
        </button>
      )}
    </div>
  );
}
