"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearSession, getSession, SESSION_CHANGED_EVENT, type Session } from "../lib/api-client";

const linkStyle = { color: "#fff", textDecoration: "none", fontSize: "0.9rem" };

const buttonStyle = {
  color: "#fff",
  background: "transparent",
  border: "1px solid #4b5563",
  borderRadius: "4px",
  padding: "0.3rem 0.7rem",
  fontSize: "0.85rem",
  cursor: "pointer",
};

/**
 * The nav bar's session-aware slot: shows who's logged in (email + role) with a logout
 * button, or a plain Login link when signed out. Session state lives in localStorage
 * (docs/DECISIONS.md — see api-client.ts), not React context or a server session, so this
 * has to read it on mount and re-read it whenever it changes: SESSION_CHANGED_EVENT catches
 * a same-tab login/logout, the native `storage` event catches a login/logout in another tab
 * (e.g. logging out in one tab should stop claiming you're signed in in another).
 */
export function SessionStatus() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSession(getSession());
    setMounted(true);

    const refresh = () => setSession(getSession());
    window.addEventListener(SESSION_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Avoid a hydration mismatch: the server always renders "logged out" (no access to
  // localStorage), so hold off rendering the real state until after mount.
  if (!mounted) return null;

  if (!session) {
    return (
      <a href="/login" style={linkStyle}>
        Login
      </a>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <span style={{ color: "#d1d5db", fontSize: "0.85rem" }}>
        {session.email} <span style={{ color: "#9ca3af" }}>({session.role})</span>
      </span>
      <button
        type="button"
        style={buttonStyle}
        onClick={() => {
          clearSession();
          router.push("/login");
        }}
      >
        Log out
      </button>
    </div>
  );
}
