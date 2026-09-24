"use client";

import { useState } from "react";

export function LeadQuickStatus(opts: {
  leadId: string;
  status: string;
  onDone?: () => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");

  async function setStatus(status: "qualified" | "rejected" | "in_progress", rejectReason?: string) {
    const res = await fetch(`/api/leads/${opts.leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, rejectReason }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(d.error || "Ошибка");
      return;
    }
    setErr("");
    setRejectOpen(false);
    setReason("");
    opts.onDone?.();
  }

  if (!opts.leadId) return null;
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
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
          <button
            type="button"
            onClick={() => setRejectOpen((v) => !v)}
            className="rounded-xl border border-line px-4 py-2 text-sm"
          >
            Отказ
          </button>
        )}
      </div>
      {rejectOpen && (
        <div className="mt-2 max-w-sm space-y-2">
          <input
            className="w-full rounded-xl border border-line bg-slot px-3 py-2 text-sm"
            placeholder="Причина отказа"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={280}
          />
          <button
            type="button"
            onClick={() => setStatus("rejected", reason.trim())}
            className="rounded-xl bg-accent px-4 py-2 text-sm text-ink"
          >
            Подтвердить отказ
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-urgent">{err}</p>}
    </div>
  );
}
