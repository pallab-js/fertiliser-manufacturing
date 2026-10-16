"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/actions/auth";

type NavItem = { href: string; label: string; icon: string };
type NavGroup = { title?: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "📊" },
      { href: "/inventory", label: "Inventory", icon: "📦" },
      { href: "/production", label: "Production", icon: "🏭" },
      { href: "/purchases", label: "Purchases", icon: "🚚" },
      { href: "/sales", label: "Sales", icon: "🧾" },
    ],
  },
  {
    title: "Masters",
    items: [
      { href: "/items", label: "Items", icon: "🧪" },
      { href: "/formulas", label: "Formulas", icon: "📐" },
      { href: "/customers", label: "Customers", icon: "🤝" },
      { href: "/suppliers", label: "Suppliers", icon: "🏢" },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/users", label: "Users", icon: "👥" },
      { href: "/settings", label: "Settings", icon: "⚙️" },
    ],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
      {NAV.map((group, i) => (
        <div key={group.title ?? i}>
          {group.title ? (
            <p className="mb-2 px-4 text-sm font-medium tracking-widest text-ink/50 uppercase">
              {group.title}
            </p>
          ) : null}
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={`nav-row ${active ? "active" : ""}`}
                  >
                    <span aria-hidden>{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="border-b border-hairline px-6 py-5">
        <Link href="/dashboard" className="font-display text-lg font-extrabold uppercase">
          Fertilizer<span className="text-primary">MSME</span>
        </Link>
        <p className="mt-1 text-sm text-ink/50">Factory Manager</p>
      </div>
      <NavLinks onNavigate={onNavigate} />
    </>
  );
}

export function Shell({
  user,
  children,
}: {
  user?: { username: string; role: string } | null;
  children: React.ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="flex min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-on-primary focus:rounded"
      >
        Skip to main content
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-hairline bg-canvas lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setDrawer(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-hairline bg-canvas">
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {/* Topbar (nav-bar) */}
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-hairline bg-canvas px-4 py-3 md:px-6">
          <button
            className="btn-ghost-sm lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Open navigation"
          >
            ☰
          </button>
          <div className="flex-1" />
          {user ? (
            <div className="flex items-center gap-3">
              <span className="badge badge-neutral">{user.role}</span>
              <span className="text-sm text-ink/80">{user.username}</span>
              <form action={logout} className="no-print">
                <button type="submit" className="btn-ghost-sm">
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
        </header>

        <main id="main-content" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
