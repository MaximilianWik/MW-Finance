"use client";

import { useEffect, useRef, useState } from "react";

export function PasswordModal({
  onSubmit,
  onCancel,
}: {
  onSubmit: (password: string) => Promise<string | null>; // null = success, string = error
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    const err = await onSubmit(value);
    setBusy(false);
    if (err) {
      setError(err);
      setValue("");
      inputRef.current?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm">
      <div className="panel w-full max-w-sm">
        <span className="panel-title">[ AUTHENTICATION REQUIRED ]</span>
        <p className="mb-3 text-[0.7rem] uppercase tracking-term text-muted">
          This action requires a password.
        </p>

        <div className="prompt mb-2">
          <span className="sigil text-accent">&gt;</span>
          <input
            ref={inputRef}
            type="password"
            value={value}
            placeholder="password"
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
            disabled={busy}
            className="!w-full text-[0.75rem]"
          />
        </div>

        {error && (
          <p className="mb-2 text-[0.7rem] text-danger">[FAIL] {error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={busy || !value.trim()}
            className="btn btn-accent flex-1"
          >
            {busy ? "verifying…" : "$ unlock"}
          </button>
          <button onClick={onCancel} className="btn">
            cancel
          </button>
        </div>
      </div>
    </div>
  );
}
