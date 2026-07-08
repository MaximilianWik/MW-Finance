"use client";

import { useState } from "react";
import { AiConsole } from "./AiConsole";

/**
 * AI budget recalibration panel. An optional free-text box lets the user steer
 * the engine ("done travelling, drop the travel budget", "save harder toward
 * the tattoo fund", etc.); the note is sent with both preview and apply.
 */
export function RecalibratePanel() {
  const [note, setNote] = useState("");
  const getBody = () => ({ guidance: note.trim() || undefined });

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="optional guidance — e.g. 'done travelling, drop the travel budget; save harder toward the tattoo fund'"
        className="input w-full resize-y text-[0.75rem] leading-relaxed placeholder:text-faint"
      />
      <div className="flex flex-col gap-3">
        <AiConsole
          endpoint="/api/budget/recalibrate?preview=1"
          getBody={getBody}
          label="$ ai preview"
          pendingLabel="thinking…"
          refreshOnDone={false}
        />
        <AiConsole
          endpoint="/api/budget/recalibrate"
          getBody={getBody}
          label="$ ai recalibrate"
          pendingLabel="recalibrating…"
        />
      </div>
    </div>
  );
}
