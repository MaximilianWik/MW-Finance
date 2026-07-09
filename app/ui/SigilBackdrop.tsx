import { AsciiSigil } from "./AsciiSigil";

/**
 * Ambient cybersigil decoration — three layers:
 *
 * 1. CENTER WATERMARK — figure04 (angel) fixed behind everything, always
 *    visible as a ghost shape in the spaces between panels.
 * 2. SIDE SIGILS — thornCross left + wingedSpine right, fixed in the wide
 *    desktop gutters, shown at xl+ (1280 px) where real margin exists.
 *
 * Everything is z-0 (behind the z-1 content column), pointer-events-none,
 * aria-hidden. Panels have opaque backgrounds so text legibility is never
 * compromised — sigils only show through transparent gaps.
 */
export function SigilBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none select-none">
      {/* ── Center watermark ─────────────────────────────────────────── */}
      <div className="fixed inset-0 z-0 flex items-center justify-center overflow-hidden">
        <AsciiSigil
          name="figure04"
          tone="accent"
          opacity={0.1}
          className="text-[0.9rem]"
        />
      </div>

      {/* ── Side gutter sigils (xl+) ──────────────────────────────────── */}
      <div className="fixed inset-0 z-0 hidden xl:block">
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          <AsciiSigil name="thornCross" opacity={0.22} className="text-[0.6rem]" />
        </div>
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <AsciiSigil name="wingedSpine" opacity={0.22} className="text-[0.6rem]" />
        </div>
      </div>
    </div>
  );
}
