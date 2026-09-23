"use client";

import { FormEvent, useEffect, useState } from "react";

type Article = { id: string; title: string; body: string };

export default function KnowledgePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [role, setRole] = useState("manager");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const d = await fetch("/api/knowledge").then((r) => r.json());
    setArticles(d.articles ?? []);
    setRole(d.role ?? "manager");
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else {
      setTitle("");
      setBody("");
      setError("");
      await load();
    }
  }

  async function remove(id: string) {
    await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    await load();
  }

  const owner = role === "owner";

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Знания</h1>
      <p className="mt-2 max-w-xl text-muted">
        Статьи подмешиваются в разбор и черновик. Это не RAG и не граф: короткие правила линии, как в прототипе MOST.
      </p>
      <ul className="mt-6 space-y-3">
        {articles.length === 0 && <li className="text-muted">Пока пусто — положите методику.</li>}
        {articles.map((a) => (
          <li key={a.id} className="rounded border border-line bg-slot p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">{a.title}</p>
              {owner && (
                <button onClick={() => remove(a.id)} className="text-xs text-urgent">
                  Убрать
                </button>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{a.body}</p>
          </li>
        ))}
      </ul>
      {owner && (
        <form onSubmit={add} className="mt-8 grid max-w-xl gap-3">
          <input
            className="rounded border border-line bg-slot px-3 py-2"
            placeholder="Заголовок"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <textarea
            className="rounded border border-line bg-slot px-3 py-2"
            rows={6}
            placeholder="Текст, на который опирается ИИ"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
          {error && <p className="text-sm text-urgent">{error}</p>}
          <button className="w-fit rounded bg-accent px-4 py-2 text-ink">Добавить статью</button>
        </form>
      )}
    </main>
  );
}
