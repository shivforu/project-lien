"use client";

import { useState } from "react";
import { apiFetch, getSession, ApiError } from "../../lib/api-client";

interface ResolvedRule {
  stateCode: string;
  theoryType: string;
  docType: string;
  statutoryDeadlineDays: number;
  dailyPenaltyCents: number;
  trusteeRequired: boolean;
  topMarginInches: number;
  notaryType: string;
  eRecordingNetwork: string;
  baseRecordingFeeCents: number;
  perPageFeeCents: number;
  provenance: { stateStatus: string; countyStatus: string | null };
}

/**
 * Read-only jurisdiction lookup (docs/REQUIREMENTS_MATRIX.md #29 — the admin *editing*
 * UI for jurisdiction rules is future work; this is the lookup/inspection half). Every
 * result surfaces `provenance.stateStatus`/`countyStatus` prominently because this
 * project's seed data is UNVERIFIED demo data, never real legal research
 * (docs/EXTERNAL_DEPENDENCIES.md) — the UI should never let that fact go unnoticed.
 */
export default function JurisdictionsPage() {
  const [stateCode, setStateCode] = useState("");
  const [countyFips, setCountyFips] = useState("");
  const [rule, setRule] = useState<ResolvedRule | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRule(null);
    if (!getSession()) {
      window.location.href = "/login";
      return;
    }
    try {
      const query = countyFips ? `?countyFips=${encodeURIComponent(countyFips)}` : "";
      const res = await apiFetch<{ data: ResolvedRule }>(`/api/v1/jurisdictions/${stateCode.toUpperCase()}${query}`);
      setRule(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lookup failed");
    }
  }

  return (
    <main>
      <h1>Jurisdiction lookup</h1>
      <form onSubmit={onSubmit} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1.5rem" }}>
        <label>
          State code
          <input value={stateCode} onChange={(e) => setStateCode(e.target.value)} maxLength={2} placeholder="CA" style={{ display: "block", padding: "0.4rem", width: 80 }} required />
        </label>
        <label>
          County FIPS (optional)
          <input value={countyFips} onChange={(e) => setCountyFips(e.target.value)} placeholder="06037" style={{ display: "block", padding: "0.4rem", width: 120 }} />
        </label>
        <button type="submit" style={{ padding: "0.5rem 1rem" }}>Look up</button>
      </form>

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      {rule && (
        <div>
          <p style={{ background: "#fef3c7", padding: "0.6rem 1rem", borderRadius: 4, fontSize: "0.9rem" }}>
            Data status: state <strong>{rule.provenance.stateStatus}</strong>
            {rule.provenance.countyStatus && (
              <>
                , county <strong>{rule.provenance.countyStatus}</strong>
              </>
            )}{" "}
            — demo/seed data, not verified legal research. See docs/EXTERNAL_DEPENDENCIES.md.
          </p>
          <table style={{ borderCollapse: "collapse" }}>
            <tbody>
              {[
                ["Theory type", rule.theoryType],
                ["Document type", rule.docType],
                ["Statutory deadline (days)", String(rule.statutoryDeadlineDays)],
                ["Daily penalty", `$${(rule.dailyPenaltyCents / 100).toFixed(2)}`],
                ["Trustee required", rule.trusteeRequired ? "Yes" : "No"],
                ["Top margin (in)", String(rule.topMarginInches)],
                ["Notary type", rule.notaryType],
                ["eRecording network", rule.eRecordingNetwork],
                ["Base recording fee", `$${(rule.baseRecordingFeeCents / 100).toFixed(2)}`],
                ["Per-page fee", `$${(rule.perPageFeeCents / 100).toFixed(2)}`],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td style={{ padding: "0.3rem 1rem 0.3rem 0", color: "#666", fontWeight: 600 }}>{label}</td>
                  <td style={{ padding: "0.3rem 0" }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
