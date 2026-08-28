"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, getSession, ApiError } from "../../../lib/api-client";

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

/**
 * Package detail screen. A document viewer with pre-flight overlay
 * (docs/REQUIREMENTS_MATRIX.md #28) and a workflow-event timeline are natural next
 * additions once there's a document-serving endpoint to view against — not built in this
 * pass; this screen shows the package's own record fields, which is what the API
 * currently exposes.
 */
export default function PackageDetailPage() {
  const params = useParams<{ id: string }>();
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      window.location.href = "/login";
      return;
    }
    apiFetch<{ data: PackageDetail }>(`/api/v1/releases/${params.id}`)
      .then((res) => setPkg(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load package"));
  }, [params.id]);

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;
  if (!pkg) return <p>Loading…</p>;

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
    </main>
  );
}
