"use client";

import { useEffect, useRef, useState } from "react";
import { useTypewriter, TerminalLog } from "./typewriter";

/**
 * Formats a raw Drizzle SQL string into display lines.
 * The first SELECT/UPDATE/INSERT/DELETE clause stays on the first line.
 * Subsequent major clauses (FROM, WHERE, JOIN, etc.) wrap to indented lines.
 */
const CLAUSE_RE =
  /\b(from|where|left join|inner join|right join|full join|join|group by|order by|having|limit|offset|on |returning|set |values)\b/gi;

function truncate(s: string, n = 96): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function formatSql(sql: string): string[] {
  const parts = sql.replace(/\s+/g, " ").trim().split(CLAUSE_RE);
  if (!parts.length) return [];

  const lines: string[] = [];
  lines.push("> " + truncate(parts[0].trim()));

  for (let i = 1; i + 1 < parts.length; i += 2) {
    const keyword = parts[i].toUpperCase().trim();
    const rest = (parts[i + 1] ?? "").trim();
    lines.push(">   " + truncate(keyword + " " + rest));
  }
  return lines;
}

/**
 * Page boot console. Plays a typewriter animation showing the SQL queries that
 * were run to render the page, ending with a [DONE] timing line.
 *
 * Receives pre-collected SQL strings from the server component via props —
 * zero client-side fetching, no waterfall.
 */
export function QueryLog({
  queries,
  tookMs,
  page,
}: {
  queries: string[];
  tookMs: number;
  page: string;
}) {
  const tw = useTypewriter();
  const [played, setPlayed] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (played || queries.length === 0) return;
    setPlayed(true);

    const lines: string[] = [
      `[BOOT] loading ${page}...`,
      ...queries.flatMap(formatSql),
      `[DONE] ${queries.length} quer${queries.length === 1 ? "y" : "ies"} — ${tookMs}ms`,
    ];

    tw.reset();
    tw.push(lines.join("\n") + "\n");
    tw.endStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [tw.shown]);

  if (!played && queries.length === 0) return null;

  return (
    <TerminalLog
      shown={tw.shown}
      busy={tw.busy}
      typing={tw.typing}
      className="max-h-40 text-[0.68rem]"
    />
  );
}
