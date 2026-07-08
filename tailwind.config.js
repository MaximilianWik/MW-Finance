/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Neutral terminal palette. True dark. Green phosphor as the single accent.
        ink:    "#0c0c0f", // page background
        panel:  "#101014", // panel surface
        panel2: "#161619", // nested / input surface
        edge:   "#252530", // dim border
        edge2:  "#363644", // active border / hover
        grid:   "#18181c", // hairline table rules
        ink2:   "#d8d8e0", // primary text (cool off-white)
        muted:  "#72728a", // secondary text (neutral grey, ≥4.5:1 on ink)
        faint:  "#454552", // tertiary / disabled
        // Accent
        accent:  "#4ec96a", // green phosphor — primary actions, glyphs, sigils
        accent2: "#5cc8e8", // cyan — links / secondary highlight
        // Status
        amber:  "#e8c545", // warnings (brighter amber than accent)
        danger: "#e85252", // over-budget / failed / anomaly
        ok:     "#4ec96a", // success / on-track (green, used ONLY for [✓] states)
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
        term: "0.08em",
      },
      keyframes: {
        blink: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
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
