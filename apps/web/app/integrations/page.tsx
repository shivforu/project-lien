"use client";

import { useEffect, useState } from "react";
import { apiFetch, getSession, ApiError } from "../../lib/api-client";

interface IntegrationConnection {
  id: string;
  connector_type: string;
  vendor: string;
  health: string;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ListResponse {
  data: IntegrationConnection[];
}

const HEALTH_COLORS: Record<string, string> = {
  HEALTHY: "#15803d",
  DEGRADED: "#b45309",
  DOWN: "#b91c1c",
  UNKNOWN: "#6b7280",
};

/**
 * Connector/integration health (docs/REQUIREMENTS_MATRIX.md #30), backed by
 * GET /api/v1/integrations (apps/api/src/routes/integrations.ts) over the
 * `integration_connections` table. This is a read model, not a live probe — see that
 * route's doc comment.
 */
export default function IntegrationsPage() {
  const [connections, setConnections] = useState<IntegrationConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      window.location.href = "/login";
      return;
    }
    apiFetch<ListResponse>("/api/v1/integrations")
      .then((res) => setConnections(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load integrations"));
  }, []);

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;
  if (!connections) return <p>Loading…</p>;

  return (
    <main>
      <h1>Integrations</h1>
      {connections.length === 0 ? (
        <p style={{ color: "#666" }}>No integration connections configured for this organization yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th style={{ padding: "0.5rem" }}>Connector type</th>
              <th style={{ padding: "0.5rem" }}>Vendor</th>
              <th style={{ padding: "0.5rem" }}>Health</th>
              <th style={{ padding: "0.5rem" }}>Last checked</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((conn) => (
              <tr key={conn.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem" }}>{conn.connector_type}</td>
                <td style={{ padding: "0.5rem" }}>{conn.vendor}</td>
                <td style={{ padding: "0.5rem", color: HEALTH_COLORS[conn.health] ?? "#111827", fontWeight: 600 }}>{conn.health}</td>
                <td style={{ padding: "0.5rem" }}>{conn.last_checked_at ? new Date(conn.last_checked_at).toLocaleString() : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
