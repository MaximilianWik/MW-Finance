"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Full-page lock screen. The middleware redirects here whenever a request
 * has no valid mwf_session cookie, so this page must render without
 * fetching or exposing any application data.
 */
function UnlockForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: value }),
    });
    if (res.ok) {
      // Full navigation so the now-unlocked page renders fresh from the server.
      window.location.href = next;
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    setError(data.error ?? "Incorrect password");
    setValue("");
  }

  return (
    <div className="panel w-full max-w-sm">
      <span className="panel-title">[ AUTHENTICATION REQUIRED ]</span>
      <p className="mb-3 text-[0.7rem] uppercase tracking-term text-muted">
        Enter the site password to continue.
      </p>

      <div className="prompt mb-2">
        <span className="sigil text-accent">&gt;</span>
        <input
          type="password"
          autoFocus
          value={value}
          placeholder="password"
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          disabled={busy}
          className="!w-full text-[0.75rem]"
        />
      </div>

      {error && (
        <p className="mb-2 text-[0.7rem] text-danger">[FAIL] {error}</p>
      )}

      <button
        onClick={submit}
        disabled={busy || !value.trim()}
        className="btn btn-accent w-full"
      >
        {busy ? "verifying…" : "$ unlock"}
      </button>
    </div>
  );
}

export default function UnlockPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Suspense fallback={null}>
        <UnlockForm />
      </Suspense>
    </div>
  );
}
