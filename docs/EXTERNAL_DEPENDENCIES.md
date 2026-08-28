# External Dependencies & Unknowns

For each item: what's missing, why we can't fabricate it, and what we built instead.
Nothing below blocks local development — everything runs against the mock/sandbox side.

| Dependency | What's missing | What we built instead | Status |
|---|---|---|---|
| Simplifile API | Real API docs, OAuth client credentials, sandbox account | `IErecordingProvider` interface + `SimplifileMockAdapter` (in-memory, deterministic accept/reject rules) + contract tests | MOCK ONLY |
| CSC (Corporation Service Company) API | Real WSDL/SOAP contract, account credentials | `CscMockAdapter` behind the same interface | MOCK ONLY |
| ePN (eRecording Partners Network) API | Real API docs, credentials | `EpnMockAdapter` behind the same interface | MOCK ONLY |
| PRIA 3.0/4.0 licensed XSD | PRIA membership required to obtain the actual schema | Internal structural validator that checks our own canonical package contract, explicitly not claiming PRIA XSD conformance | UNVERIFIED against real spec |
| Authoritative state statutory rules (all 50 states) | Requires state-by-state legal research/citation | Seeded from Requirements.pdf's own sample data, `status = UNVERIFIED`, `source = requirements_pdf_transcript` for every row | UNVERIFIED |
| County-level FIPS fee schedules (~3,000 counties) | No accessible authoritative dataset | A handful of hand-picked demo counties only; unknown counties fall back to state defaults with `status = UNVERIFIED` | PARTIAL / DEMO ONLY |
| e-Notary provider (Notarize/Proof/DocuSign) | Credentials/API access | `INotaryProvider` interface + manual/mock implementation (operator marks notarized) | MOCK ONLY |
| LOS/TMS connectors (Encompass, Qualia, SoftPro, RamQuest) | Vendor API specs/credentials | Generic inbound mapping interface (`adapters-los`) + one mock connector demonstrating the shape | MOCK ONLY |
| Identity provider (Auth0/Okta) | Tenant/credentials | Local JWT auth behind an interface; SSO swap documented | LOCAL AUTH |
| AWS S3 + KMS | AWS account/credentials | MinIO (S3-compatible) locally, `IDocumentStorage` interface for prod swap | LOCAL EQUIVALENT |
| Bank/wire ledger API | Banking partner integration | Ledger modeled purely as internal double-entry bookkeeping against amounts the API is told about; no real money moves | MOCK / INTERNAL ONLY |
| Geocoding / parcel lookup | No vendor selected | County/FIPS supplied directly by the caller instead of derived from address | NOT NEEDED (see ASSUMPTIONS #4) |

## What "MOCK ONLY" means concretely

Each mock adapter implements the full interface with deterministic, configurable
behavior (e.g., a package whose `packageId` contains `REJECT` will simulate a county
rejection; everything else accepts after a simulated delay). Contract tests assert any
adapter — mock or real — satisfies the same behavioral contract, so swapping in a real
vendor adapter later is a drop-in replacement, not a rewrite of the orchestrator.

## What would unblock each "real" integration

- Simplifile/CSC/ePN: a signed vendor agreement + sandbox credentials + their current
  API/WSDL docs.
- PRIA XSD: PRIA Inc. membership or a licensed copy of the schema.
- Statutory rules: engagement with real-estate/title counsel per state, or a licensed
  compliance-data feed (e.g., a vendor that already maintains this — several exist
  commercially).
- County fee schedules: a licensed data feed, or direct manual entry per county as the
  business onboards them (this is in fact closer to how the real industry does it).
