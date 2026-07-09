"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AsciiSigil } from "./AsciiSigil";

const TABS = [
  { href: "/", label: "OVERVIEW" },
  { href: "/transactions", label: "LEDGER" },
  { href: "/budgets", label: "BUDGETS" },
  { href: "/insights", label: "INSIGHTS" },
  { href: "/assistant", label: "ASSISTANT" },
  { href: "/goals", label: "GOALS" },
  { href: "/simulate", label: "WHAT-IF" },
];

export function TopNav() {
  const path = usePathname();
  return (
    <header className="relative overflow-hidden border border-edge bg-panel">
      {/* Sigil backdrop — figure01 peeking from the right, clipped by overflow-hidden */}
      <AsciiSigil
        name="figure01"
        tone="accent"
        opacity={0.25}
        className="pointer-events-none absolute -right-1 top-0 select-none text-[0.44rem]"
      />

      <div className="relative flex items-center justify-between border-b border-edge px-3 py-1.5">
        <Link href="/" className="glow text-sm font-bold uppercase tracking-term text-accent">
          MWFINANCE
        </Link>
        <span className="text-[0.65rem] uppercase tracking-term text-faint">
          SEK · Länsförsäkringar
        </span>
      </div>
      <nav className="relative flex overflow-x-auto hide-scrollbar">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={
                "shrink-0 border-r border-edge px-3 py-1.5 text-xs uppercase tracking-term transition-colors " +
                (active
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:bg-panel2 hover:text-ink2")
              }
            >
              {active ? "» " : "  "}
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
