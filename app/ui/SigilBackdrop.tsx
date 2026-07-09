import { AsciiSigil } from "./AsciiSigil";

/**
 * Ambient cybersigil decoration pinned to the wide-desktop side gutters.
 *
 * Fixed, inert, and painted *behind* the centered content column (z-0 vs the
 * z-1 applied to body's direct children). Only shown from 2xl up, where the
 * max-w-6xl column leaves real gutter space — so it can never overlap a panel
 * or reduce legibility. Very low opacity: atmosphere, not foreground.
 */
export function SigilBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 hidden select-none 2xl:block"
    >
      <div className="absolute left-2 top-1/2 -translate-y-1/2">
        <AsciiSigil name="wingedSpine" opacity={0.07} className="text-[0.55rem]" />
      </div>
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <AsciiSigil name="thornCross" opacity={0.07} className="text-[0.55rem]" />
      </div>
    </div>
  );
}
