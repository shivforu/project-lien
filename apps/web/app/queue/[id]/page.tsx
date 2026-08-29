"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, getSession, ApiError, type Session } from "../../../lib/api-client";

interface PackageDetail {
  id: string;
  package_identifier: string;
  status: string;
  document_type: string;
  state_code: string;
  county_fips: string;
  statutory_deadline: string;
  rejection_reason: string | null;
  county_tracking_number: string | null;
  recorded_instrument_number: string | null;
  recorded_at: string | null;
  created_at: string;
}

type ActionKey = "preflight" | "advance" | "submit" | "resubmit" | "resolve" | "cancel";

/**
 * Package detail screen. As of docs/DECISIONS.md D35, this is also where every real
 * lifecycle action lives as a clickable button — before this, creating/preflighting/
 * submitting/resubmitting/cancelling a package, and the dev-only signature/notary
 * shortcut, existed only as raw API calls (docs/QE_QUICKSTART.md sections 5/6/11). Which
 * buttons show depends on the package's current status (so the UI only ever offers a legal
 * next step) and the caller's role (VIEWER sees none; the dev shortcut is ORG_ADMIN-only,
 * matching the API's own enforcement — this is real client-side mirroring of a real
 * server-side rule, not the UI inventing its own permission logic).
 *
 * A document viewer with pre-flight overlay and a workflow-event timeline
 * (docs/REQUIREMENTS_MATRIX.md #28) are still natural next additions — there's no endpoint
 * yet to read either one from, so they're out of scope here.
 */
export default function PackageDetailPage() {
  const params = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionKey | null>(null);

  const load = useCallback(() => {
    apiFetch<{ data: PackageDetail }>(`/api/v1/releases/${params.id}`)
      .then((res) => setPkg(res.data))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load package"));
  }, [params.id]);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      window.location.href = "/login";
      return;
    }
    setSession(s);
    load();
  }, [load]);

  async function runAction(key: ActionKey, path: string, confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setPendingAction(key);
    setActionError(null);
    setActionNotice(null);
    try {
      // Every action endpoint's response shape is slightly different — most return the
      // full updated package as `data`, but /submit returns only
      // `{ packageId, jobId, status: "SUBMIT_QUEUED" }` (it queues a job rather than
      // performing the transition inline). Trusting `res.data` as the new package record
      // would silently corrupt the display after Submit specifically, so this always
      // re-fetches the canonical record from GET /releases/:id instead of assuming any
      // one action's response is a full PackageDetail.
      const res = await apiFetch<{
        data: unknown;
        preflight?: { passed: boolean; findings: { code: string; message: string }[] };
        warning?: string;
        message?: string;
      }>(path, { method: "POST" });
      if (res.warning) setActionNotice(res.warning);
      else if (res.preflight) {
        setActionNotice(
          res.preflight.passed
            ? "Pre-flight passed."
            : `Pre-flight failed: ${res.preflight.findings.map((f) => f.message).join("; ")}`,
        );
      } else if (res.message) setActionNotice(res.message);
      else if (key === "submit") setActionNotice("Submission queued — the worker will pick it up within a few seconds.");
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : `Failed to run ${key}`);
    } finally {
      setPendingAction(null);
    }
  }

  if (loadError) return <p style={{ color: "#b91c1c" }}>{loadError}</p>;
  if (!pkg || !session) return <p>Loading…</p>;

  const rows: [string, string | null][] = [
    ["Status", pkg.status],
    ["Document type", pkg.document_type],
    ["State / County FIPS", `${pkg.state_code} / ${pkg.county_fips}`],
    ["Statutory deadline", new Date(pkg.statutory_deadline).toLocaleDateString()],
    ["County tracking number", pkg.county_tracking_number],
    ["Recorded instrument number", pkg.recorded_instrument_number],
    ["Recorded at", pkg.recorded_at ? new Date(pkg.recorded_at).toLocaleString() : null],
    ["Rejection reason", pkg.rejection_reason],
    ["Created", new Date(pkg.created_at).toLocaleString()],
  ];

  const canWrite = session.role === "ORG_ADMIN" || session.role === "OPERATOR";
  const isAdmin = session.role === "ORG_ADMIN";
  const isTerminal = ["COMPLETE", "FAILED", "CANCELLED"].includes(pkg.status);

  const buttonStyle = { padding: "0.5rem 1rem", fontSize: "0.9rem", cursor: "pointer" };
  const devButtonStyle = {
    ...buttonStyle,
    background: "#fff7ed",
    border: "1px dashed #c2410c",
    color: "#9a3412",
  };

  return (
    <main>
      <h1>{pkg.package_identifier}</h1>
      <table style={{ borderCollapse: "collapse" }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: "0.4rem 1rem 0.4rem 0", color: "#666", fontWeight: 600, verticalAlign: "top" }}>{label}</td>
              <td style={{ padding: "0.4rem 0" }}>{value ?? <span style={{ color: "#999" }}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Actions</h2>

        {!canWrite && (
          <p style={{ color: "#666" }}>
            You're logged in as VIEWER — this role is read-only, so no actions are available
            here (the API would reject any of these with a 403 even if the button were
            shown).
          </p>
        )}

        {canWrite && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            {["DRAFT", "PREFLIGHT_FAILED", "VALIDATING"].includes(pkg.status) && (
              <button
                type="button"
                style={buttonStyle}
                disabled={pendingAction !== null}
                onClick={() => runAction("preflight", `/api/v1/releases/${pkg.id}/preflight`)}
              >
                {pendingAction === "preflight" ? "Running pre-flight…" : "Run pre-flight"}
              </button>
            )}

            {pkg.status === "READY" && isAdmin && (
              <button
                type="button"
                style={devButtonStyle}
                disabled={pendingAction !== null}
                onClick={() =>
                  runAction(
                    "advance",
                    `/api/v1/dev/releases/${pkg.id}/advance-to-ready-to-submit`,
                    "This is a TEST-ONLY shortcut standing in for a real signature + notarization, which this build doesn't implement yet. It will be clearly recorded as such in the audit trail (actor DEV_TOOL). Continue?",
                  )
                }
              >
                {pendingAction === "advance" ? "Advancing…" : "⚠ Skip signature/notary (dev only)"}
              </button>
            )}
            {pkg.status === "READY" && !isAdmin && (
              <span style={{ color: "#666", fontSize: "0.85rem" }}>
                This package is READY, but reaching READY_TO_SUBMIT needs the ORG_ADMIN-only
                dev shortcut — log in as admin to continue this one.
              </span>
            )}

            {pkg.status === "READY_TO_SUBMIT" && (
              <button
                type="button"
                style={buttonStyle}
                disabled={pendingAction !== null}
                onClick={() => runAction("submit", `/api/v1/releases/${pkg.id}/submit`)}
              >
                {pendingAction === "submit" ? "Submitting…" : "Submit"}
              </button>
            )}

            {pkg.status === "RESUBMISSION_REQUIRED" && (
              <button
                type="button"
                style={buttonStyle}
                disabled={pendingAction !== null}
                onClick={() => runAction("resubmit", `/api/v1/releases/${pkg.id}/resubmit`)}
              >
                {pendingAction === "resubmit" ? "Resubmitting…" : "Resubmit"}
              </button>
            )}

            {pkg.status === "REJECTED" && (
              <button
                type="button"
                style={buttonStyle}
                disabled={pendingAction !== null}
                onClick={() => runAction("resolve", `/api/v1/exceptions/${pkg.id}/resolve`)}
              >
                {pendingAction === "resolve" ? "Resolving…" : "Resolve → move to resubmission"}
              </button>
            )}

            {!isTerminal && (
              <button
                type="button"
                style={{ ...buttonStyle, color: "#b91c1c" }}
                disabled={pendingAction !== null}
                onClick={() => runAction("cancel", `/api/v1/releases/${pkg.id}/cancel`, "Cancel this package? This can't be undone.")}
              >
                {pendingAction === "cancel" ? "Cancelling…" : "Cancel package"}
              </button>
            )}

            {isTerminal && <span style={{ color: "#666", fontSize: "0.85rem" }}>{pkg.status} is a final state — no further actions apply.</span>}
          </div>
        )}

        {actionNotice && (
          <p style={{ marginTop: "1rem", padding: "0.6rem 0.8rem", background: "#eff6ff", color: "#1e40af", borderRadius: "4px" }}>{actionNotice}</p>
        )}
        {actionError && (
          <p style={{ marginTop: "1rem", padding: "0.6rem 0.8rem", background: "#fef2f2", color: "#b91c1c", borderRadius: "4px" }}>{actionError}</p>
        )}

        {["SUBMITTING", "SUBMITTED", "COUNTY_PROCESSING", "RECONCILING"].includes(pkg.status) && (
          <p style={{ marginTop: "1rem", color: "#666", fontSize: "0.85rem" }}>
            This status moves on its own once the background worker picks it up — refresh
            this page in a few seconds to see it progress.
          </p>
        )}
      </section>
    </main>
  );
}
