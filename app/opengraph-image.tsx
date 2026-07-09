import { ImageResponse } from "next/og";
import { SIGILS } from "./ui/sigils";

export const runtime = "edge";
export const alt = "MWFINANCE — Personal Finance Diagnostics Terminal by Maximilian Wikström";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// ─── Braille → dot coordinates ──────────────────────────────────────────────
// Each braille cell (U+2800 block) encodes 8 dots in a 2-col × 4-row grid.
// We convert to absolute pixel coordinates so each dot can be rendered as a
// positioned <div> circle — no font dependency, guaranteed to render in satori.
const DOT_MAP: [number, number, number][] = [
  // [bitmask, col(0|1), row(0-3)]
  [0x01, 0, 0], [0x02, 0, 1], [0x04, 0, 2], [0x40, 0, 3],
  [0x08, 1, 0], [0x10, 1, 1], [0x20, 1, 2], [0x80, 1, 3],
];

function brailleToDots(
  art: string,
  cellW: number,
  cellH: number,
): Array<[number, number]> {
  const gapX = cellW / 2;
  const gapY = cellH / 4;
  const pts: Array<[number, number]> = [];
  for (const [ry, line] of art.split("\n").entries()) {
    for (const [rx, ch] of [...line].entries()) {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp < 0x2800 || cp > 0x28FF) continue;
      const bits = cp - 0x2800;
      if (bits === 0) continue;
      for (const [bit, col, row] of DOT_MAP) {
        if (!(bits & bit)) continue;
        pts.push([
          rx * cellW + col * gapX + gapX / 2,
          ry * cellH + row * gapY + gapY / 2,
        ]);
      }
    }
  }
  return pts;
}

// figure04 (angel / winged figure — 22 rows × 58 cols)
// Scaled to fill the right ~640 px of the 1200-wide canvas.
// cellW=11, cellH=17 → canvas 638 × 374 px; dotR=1.7
const CELL_W = 11;
const CELL_H = 17;
const DOT_R  = 1.7;
const FIG_DOTS = brailleToDots(SIGILS.figure04, CELL_W, CELL_H);
const FIG_W    = 58 * CELL_W;  // 638
const FIG_H    = 22 * CELL_H;  // 374

// Placement: sigil centred in right 650 px column; text in left 550 px
const SIGIL_X = 550 + Math.round((650 - FIG_W) / 2);   // ≈ 556
const SIGIL_Y = Math.round((630 - FIG_H) / 2);          // ≈ 128

// ─── Colour tokens ───────────────────────────────────────────────────────────
const G  = "#4ec96a";   // phosphor green
const D  = "#0c0c0f";   // ink
const M  = "#72728a";   // muted
const F  = "#454552";   // faint

// ─── ImageResponse ───────────────────────────────────────────────────────────
export default function OgImage() {
  const dotSize = DOT_R * 2;

  return new ImageResponse(
    <div
      style={{
        background: D,
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        fontFamily: '"Courier New", Courier, ui-monospace, monospace',
      }}
    >
      {/* ── Cybersigilism dot-matrix sigil (figure04) ── */}
      <div
        style={{
          position: "absolute",
          left: SIGIL_X,
          top: SIGIL_Y,
          width: FIG_W,
          height: FIG_H,
          opacity: 0.85,
          display: "flex",
        }}
      >
        {FIG_DOTS.map(([x, y], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - DOT_R,
              top: y - DOT_R,
              width: dotSize,
              height: dotSize,
              borderRadius: "50%",
              background: G,
            }}
          />
        ))}
      </div>

      {/* ── Thin vertical divider ── */}
      <div
        style={{
          position: "absolute",
          left: 545,
          top: 40,
          width: 1,
          height: 550,
          background: G,
          opacity: 0.2,
          display: "flex",
        }}
      />

      {/* ── Left text column ── */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 545,
          height: 630,
          display: "flex",
          flexDirection: "column",
          padding: "64px 0 64px 72px",
        }}
      >
        {/* Label */}
        <div style={{ display: "flex", color: F, fontSize: 12, letterSpacing: 5, marginBottom: 20 }}>
          DIAGNOSTICS TERMINAL · SEK · LANSFORSAKRINGAR
        </div>

        {/* Wordmark */}
        <div style={{ display: "flex", color: G, fontSize: 82, fontWeight: 700, letterSpacing: 4, lineHeight: "1", marginBottom: 22 }}>
          MWFINANCE
        </div>

        {/* Green rule */}
        <div style={{ display: "flex", width: 64, height: 3, background: G, marginBottom: 30 }} />

        {/* Features */}
        <div style={{ display: "flex", color: M, fontSize: 17, letterSpacing: 1, marginBottom: 12 }}>
          [OK] Enable Banking · auto-sync · BankID
        </div>
        <div style={{ display: "flex", color: M, fontSize: 17, letterSpacing: 1, marginBottom: 12 }}>
          [OK] Salary-cycle budgets · AI categorization
        </div>
        <div style={{ display: "flex", color: M, fontSize: 17, letterSpacing: 1, marginBottom: 12 }}>
          [OK] Savings goals · behavioral insights
        </div>

        <div style={{ display: "flex", flex: 1 }} />

        {/* Author block */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 6,
          borderLeft: `2px solid ${G}`, paddingLeft: 14, opacity: 0.75,
        }}>
          <div style={{ display: "flex", color: G, fontSize: 14, letterSpacing: 3 }}>
            MAXIMILIAN WIKSTRÖM
          </div>
          <div style={{ display: "flex", color: F, fontSize: 12, letterSpacing: 2 }}>
            maximilian-wikstrom.vercel.app
          </div>
        </div>
      </div>

      {/* ── Corner brackets ── */}
      <div style={{ position: "absolute", top: 22, left: 22, width: 36, height: 36, display: "flex", borderTop: `2px solid ${G}`, borderLeft: `2px solid ${G}`, opacity: 0.45 }} />
      <div style={{ position: "absolute", top: 22, right: 22, width: 36, height: 36, display: "flex", borderTop: `2px solid ${G}`, borderRight: `2px solid ${G}`, opacity: 0.45 }} />
      <div style={{ position: "absolute", bottom: 22, left: 22, width: 36, height: 36, display: "flex", borderBottom: `2px solid ${G}`, borderLeft: `2px solid ${G}`, opacity: 0.45 }} />
      <div style={{ position: "absolute", bottom: 22, right: 22, width: 36, height: 36, display: "flex", borderBottom: `2px solid ${G}`, borderRight: `2px solid ${G}`, opacity: 0.45 }} />

      {/* ── Bottom accent bar ── */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: G, opacity: 0.6, display: "flex" }} />
    </div>,
    { ...size }
  );
}
