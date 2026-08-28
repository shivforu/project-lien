-- Project Lien — initial schema.
--
-- This is the single source of truth for the data model. It reconciles every drifting
-- SQL fragment across Requirements.pdf (three different versions of the same tables)
-- plus the entity list the project instructions require. See docs/DECISIONS.md (D2, D9,
-- D10) and docs/REQUIREMENTS_MATRIX.md for what changed and why relative to the source
-- material. Do not copy any single SQL block from Requirements.pdf verbatim.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE org_role AS ENUM ('ORG_ADMIN', 'OPERATOR', 'VIEWER', 'API_CLIENT');

CREATE TYPE theory_type AS ENUM ('LIEN_THEORY', 'TITLE_THEORY', 'INTERMEDIATE_THEORY');

CREATE TYPE doc_type AS ENUM (
  'SATISFACTION_OF_MORTGAGE',
  'DEED_OF_RECONVEYANCE',
  'RELEASE_OF_LIEN',
  'CANCELLATION_OF_SECURITY_DEED',
  'SATISFACTION_OF_SECURITY_INSTRUMENT',
  'CERTIFICATE_OF_SATISFACTION',
  'RELEASE_OF_DEED_OF_TRUST'
);

CREATE TYPE notary_type AS ENUM (
  'STANDARD_CORPORATE', 'CALIFORNIA_JURAT', 'FLORIDA_WITNESS',
  'TEXAS_ACKNOWLEDGMENT', 'GENERIC_ACKNOWLEDGMENT'
);

-- Compliance-data provenance. VERIFIED must never be set without a citable source and
-- a verifiedBy reviewer — see docs/DECISIONS.md D9. All seed data ships UNVERIFIED.
CREATE TYPE rule_status AS ENUM ('VERIFIED', 'UNVERIFIED', 'EXPIRED', 'REVIEW_REQUIRED');

CREATE TYPE pria_level AS ENUM ('LEVEL_1', 'LEVEL_2', 'LEVEL_3');

CREATE TYPE erecording_network AS ENUM ('SIMPLIFILE', 'CSC', 'EPN', 'DIRECT_COUNTY', 'MANUAL');

CREATE TYPE rule_type AS ENUM ('STATE', 'COUNTY');

CREATE TYPE loan_status AS ENUM ('ACTIVE', 'PAYOFF_REQUESTED', 'PAID_IN_FULL', 'RELEASED', 'CLOSED');

-- Normalized package lifecycle — see docs/ARCHITECTURE.md for the transition diagram.
CREATE TYPE package_status AS ENUM (
  'DRAFT', 'VALIDATING', 'PREFLIGHT_FAILED', 'READY', 'PENDING_SIGNATURE',
  'PENDING_NOTARY', 'READY_TO_SUBMIT', 'SUBMITTING', 'SUBMITTED', 'COUNTY_PROCESSING',
  'REJECTED', 'RESUBMISSION_REQUIRED', 'RECORDED', 'RECONCILING', 'COMPLETE',
  'FAILED', 'CANCELLED'
);

CREATE TYPE party_role AS ENUM ('BORROWER', 'GRANTOR', 'GRANTEE', 'LENDER', 'TRUSTEE', 'WITNESS', 'NOTARY', 'SUBMITTER');

CREATE TYPE document_kind AS ENUM (
  'ORIGINAL_SCAN', 'GENERATED_RELEASE', 'NORMALIZED', 'SIGNED_NOTARIZED',
  'SUBMISSION_PAYLOAD', 'COUNTY_RESPONSE', 'RECORDED_COPY', 'RECEIPT'
);

CREATE TYPE preflight_severity AS ENUM ('BLOCKING', 'WARNING');

CREATE TYPE vendor_submission_status AS ENUM ('PENDING', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'FAILED', 'CANCELLED');

CREATE TYPE vendor_event_type AS ENUM ('SUBMITTED', 'POLLED', 'WEBHOOK_RECEIVED', 'STATUS_CHANGED', 'ERROR');

CREATE TYPE job_status AS ENUM ('QUEUED', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER');

CREATE TYPE ledger_transaction_type AS ENUM (
  'PAYOFF_DEPOSIT', 'RECORDING_FEE_HELD', 'RECORDING_FEE_REMITTED',
  'ESCROW_REFUND_ISSUED', 'DEFICIT_COVERED', 'ADJUSTMENT'
);

CREATE TYPE fee_reconciliation_status AS ENUM ('BALANCED', 'REFUND_QUEUED', 'DEFICIT_COVERED');

CREATE TYPE webhook_delivery_status AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'DEAD_LETTER');

CREATE TYPE connector_type AS ENUM ('LOS_TMS', 'ERECORDING', 'NOTARY', 'STORAGE', 'IDENTITY');

CREATE TYPE connector_health AS ENUM ('HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN');

CREATE TYPE actor_type AS ENUM ('SYSTEM', 'USER', 'API');

-- ---------------------------------------------------------------------------
-- Tenancy & identity
-- ---------------------------------------------------------------------------

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE org_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role org_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(16) NOT NULL,
  hashed_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- Jurisdiction & compliance engine
-- ---------------------------------------------------------------------------

CREATE TABLE state_jurisdiction_rules (
  state_code VARCHAR(2) PRIMARY KEY,
  state_name VARCHAR(50) NOT NULL,
  theory_type theory_type NOT NULL,
  default_doc_type doc_type NOT NULL,
  statutory_deadline_days INT NOT NULL,
  daily_penalty_cents INT NOT NULL DEFAULT 0,
  trustee_required BOOLEAN NOT NULL DEFAULT false,
  witnesses_required INT NOT NULL DEFAULT 0,
  top_margin_inches NUMERIC(3,2) NOT NULL DEFAULT 3.00,
  bottom_margin_inches NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  side_margin_inches NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  notary_type notary_type NOT NULL DEFAULT 'STANDARD_CORPORATE',
  source VARCHAR(255) NOT NULL DEFAULT 'requirements_pdf_transcript',
  status rule_status NOT NULL DEFAULT 'UNVERIFIED',
  effective_date DATE,
  verified_at TIMESTAMPTZ,
  verified_by VARCHAR(255),
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE county_jurisdiction_rules (
  county_fips VARCHAR(10) PRIMARY KEY,
  state_code VARCHAR(2) NOT NULL REFERENCES state_jurisdiction_rules(state_code),
  county_name VARCHAR(100) NOT NULL,
  base_recording_fee_cents INT NOT NULL DEFAULT 3000,
  per_page_fee_cents INT NOT NULL DEFAULT 500,
  cover_page_required BOOLEAN NOT NULL DEFAULT false,
  cover_page_fee_cents INT NOT NULL DEFAULT 0,
  accepted_pria_level pria_level NOT NULL DEFAULT 'LEVEL_2',
  custom_top_margin_inches NUMERIC(3,2),
  e_recording_network erecording_network NOT NULL DEFAULT 'MANUAL',
  source VARCHAR(255) NOT NULL DEFAULT 'requirements_pdf_transcript',
  status rule_status NOT NULL DEFAULT 'UNVERIFIED',
  effective_date DATE,
  verified_at TIMESTAMPTZ,
  verified_by VARCHAR(255),
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_county_rules_state ON county_jurisdiction_rules(state_code);

CREATE TABLE rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type rule_type NOT NULL,
  rule_key VARCHAR(20) NOT NULL,
  snapshot JSONB NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by VARCHAR(255),
  change_reason TEXT
);
CREATE INDEX idx_rule_versions_key ON rule_versions(rule_type, rule_key);

-- ---------------------------------------------------------------------------
-- Loans & properties
-- ---------------------------------------------------------------------------

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  parcel_number VARCHAR(100) NOT NULL,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state_code VARCHAR(2) NOT NULL REFERENCES state_jurisdiction_rules(state_code),
  zip_code VARCHAR(10) NOT NULL,
  county_fips VARCHAR(10) NOT NULL REFERENCES county_jurisdiction_rules(county_fips),
  county_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_properties_org ON properties(organization_id);
CREATE INDEX idx_properties_fips ON properties(county_fips);

CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  loan_number VARCHAR(100) NOT NULL UNIQUE,
  property_id UUID NOT NULL REFERENCES properties(id),
  unpaid_principal_cents INT NOT NULL,
  interest_rate_bps INT NOT NULL,
  original_book VARCHAR(50),
  original_page VARCHAR(50),
  original_instrument_number VARCHAR(100),
  borrower_name VARCHAR(255) NOT NULL,
  status loan_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_loans_org ON loans(organization_id);
CREATE INDEX idx_loans_status ON loans(status);

CREATE TABLE payoff_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id),
  quote_date DATE NOT NULL,
  expiration_date DATE NOT NULL,
  per_diem_cents INT NOT NULL,
  total_payoff_cents INT NOT NULL,
  wire_reference VARCHAR(100) UNIQUE,
  is_settled BOOLEAN NOT NULL DEFAULT false,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payoff_quotes_loan ON payoff_quotes(loan_id);

-- ---------------------------------------------------------------------------
-- Recording packages (the workflow spine)
-- ---------------------------------------------------------------------------

CREATE TABLE recording_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  package_identifier VARCHAR(100) NOT NULL UNIQUE,
  loan_id UUID NOT NULL REFERENCES loans(id),
  property_id UUID NOT NULL REFERENCES properties(id),
  state_code VARCHAR(2) NOT NULL REFERENCES state_jurisdiction_rules(state_code),
  county_fips VARCHAR(10) NOT NULL REFERENCES county_jurisdiction_rules(county_fips),
  status package_status NOT NULL DEFAULT 'DRAFT',
  document_type doc_type NOT NULL,
  statutory_deadline DATE NOT NULL,
  rejection_reason TEXT,
  county_tracking_number VARCHAR(100),
  recorded_book VARCHAR(50),
  recorded_page VARCHAR(50),
  recorded_instrument_number VARCHAR(100),
  recording_fee_charged_cents INT,
  submitted_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_packages_org ON recording_packages(organization_id);
CREATE INDEX idx_packages_status ON recording_packages(status);
CREATE INDEX idx_packages_deadline ON recording_packages(statutory_deadline);

CREATE TABLE parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES recording_packages(id) ON DELETE CASCADE,
  role party_role NOT NULL,
  sequence_number INT NOT NULL DEFAULT 1,
  is_organization BOOLEAN NOT NULL DEFAULT false,
  name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_parties_package ON parties(package_id);

-- ---------------------------------------------------------------------------
-- Documents & versions
-- ---------------------------------------------------------------------------

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES recording_packages(id) ON DELETE CASCADE,
  kind document_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_package ON documents(package_id);

CREATE TABLE document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INT NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  page_count INT,
  checksum_sha256 VARCHAR(64) NOT NULL,
  byte_size INT NOT NULL,
  previous_version_id UUID REFERENCES document_versions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(255),
  UNIQUE (document_id, version)
);

-- ---------------------------------------------------------------------------
-- Pre-flight
-- ---------------------------------------------------------------------------

CREATE TABLE preflight_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES recording_packages(id) ON DELETE CASCADE,
  passed BOOLEAN NOT NULL,
  engine_version VARCHAR(50) NOT NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_preflight_runs_package ON preflight_runs(package_id);

CREATE TABLE preflight_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preflight_run_id UUID NOT NULL REFERENCES preflight_runs(id) ON DELETE CASCADE,
  severity preflight_severity NOT NULL,
  code VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  page_number INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_preflight_findings_run ON preflight_findings(preflight_run_id);

-- ---------------------------------------------------------------------------
-- Vendor dispatch
-- ---------------------------------------------------------------------------

CREATE TABLE vendor_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES recording_packages(id) ON DELETE CASCADE,
  network erecording_network NOT NULL,
  attempt INT NOT NULL DEFAULT 1,
  vendor_tracking_id VARCHAR(255),
  county_tracking_id VARCHAR(255),
  status vendor_submission_status NOT NULL DEFAULT 'PENDING',
  request_payload JSONB,
  response_payload JSONB,
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendor_submissions_package ON vendor_submissions(package_id);
CREATE INDEX idx_vendor_submissions_tracking ON vendor_submissions(vendor_tracking_id);

CREATE TABLE vendor_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_submission_id UUID NOT NULL REFERENCES vendor_submissions(id) ON DELETE CASCADE,
  event_type vendor_event_type NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendor_events_submission ON vendor_events(vendor_submission_id);

-- ---------------------------------------------------------------------------
-- Workflow / orchestration (DB-backed job queue — see docs/DECISIONS.md D3)
-- ---------------------------------------------------------------------------

CREATE TABLE workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES recording_packages(id) ON DELETE CASCADE,
  from_status package_status,
  to_status package_status NOT NULL,
  actor VARCHAR(255) NOT NULL,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workflow_events_package ON workflow_events(package_id);

CREATE TABLE workflow_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID REFERENCES recording_packages(id) ON DELETE CASCADE,
  job_type VARCHAR(100) NOT NULL,
  status job_status NOT NULL DEFAULT 'QUEUED',
  payload JSONB NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(255),
  idempotency_key VARCHAR(255) UNIQUE,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workflow_jobs_claim ON workflow_jobs(status, available_at);

-- ---------------------------------------------------------------------------
-- Escrow & fees
-- ---------------------------------------------------------------------------

CREATE TABLE escrow_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  loan_id UUID NOT NULL UNIQUE REFERENCES loans(id),
  balance_cents INT NOT NULL DEFAULT 0,
  held_recording_fee_cents INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ledger_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_account_id UUID NOT NULL REFERENCES escrow_accounts(id),
  type ledger_transaction_type NOT NULL,
  amount_cents INT NOT NULL,
  reference_package_id UUID REFERENCES recording_packages(id),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_txn_account ON ledger_transactions(escrow_account_id);

CREATE TABLE fee_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES recording_packages(id) ON DELETE CASCADE,
  county_fips VARCHAR(10) NOT NULL,
  base_fee_cents INT NOT NULL,
  per_page_fee_cents INT NOT NULL,
  cover_page_fee_cents INT NOT NULL,
  page_count INT NOT NULL,
  total_estimated_cents INT NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fee_estimates_package ON fee_estimates(package_id);

CREATE TABLE fee_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES recording_packages(id) ON DELETE CASCADE,
  estimated_fee_cents INT NOT NULL,
  actual_fee_cents INT NOT NULL,
  variance_cents INT NOT NULL,
  status fee_reconciliation_status NOT NULL,
  refund_amount_cents INT NOT NULL DEFAULT 0,
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fee_reconciliations_package ON fee_reconciliations(package_id);

-- ---------------------------------------------------------------------------
-- Webhooks
-- ---------------------------------------------------------------------------

CREATE TABLE webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  subscribed_events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status webhook_delivery_status NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  response_status_code INT,
  delivery_key VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(webhook_endpoint_id);

-- ---------------------------------------------------------------------------
-- Integrations & audit
-- ---------------------------------------------------------------------------

CREATE TABLE integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  connector_type connector_type NOT NULL,
  vendor VARCHAR(100) NOT NULL,
  config JSONB NOT NULL,
  health connector_health NOT NULL DEFAULT 'UNKNOWN',
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  actor_type actor_type NOT NULL,
  actor_user_id UUID REFERENCES users(id),
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(255),
  details JSONB,
  correlation_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_events_org ON audit_events(organization_id);
CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);
