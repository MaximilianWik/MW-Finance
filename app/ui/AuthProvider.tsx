"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PasswordModal } from "./PasswordModal";

/**
 * Mounts once in the root layout. Patches window.fetch so that any
 * POST/PATCH/DELETE returning 401 triggers the password modal, then
 * automatically retries the original request once the user unlocks.
 *
 * Client components that make mutations need zero changes — the
 * intercept is fully transparent.
 */

const MUTATING = new Set(["POST", "PATCH", "DELETE", "PUT"]);

function isMutating(init?: RequestInit | Request): boolean {
  const method = (
    (init instanceof Request ? init.method : init?.method) ?? "GET"
  ).toUpperCase();
  return MUTATING.has(method);
}

function isAuthUrl(input: RequestInfo | URL): boolean {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
  return url.includes("/api/auth/");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [showModal, setShowModal] = useState(false);

  // Resolves the pending auth Promise — fulfilled when the user unlocks.
  const resolveAuth = useRef<((ok: boolean) => void) | null>(null);

  // The un-patched fetch, saved before we override it.
  const origFetch = useRef<typeof fetch>(
    typeof window !== "undefined" ? window.fetch : fetch
  );

  /** Shows the modal and returns a Promise that resolves when the user
   *  successfully authenticates (true) or cancels (false). */
  const requestUnlock = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveAuth.current = resolve;
      setShowModal(true);
    });
  }, []);

  // Patch window.fetch on mount; restore on unmount.
  useEffect(() => {
    const orig = window.fetch.bind(window);
    origFetch.current = orig;

    window.fetch = async (input, init) => {
      // Only intercept mutating requests that aren't the auth endpoint itself.
      if (!isMutating(init) || isAuthUrl(input)) {
        return orig(input, init);
      }

      const res = await orig(input, init);

      if (res.status === 401) {
        const ok = await requestUnlock();
        if (!ok) {
          // User cancelled — return the original 401 so the caller can handle it.
          return res;
        }
        // Retry after successful auth. The cookie is now set.
        return orig(input, init);
      }

      return res;
    };

    return () => {
      window.fetch = orig;
    };
  }, [requestUnlock]);

  /** Called by PasswordModal on form submit. Returns null on success, error string on failure. */
  async function handleUnlock(password: string): Promise<string | null> {
    const res = await origFetch.current("/api/auth/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setShowModal(false);
      resolveAuth.current?.(true);
      resolveAuth.current = null;
      return null;
    }
    const data = await res.json().catch(() => ({})) as { error?: string };
    return data.error ?? "Incorrect password";
  }

  function handleCancel() {
    setShowModal(false);
    resolveAuth.current?.(false);
    resolveAuth.current = null;
  }

  return (
    <>
      {children}
      {showModal && (
        <PasswordModal onSubmit={handleUnlock} onCancel={handleCancel} />
      )}
    </>
  );
}
