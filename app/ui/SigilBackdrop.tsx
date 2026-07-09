import { AsciiSigil } from "./AsciiSigil";

/**
 * Ambient cybersigil decoration — three layers:
 *
 * 1. CENTER WATERMARK — figure04 (winged figure) fixed behind everything.
 * 2. SIDE SIGILS — figure00 left + figure01 right, in the desktop gutters,
 *    shown at xl+ where margin exists.
 *
 * Everything is z-0 (behind the z-1 content column), pointer-events-none,
 * aria-hidden. Panels have opaque backgrounds so legibility is preserved.
 */
export function SigilBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none select-none">
      {/* ── Center watermark ─────────────────────────────────────────── */}
      <div className="fixed inset-0 z-0 flex items-center justify-center overflow-hidden">
        <AsciiSigil
          name="figure04"
          tone="accent"
          opacity={0.8}
          className="text-[0.9rem]"
        />
      </div>

      {/* ── Side gutter sigils (xl+) ──────────────────────────────────── */}
      <div className="fixed inset-0 z-0 hidden xl:block">
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          <AsciiSigil name="figure00" opacity={0.8} className="text-[0.6rem]" />
        </div>
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <AsciiSigil name="figure01" opacity={0.8} className="text-[0.6rem]" />
        </div>
      </div>
    </div>
  );
}
