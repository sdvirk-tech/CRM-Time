"use client";

type Item = { id: string; event: string; label: string; actor: string; message: string; createdAt: string };

export function ActivityTimeline({ items }: { items: Item[] }) {
  if (!items?.length) {
    return (
      <section className="mt-8 max-w-xl">
        <h2 className="text-xl font-semibold">Лента</h2>
        <p className="mt-2 text-sm text-muted">Пока пусто — сообщения, статус, склейка, согласие и отправки появятся здесь.</p>
      </section>
    );
  }
  return (
    <section className="mt-8 max-w-xl">
      <h2 className="text-xl font-semibold">Лента</h2>
      <ol className="mt-3 space-y-2">
        {items.map((i) => (
          <li key={i.id} className="rounded-xl border border-line bg-slot px-3 py-2 text-sm">
            <p className="text-xs text-muted">
              {i.label} · {i.actor} · {new Date(i.createdAt).toLocaleString("ru-RU")}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{i.message}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
