"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, getSession, ApiError } from "../../lib/api-client";

interface PackageRow {
  id: string;
  package_identifier: string;
  status: string;
  state_code: string;
  county_fips: string;
  statutory_deadline: string;
  rejection_reason: string | null;
}

interface ListResponse {
  data: PackageRow[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#6b7280",
  REJECTED: "#b91c1c",
  RESUBMISSION_REQUIRED: "#b45309",
  RECORDED: "#15803d",
  COMPLETE: "#15803d",
};

/**
 * The operations queue (docs/REQUIREMENTS_MATRIX.md #26) — every recording package for
 * the caller's organization. Sorting/filtering by status, an at-risk-deadline callout,
 * and the full dashboard metrics tile row (#25) are the natural next iteration on top of
 * this list; not built in this pass — see PROGRESS.md Phase 10 report.
 */
export default function QueuePage() {
  const [packages, setPackages] = useState<PackageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      window.location.href = "/login";
      return;
    }
    apiFetch<ListResponse>("/api/v1/releases?limit=50")
      .then((res) => setPackages(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load queue"));
  }, []);

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;
  if (!packages) return <p>Loading…</p>;

  return (
    <main>
      <h1>Recording queue</h1>
      {packages.length === 0 ? (
        <p style={{ color: "#666" }}>No recording packages yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th style={{ padding: "0.5rem" }}>Package</th>
              <th style={{ padding: "0.5rem" }}>Status</th>
              <th style={{ padding: "0.5rem" }}>State / County</th>
              <th style={{ padding: "0.5rem" }}>Statutory deadline</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((pkg) => (
              <tr key={pkg.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem" }}>
                  <Link href={`/queue/${pkg.id}`}>{pkg.package_identifier}</Link>
                </td>
                <td style={{ padding: "0.5rem", color: STATUS_COLORS[pkg.status] ?? "#111827", fontWeight: 600 }}>{pkg.status}</td>
                <td style={{ padding: "0.5rem" }}>
                  {pkg.state_code} / {pkg.county_fips}
                </td>
                <td style={{ padding: "0.5rem" }}>{new Date(pkg.statutory_deadline).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
