"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const nav = [
  { href: "/flow", label: "Цепочка" },
  { href: "/inbox", label: "Входящие" },
  { href: "/leads", label: "Лиды" },
  { href: "/fields", label: "Поля" },
  { href: "/team", label: "Команда" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [newLeads, setNewLeads] = useState(0);
  const [urgent, setUrgent] = useState(0);
  const [user, setUser] = useState<{ name: string; role: string; workspaceName: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) router.replace("/login");
        else if (!d.user.onboarded) router.replace("/onboard");
        else setUser(d.user);
      });
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => {
        setUnread(d.unread ?? 0);
        setNewLeads(d.newLeads ?? 0);
        setUrgent(d.urgent ?? 0);
      })
      .catch(() => {});
  }, [path, router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[220px_1fr]">
      <aside className="border-b border-line bg-[#0e1116] px-5 py-6 lg:border-b-0 lg:border-r">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pine">CRM-Time</p>
        <p className="mt-2 text-xl font-semibold leading-tight">{user?.workspaceName ?? "Воркспейс"}</p>
        <p className="mt-1 text-xs text-muted">
          {user?.name} · {user?.role === "owner" ? "владелец" : "менеджер"}
        </p>
        <nav className="mt-8 space-y-1">
          {nav.map((item) => {
            const active = path === item.href || path.startsWith(item.href + "/");
            const badge = item.href === "/inbox" ? unread : item.href === "/leads" ? newLeads : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between rounded px-3 py-2 text-sm ${active ? "bg-ink text-paper" : "hover:bg-white/10"}`}
              >
                <span>{item.label}</span>
                {badge > 0 && (
                  <span className={`rounded px-2 text-xs ${active ? "bg-paper text-ink" : "bg-urgent text-white"}`}>{badge}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <button onClick={logout} className="mt-10 text-sm text-muted underline">
          Выйти
        </button>
      </aside>
      <div className="min-w-0">
        {urgent > 0 && (
          <Link href="/inbox?filter=urgent" className="block border-b border-urgent/40 bg-urgent/15 px-6 py-2 text-sm">
            Срочно: {urgent} — дефолт модели или сбой AI, человек уже назначен. Открыть входящие.
          </Link>
        )}
        {children}
      </div>
    </div>
  );
}
