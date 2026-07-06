export function kr(n: number | null | undefined): string {
  if (n == null) return "–";
  return `${Math.round(n).toLocaleString("sv-SE")} kr`;
}

export function krSigned(n: number): string {
  const s = kr(Math.abs(n));
  return n < 0 ? `−${s}` : `+${s}`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function pct(n: number | null): string {
  if (n == null) return "";
  return `${Math.round(n * 100)}%`;
}
