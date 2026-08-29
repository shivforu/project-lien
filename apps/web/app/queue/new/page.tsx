"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getSession, ApiError, type Session } from "../../../lib/api-client";

interface CreatedPackage {
  id: string;
}

/**
 * Create-package form (docs/DECISIONS.md D35). `POST /releases` requires an existing
 * `loanId`/`propertyId` and this build has no endpoint to create either one
 * (docs/QE_QUICKSTART.md section 10), so the only real choices are the 5 seeded
 * loan/property pairs from `packages/db/src/seed.ts` — hardcoded here rather than fetched,
 * since there's no GET /loans or GET /properties endpoint to list them from. Each option is
 * annotated with what actually happens if you pick it (see docs/QE_QUICKSTART.md section
 * 10's trustee/MANUAL-network gaps) so the form doesn't quietly set someone up to be
 * confused a few clicks later.
 */
const LOAN_PROPERTY_OPTIONS = [
  {
    key: "tx",
    label: "Texas / Collin County — James Whitfield (recommended: full happy path works)",
    stateCode: "TX",
    countyFips: "48085",
    loanId: "00000000-0000-0000-0000-200000000002",
    propertyId: "00000000-0000-0000-0000-100000000002",
  },
  {
    key: "fl",
    label: "Florida / Miami-Dade County — Aisha Thompson (recommended: full happy path works)",
    stateCode: "FL",
    countyFips: "12086",
    loanId: "00000000-0000-0000-0000-200000000003",
    propertyId: "00000000-0000-0000-0000-100000000003",
  },
  {
    key: "ny",
    label: "New York / Kings County — David Chen (recommended: full happy path works)",
    stateCode: "NY",
    countyFips: "36047",
    loanId: "00000000-0000-0000-0000-200000000004",
    propertyId: "00000000-0000-0000-0000-100000000004",
  },
  {
    key: "ca",
    label: "California / Los Angeles County — Maria Gonzalez (trustee required — pre-flight will always fail, no way to set a trustee yet)",
    stateCode: "CA",
    countyFips: "06037",
    loanId: "00000000-0000-0000-0000-200000000001",
    propertyId: "00000000-0000-0000-0000-100000000001",
  },
  {
    key: "ga",
    label: "Georgia / Fulton County — Robert Jackson (MANUAL recording network — submission will get permanently stuck)",
    stateCode: "GA",
    countyFips: "13121",
    loanId: "00000000-0000-0000-0000-200000000005",
    propertyId: "00000000-0000-0000-0000-100000000005",
  },
];

export default function NewPackagePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [mounted, setMounted] = useState(false);
  const [packageIdentifier, setPackageIdentifier] = useState("");
  const [optionKey, setOptionKey] = useState(LOAN_PROPERTY_OPTIONS[0]!.key);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      window.location.href = "/login";
      return;
    }
    setSession(s);
    setMounted(true);
  }, []);

  if (!mounted || !session) return <p>Loading…</p>;

  if (session.role === "VIEWER") {
    return (
      <main>
        <h1>New package</h1>
        <p style={{ color: "#666" }}>
          You're logged in as VIEWER — this role is read-only, so package creation is
          disabled. Log in as an OPERATOR or ORG_ADMIN account to create a package.
        </p>
      </main>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!packageIdentifier.trim()) {
      setError("Package identifier is required.");
      return;
    }
    const option = LOAN_PROPERTY_OPTIONS.find((o) => o.key === optionKey)!;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CreatedPackage }>("/api/v1/releases", {
        method: "POST",
        body: JSON.stringify({
          packageIdentifier: packageIdentifier.trim(),
          loanId: option.loanId,
          propertyId: option.propertyId,
          stateCode: option.stateCode,
          countyFips: option.countyFips,
        }),
      });
      router.push(`/queue/${res.data.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create package");
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>New package</h1>
      <p style={{ color: "#666", maxWidth: 640 }}>
        There's no way to create a brand-new loan or property in this build, so every
        package has to attach to one of the 5 seeded ones below — pick the jurisdiction you
        want to test with.
      </p>

      <form onSubmit={handleSubmit} style={{ maxWidth: 640, marginTop: "1.5rem" }}>
        <label style={{ display: "block", marginBottom: "1rem" }}>
          <span style={{ display: "block", fontWeight: 600, marginBottom: "0.3rem" }}>Package identifier</span>
          <input
            type="text"
            value={packageIdentifier}
            onChange={(e) => setPackageIdentifier(e.target.value)}
            placeholder="e.g. QE-TEST-001"
            style={{ width: "100%", padding: "0.5rem", fontSize: "1rem" }}
          />
        </label>

        <label style={{ display: "block", marginBottom: "1.5rem" }}>
          <span style={{ display: "block", fontWeight: 600, marginBottom: "0.3rem" }}>Loan / property</span>
          <select
            value={optionKey}
            onChange={(e) => setOptionKey(e.target.value)}
            style={{ width: "100%", padding: "0.5rem", fontSize: "1rem" }}
          >
            {LOAN_PROPERTY_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

        <button type="submit" disabled={submitting} style={{ padding: "0.6rem 1.2rem", fontSize: "1rem" }}>
          {submitting ? "Creating…" : "Create package"}
        </button>
      </form>
    </main>
  );
}
