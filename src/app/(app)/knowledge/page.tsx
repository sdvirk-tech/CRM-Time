"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Topic = { id: string; name: string };
type Article = { id: string; title: string; body: string; enabled: boolean; topicId: string | null };

export default function KnowledgePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [role, setRole] = useState("manager");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [topicId, setTopicId] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  async function load() {
    const d = await fetch("/api/knowledge").then((r) => r.json());
    setArticles(d.articles ?? []);
    setTopics(d.topics ?? []);
    setRole(d.role ?? "manager");
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    if (filter === "all") return articles;
    if (filter === "none") return articles.filter((a) => !a.topicId);
    return articles.filter((a) => a.topicId === filter);
  }, [articles, filter]);

  async function addTopic(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/knowledge/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTopic }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else {
      setNewTopic("");
      await load();
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, topicId: topicId || null }),
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

  async function toggle(a: Article) {
    await fetch(`/api/knowledge/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !a.enabled }),
    });
    await load();
  }

  async function move(a: Article, next: string) {
    await fetch(`/api/knowledge/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId: next || null }),
    });
    await load();
  }

  const owner = role === "owner";

  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">Знания</h1>
      <p className="mt-2 max-w-xl text-muted">
        Папки тематик. Канал на холсте может указать папку — ИИ берёт только её статьи.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={filter === "all" ? "chip chip-on" : "chip"} onClick={() => setFilter("all")}>
          все
        </button>
        <button className={filter === "none" ? "chip chip-on" : "chip"} onClick={() => setFilter("none")}>
          без папки
        </button>
        {topics.map((t) => (
          <button key={t.id} className={filter === t.id ? "chip chip-on" : "chip"} onClick={() => setFilter(t.id)}>
            {t.name}
          </button>
        ))}
      </div>
      {owner && (
        <form onSubmit={addTopic} className="mt-4 flex max-w-xl gap-2">
          <input
            className="flex-1 rounded border border-line bg-slot px-3 py-2"
            placeholder="Новая папка"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            required
          />
          <button className="rounded bg-accent px-4 py-2 text-ink">Папка</button>
        </form>
      )}
      <ul className="mt-6 space-y-3">
        {visible.length === 0 && <li className="text-muted">Пока пусто — положите методику.</li>}
        {visible.map((a) => (
          <li key={a.id} className="rounded border border-line bg-slot p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">
                {a.title}
                {!a.enabled && <span className="ml-2 text-xs text-muted">выкл</span>}
              </p>
              {owner && (
                <div className="flex flex-wrap gap-3">
                  <select
                    className="rounded border border-line bg-paper text-xs"
                    value={a.topicId ?? ""}
                    onChange={(e) => move(a, e.target.value)}
                  >
                    <option value="">без папки</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => toggle(a)} className="text-xs">
                    {a.enabled ? "Выключить" : "Включить"}
                  </button>
                  <button onClick={() => remove(a.id)} className="text-xs text-urgent">
                    Убрать
                  </button>
                </div>
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
          <select className="rounded border border-line bg-slot px-3 py-2" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">без папки</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
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
