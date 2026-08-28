# Assumptions

These fill gaps Requirements.pdf left open. Each is flagged so it can be revisited with
the user rather than silently baked in.

1. **Single primary "release" concept.** Requirements.pdf uses "lien release,"
   "satisfaction of mortgage," "deed of reconveyance," and "recording package"
   somewhat interchangeably. We model one entity, `recording_packages`, whose
   `document_type` is resolved from jurisdiction rules, and treat "release" as the
   product-level/API term for it.
2. **One property per package, one loan per property (v1).** Requirements.pdf never
   discusses multi-property or multi-loan packages (e.g., blanket liens). Schema leaves
   room to extend later but v1 assumes 1:1:1 loan/property/package.
3. **Organizations are title/escrow companies or servicers, not individual consumers.**
   The UI/API are B2B operator tools, per the "Title/Escrow operations UI" requirement —
   there is no borrower-facing portal in v1, even though early transcript pages (page 4)
   mention a "Borrower/Title Portal."
4. **County is resolved from FIPS code supplied by the caller,** not derived from a raw
   street address via geocoding — no geocoding vendor is available, and Requirements.pdf
   never specifies one. Address is stored for the document body; FIPS drives rule
   resolution.
5. **"Trustee" and "witness" requirements are captured as structured flags and free-text
   party roles, not validated against a roster of licensed trustees/witnesses** — no such
   registry exists or was specified.
6. **Notary session is represented as a status + metadata record, not a live e-notary
   integration**, since no e-notary vendor credentials exist. Operators mark a package
   notarized; the system stores who/when and any uploaded evidence file.
7. **Currency is USD only, stored as integer cents** (never floating point), per the
   explicit no-floating-point-currency requirement.
8. **"Statutory deadline" clock starts at payoff/settlement date**, consistent with every
   version of the transcript's schema (`statutory_deadline` computed from a base date +
   `statutory_deadline_days`). We do not model jurisdictions where the clock could start
   at a different event (e.g., request date) because the source material never
   distinguishes this.
9. **Demo/seed data is intentionally small and clearly fictional** (a handful of loans,
   properties, and packages across a handful of states/counties) — not an attempt to
   simulate real production volume.
10. **"Direct-to-county" adapters are a routing target/interface, not implemented in v1**
    beyond the interface and a mock — Requirements.pdf treats this as future work
    ("Future direct-to-county adapters") and no county offers a public integration spec
    we could target honestly.
11. **Multi-tenancy is organization-scoped row-level isolation, not separate databases
    per tenant** — appropriate for the expected scale and consistent with "tenant
    isolation" rather than "tenant sharding" in the requirements.
