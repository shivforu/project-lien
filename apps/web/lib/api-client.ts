"use client";

/**
 * Minimal browser-side API client + session storage (docs/REQUIREMENTS_MATRIX.md #25).
 * This is a deliberate v1 simplification: the token lives in localStorage and every
 * fetch attaches it manually, rather than httpOnly cookies + server-side session
 * handling. That's a reasonable target for a later phase (docs/ASSUMPTIONS.md) — it
 * would need CSRF protection and a server-side session store to do properly, which is
 * more infrastructure than an operations console's first pass warrants.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const SESSION_KEY = "project-lien-session";

// Login/logout happen via plain function calls, not a form submit that reloads the page, so
// nothing would otherwise tell an already-mounted component (e.g. the nav bar) that the
// session just changed. The native `storage` event only fires in *other* tabs, never the
// tab that made the write — so same-tab UI (the nav bar right after /login redirects) needs
// this custom event dispatched manually alongside every localStorage write below.
export const SESSION_CHANGED_EVENT = "project-lien-session-changed";

export interface Session {
  accessToken: string;
  organizationId: string;
  role: string;
  email: string;
}

export function saveSession(session: Session): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (session) headers.set("authorization", `Bearer ${session.accessToken}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? "UNKNOWN_ERROR", body?.error?.message ?? res.statusText);
  }
  return body as T;
}
