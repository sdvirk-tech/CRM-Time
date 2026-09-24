"use client";

import { useEffect, useState } from "react";

type Item = { id: string; title: string; body: string };

export function CannedPicker({ onInsert }: { onInsert: (body: string) => void }) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    fetch("/api/canned")
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => {});
  }, []);

  if (!items.length) return null;

  return (
    <label className="block text-sm">
      Шаблон ответа
      <select
        className="mt-1 w-full rounded-xl border border-line bg-slot px-3 py-2"
        defaultValue=""
        onChange={(e) => {
          const hit = items.find((i) => i.id === e.target.value);
          if (hit) onInsert(hit.body);
          e.target.value = "";
        }}
      >
        <option value="">вставить в черновик…</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.title}
          </option>
        ))}
      </select>
    </label>
  );
}
