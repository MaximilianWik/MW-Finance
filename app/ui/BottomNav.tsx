"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", icon: "◎" },
  { href: "/transactions", label: "Activity", icon: "≣" },
  { href: "/budgets", label: "Budgets", icon: "◱" },
  { href: "/insights", label: "Insights", icon: "◉" },
  { href: "/goals", label: "Goals", icon: "◇" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-edge bg-panel/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-stretch justify-around px-4 py-2">
        {TABS.map((t) => {
          const active = path === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-xs transition ${
                active ? "text-accent" : "text-muted hover:text-white"
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
