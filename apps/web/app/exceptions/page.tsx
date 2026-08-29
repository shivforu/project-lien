"use client";

import { useEffect, useState } from "react";
import { apiFetch, getSession, ApiError } from "../../lib/api-client";

interface PackageException {
  id: string;
  package_identifier: string;
  status: string;
  statutory_deadline: string;
  updated_at: string;
}

interface JobException {
  id: string;
  jobType: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
  packageId: string;
  packageIdentifier: string;
}

interface ExceptionsResponse {
  data: { packageExceptions: PackageException[]; jobExceptions: JobException[] };
}

/**
 * The exception center (docs/REQUIREMENTS_MATRIX.md #23/#27) — the single screen an
 * operator works from to clear stuck packages (REJECTED / RESUBMISSION_REQUIRED) and
 * dead-lettered background jobs, backed by GET/POST /api/v1/exceptions*
 * (apps/api/src/routes/exceptions.ts).
 */
export default function ExceptionsPage() {
  const [packageExceptions, setPackageExceptions] = useState<PackageException[] | null>(null);
  const [jobExceptions, setJobExceptions] = useState<JobException[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  function load() {
    apiFetch<ExceptionsResponse>("/api/v1/exceptions")
      .then((res) => {
        setPackageExceptions(res.data.packageExceptions);
        setJobExceptions(res.data.jobExceptions);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load exceptions"));
  }

  useEffect(() => {
    const session = getSession();
    if (!session) {
      window.location.href = "/login";
      return;
    }
    load();
  }, []);

  async function resolve(id: string) {
    setResolvingId(id);
    setError(null);
    try {
      await apiFetch(`/api/v1/exceptions/${id}/resolve`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to resolve exception");
    } finally {
      setResolvingId(null);
    }
  }

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;
  if (!packageExceptions || !jobExceptions) return <p>Loading…</p>;

  return (
    <main>
      <h1>Exception center</h1>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Packages needing attention</h2>
        {packageExceptions.length === 0 ? (
          <p style={{ color: "#666" }}>No package exceptions right now.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                <th style={{ padding: "0.5rem" }}>Package</th>
                <th style={{ padding: "0.5rem" }}>Status</th>
                <th style={{ padding: "0.5rem" }}>Statutory deadline</th>
                <th style={{ padding: "0.5rem" }}>Last updated</th>
                <th style={{ padding: "0.5rem" }} />
              </tr>
            </thead>
            <tbody>
              {packageExceptions.map((pkg) => (
                <tr key={pkg.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.5rem" }}>{pkg.package_identifier}</td>
                  <td style={{ padding: "0.5rem", color: "#b91c1c", fontWeight: 600 }}>{pkg.status}</td>
                  <td style={{ padding: "0.5rem" }}>{new Date(pkg.statutory_deadline).toLocaleDateString()}</td>
                  <td style={{ padding: "0.5rem" }}>{new Date(pkg.updated_at).toLocaleString()}</td>
                  <td style={{ padding: "0.5rem" }}>
                    <button onClick={() => resolve(pkg.id)} disabled={resolvingId === pkg.id}>
                      {resolvingId === pkg.id ? "Resolving…" : "Resolve"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Dead-lettered jobs</h2>
        {jobExceptions.length === 0 ? (
          <p style={{ color: "#666" }}>No dead-lettered jobs right now.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                <th style={{ padding: "0.5rem" }}>Job type</th>
                <th style={{ padding: "0.5rem" }}>Package</th>
                <th style={{ padding: "0.5rem" }}>Attempts</th>
                <th style={{ padding: "0.5rem" }}>Last error</th>
                <th style={{ padding: "0.5rem" }} />
              </tr>
            </thead>
            <tbody>
              {jobExceptions.map((job) => (
                <tr key={job.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.5rem" }}>{job.jobType}</td>
                  <td style={{ padding: "0.5rem" }}>{job.packageIdentifier}</td>
                  <td style={{ padding: "0.5rem" }}>{job.attempts}</td>
                  <td style={{ padding: "0.5rem", color: "#666", fontSize: "0.85rem" }}>{job.lastError ?? "—"}</td>
                  <td style={{ padding: "0.5rem" }}>
                    <button onClick={() => resolve(job.id)} disabled={resolvingId === job.id}>
                      {resolvingId === job.id ? "Retrying…" : "Retry"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
