/**
 * Diagnostic status tag — [ ON TRACK ], [ OVER BUDGET ], [!] ANOMALY, etc.
 * Direct, terminal-honest language per the design philosophy.
 */
export function StatusTag({
  tone = "muted",
  children,
  className = "",
}: {
  tone?: "ok" | "warn" | "danger" | "muted";
  children: React.ReactNode;
  className?: string;
}) {
  const cls =
    tone === "ok"
      ? "tag-ok"
      : tone === "warn"
      ? "tag-warn"
      : tone === "danger"
      ? "tag-danger"
      : "tag-muted";
  return <span className={`tag ${cls} ${className}`}>{children}</span>;
}

/** Checklist / result glyph: [✓] [ ] [×] [!]. */
export function Glyph({
  state,
  className = "",
}: {
  state: "ok" | "empty" | "fail" | "warn";
  className?: string;
}) {
  const map = {
    ok: { ch: "[✓]", c: "text-ok" },
    empty: { ch: "[ ]", c: "text-muted" },
    fail: { ch: "[×]", c: "text-danger" },
    warn: { ch: "[!]", c: "text-amber" },
  } as const;
  const g = map[state];
  return <span className={`${g.c} ${className}`}>{g.ch}</span>;
}
