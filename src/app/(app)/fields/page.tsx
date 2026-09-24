"use client";

import { FormEvent, useEffect, useState } from "react";

type Field = { id: string; name: string; key: string; fieldType: string; required: boolean };

export default function FieldsPage() {
  const [fields, setFields] = useState<Field[]>([]);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [required, setRequired] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const d = await fetch("/api/fields").then((r) => r.json());
    setFields(d.fields ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, key, fieldType, required }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else {
      setName("");
      setKey("");
      setError("");
      await load();
    }
  }

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Поля клиента (ТТХ)</h1>
      <p className="mt-2 max-w-xl text-muted">
        Карточка груза: имя, телефон, телеграм, Max, описание, вес, объём, отправка, прибытие, маршрут (АВИА / МОРЕ / ЖД / АВТО / СБОРКА), срок. ТН ВЭД — в чате, не формой.
      </p>
      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-slot">
        {fields.map((f) => (
          <li key={f.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{f.name}</p>
              <p className="text-xs text-muted">
                {f.key} · {f.fieldType}
                {f.required ? " · обязательно" : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-8 grid max-w-xl gap-3">
        <input className="rounded-xl border border-line bg-slot px-3 py-2" placeholder="Имя поля" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="rounded-xl border border-line bg-slot px-3 py-2" placeholder="ключ (cargo)" value={key} onChange={(e) => setKey(e.target.value)} required />
        <select className="rounded-xl border border-line bg-slot px-3 py-2" value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
          <option value="text">текст</option>
          <option value="phone">телефон</option>
          <option value="tnved">ТН ВЭД</option>
          <option value="incoterms">Incoterms</option>
          <option value="container">контейнер</option>
          <option value="route">маршрут (АВИА/МОРЕ/ЖД/АВТО/СБОРКА)</option>
        </select>
        <label className="text-sm">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="mr-2" />
          Обязательное
        </label>
        {error && <p className="text-sm text-urgent">{error}</p>}
        <button className="w-fit rounded-xl bg-accent px-4 py-2 text-ink">Добавить</button>
      </form>
    </main>
  );
}
