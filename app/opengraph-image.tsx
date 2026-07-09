import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "MWFINANCE — Personal Finance Diagnostics Terminal by Maximilian Wikström";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const G = "#4ec96a";   // phosphor green
const D = "#0c0c0f";   // ink
const M = "#72728a";   // muted
const F = "#454552";   // faint

/**
 * OG / Twitter card — 1200 × 630 terminal window.
 * Composed entirely with flexbox so satori renders it correctly.
 * No text-shadow, no background-image — both unsupported by satori.
 */
export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        background: D,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
        position: "relative",
        fontFamily: '"Courier New", Courier, ui-monospace, monospace',
      }}
    >
      {/* ── Left content column ──────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "64px 0 64px 80px",
          width: 660,
          gap: 0,
        }}
      >
        {/* Top label */}
        <div
          style={{
            display: "flex",
            color: F,
            fontSize: 13,
            letterSpacing: 5,
            marginBottom: 22,
          }}
        >
          DIAGNOSTICS TERMINAL · SEK · LANSFORSAKRINGAR
        </div>

        {/* Wordmark */}
        <div
          style={{
            display: "flex",
            color: G,
            fontSize: 94,
            fontWeight: 700,
            letterSpacing: 6,
            lineHeight: "1",
            marginBottom: 26,
          }}
        >
          MWFINANCE
        </div>

        {/* Green rule */}
        <div
          style={{
            display: "flex",
            width: 80,
            height: 3,
            background: G,
            marginBottom: 36,
          }}
        />

        {/* Feature bullets */}
        <div style={{ display: "flex", color: M, fontSize: 19, letterSpacing: 1, marginBottom: 14 }}>
          [OK] Enable Banking · auto-sync · BankID
        </div>
        <div style={{ display: "flex", color: M, fontSize: 19, letterSpacing: 1, marginBottom: 14 }}>
          [OK] Salary-cycle budgets · AI categorization
        </div>
        <div style={{ display: "flex", color: M, fontSize: 19, letterSpacing: 1, marginBottom: 14 }}>
          [OK] Savings goals · behavioral insights
        </div>

        {/* Spacer */}
        <div style={{ display: "flex", flex: 1 }} />

        {/* Author block */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            borderLeft: `2px solid ${G}`,
            paddingLeft: 16,
            opacity: 0.75,
          }}
        >
          <div style={{ display: "flex", color: G, fontSize: 15, letterSpacing: 3 }}>
            MAXIMILIAN WIKSTRÖM
          </div>
          <div style={{ display: "flex", color: F, fontSize: 13, letterSpacing: 2 }}>
            maximilian-wikstrom.vercel.app
          </div>
        </div>
      </div>

      {/* ── Right column — large $ watermark ──────────────────────── */}
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            color: G,
            fontSize: 580,
            fontWeight: 700,
            lineHeight: "1",
            opacity: 0.1,
            marginLeft: -40,
          }}
        >
          $
        </div>
      </div>

      {/* ── Corner brackets ──────────────────────────────────────── */}
      {/* top-left */}
      <div style={{ position: "absolute", top: 24, left: 24, width: 44, height: 44, display: "flex",
                    borderTop: `2.5px solid ${G}`, borderLeft: `2.5px solid ${G}`, opacity: 0.4 }} />
      {/* top-right */}
      <div style={{ position: "absolute", top: 24, right: 24, width: 44, height: 44, display: "flex",
                    borderTop: `2.5px solid ${G}`, borderRight: `2.5px solid ${G}`, opacity: 0.4 }} />
      {/* bottom-left */}
      <div style={{ position: "absolute", bottom: 24, left: 24, width: 44, height: 44, display: "flex",
                    borderBottom: `2.5px solid ${G}`, borderLeft: `2.5px solid ${G}`, opacity: 0.4 }} />
      {/* bottom-right */}
      <div style={{ position: "absolute", bottom: 24, right: 24, width: 44, height: 44, display: "flex",
                    borderBottom: `2.5px solid ${G}`, borderRight: `2.5px solid ${G}`, opacity: 0.4 }} />

      {/* Bottom accent bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 4,
          background: G,
          opacity: 0.6,
          display: "flex",
        }}
      />
    </div>,
    { ...size }
  );
}
