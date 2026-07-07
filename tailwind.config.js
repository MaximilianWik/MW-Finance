/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Terminal / diagnostic palette. Near-black green-tinted bg, phosphor
        // green accent, desaturated status colors. Diagnostic honesty over
        // reassurance.
        ink: "#0a0e0a", // page background
        panel: "#0c110c", // panel surface (barely lifted)
        panel2: "#111811", // nested / input surface
        edge: "#234523", // dim phosphor border
        edge2: "#2f5e2f", // brighter border (hover / active)
        grid: "#152015", // hairline rules inside tables
        ink2: "#cfe8cf", // primary text (light phosphor)
        muted: "#6f926f", // secondary text (dim phosphor, ≥4.5:1 on ink)
        faint: "#476247", // tertiary / disabled
        accent: "#4ee06a", // phosphor green — primary action / highlight
        accent2: "#3fd0c0", // cyan — links / secondary highlight
        amber: "#e0b23f", // warnings
        danger: "#e8564e", // over-budget / failed / anomaly
        ok: "#4ee06a", // on-track
      },
      fontFamily: {
        mono: [
          "var(--font-mono)",
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      letterSpacing: {
        term: "0.08em", // system-label tracking
      },
      keyframes: {
        blink: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
        "bar-load": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "97%": { opacity: "1" },
          "98%": { opacity: "0.82" },
          "99%": { opacity: "1" },
        },
      },
      animation: {
        blink: "blink 1.1s steps(1) infinite",
        flicker: "flicker 6s linear infinite",
      },
    },
  },
  plugins: [],
};
