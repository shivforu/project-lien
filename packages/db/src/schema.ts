import type { ColumnType, Generated } from "kysely";

// Kysely `Database` interface — hand-maintained mirror of migrations/0001_init.sql.
// Kept in packages/db so every app/package gets the same typed view of the schema.
// If this ever drifts from the SQL, the SQL is the source of truth (see
// docs/DECISIONS.md D2); a future improvement is generating this file from the live
// database with `kysely-codegen` (pure npm, no native binary) instead of hand-syncing.

export type OrgRole = "ORG_ADMIN" | "OPERATOR" | "VIEWER" | "API_CLIENT";
export type TheoryType = "LIEN_THEORY" | "TITLE_THEORY" | "INTERMEDIATE_THEORY";
export type DocType =
  | "SATISFACTION_OF_MORTGAGE"
  | "DEED_OF_RECONVEYANCE"
  | "RELEASE_OF_LIEN"
  | "CANCELLATION_OF_SECURITY_DEED"
  | "SATISFACTION_OF_SECURITY_INSTRUMENT"
  | "CERTIFICATE_OF_SATISFACTION"
  | "RELEASE_OF_DEED_OF_TRUST";
export type NotaryType =
  | "STANDARD_CORPORATE"
  | "CALIFORNIA_JURAT"
  | "FLORIDA_WITNESS"
  | "TEXAS_ACKNOWLEDGMENT"
  | "GENERIC_ACKNOWLEDGMENT";
export type RuleStatus = "VERIFIED" | "UNVERIFIED" | "EXPIRED" | "REVIEW_REQUIRED";
export type PriaLevel = "LEVEL_1" | "LEVEL_2" | "LEVEL_3";
export type ERecordingNetwork = "SIMPLIFILE" | "CSC" | "EPN" | "DIRECT_COUNTY" | "MANUAL";
export type RuleType = "STATE" | "COUNTY";
export type LoanStatus = "ACTIVE" | "PAYOFF_REQUESTED" | "PAID_IN_FULL" | "RELEASED" | "CLOSED";
export type PackageStatus =
  | "DRAFT"
  | "VALIDATING"
  | "PREFLIGHT_FAILED"
  | "READY"
  | "PENDING_SIGNATURE"
  | "PENDING_NOTARY"
  | "READY_TO_SUBMIT"
  | "SUBMITTING"
  | "SUBMITTED"
  | "COUNTY_PROCESSING"
  | "REJECTED"
  | "RESUBMISSION_REQUIRED"
  | "RECORDED"
  | "RECONCILING"
  | "COMPLETE"
  | "FAILED"
  | "CANCELLED";
export type PartyRole =
  | "BORROWER"
  | "GRANTOR"
  | "GRANTEE"
  | "LENDER"
  | "TRUSTEE"
  | "WITNESS"
  | "NOTARY"
  | "SUBMITTER";
export type DocumentKind =
  | "ORIGINAL_SCAN"
  | "GENERATED_RELEASE"
  | "NORMALIZED"
  | "SIGNED_NOTARIZED"
  | "SUBMISSION_PAYLOAD"
  | "COUNTY_RESPONSE"
  | "RECORDED_COPY"
  | "RECEIPT";
export type PreflightSeverity = "BLOCKING" | "WARNING";
export type VendorSubmissionStatus = "PENDING" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "FAILED" | "CANCELLED";
export type VendorEventType = "SUBMITTED" | "POLLED" | "WEBHOOK_RECEIVED" | "STATUS_CHANGED" | "ERROR";
export type JobStatus = "QUEUED" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "DEAD_LETTER";
export type LedgerTransactionType =
  | "PAYOFF_DEPOSIT"
  | "RECORDING_FEE_HELD"
  | "RECORDING_FEE_REMITTED"
  | "ESCROW_REFUND_ISSUED"
  | "DEFICIT_COVERED"
  | "ADJUSTMENT";
export type FeeReconciliationStatus = "BALANCED" | "REFUND_QUEUED" | "DEFICIT_COVERED";
export type WebhookDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED" | "DEAD_LETTER";
export type ConnectorType = "LOS_TMS" | "ERECORDING" | "NOTARY" | "STORAGE" | "IDENTITY";
export type ConnectorHealth = "HEALTHY" | "DEGRADED" | "DOWN" | "UNKNOWN";
export type ActorType = "SYSTEM" | "USER" | "API";

type Timestamp = ColumnType<Date, Date | string, Date | string>;
// NOTE: `Generated<T>` (from Kysely) is `ColumnType<T, T | undefined, T>` — it expects a
// *plain* select type, not another ColumnType. `GeneratedTimestamp` would therefore
// double-wrap into `ColumnType<Timestamp, Timestamp | undefined, Timestamp>`, making the
// insert/update type the `Timestamp` alias itself rather than `Date | string` — a real
// bug caught during Phase 6 build/typecheck when `domain-workflow` tried to insert a
// plain `Date` into a `GeneratedTimestamp` column and `tsc` correctly refused it. Every
// DB-generated timestamp column (created_at/updated_at, and other `now()`-defaulted
// columns) uses this dedicated type instead, which expresses the same "optional on
// insert, Date on select, Date|string on insert/update" contract without the double-wrap.
type GeneratedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface OrganizationsTable {
  id: Generated<string>;
  name: string;
  slug: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  full_name: string;
  is_active: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface OrgMembershipsTable {
  id: Generated<string>;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  created_at: GeneratedTimestamp;
}

export interface ApiKeysTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  key_prefix: string;
  hashed_key: string;
  created_at: GeneratedTimestamp;
  revoked_at: Timestamp | null;
}

export interface StateJurisdictionRulesTable {
  state_code: string;
  state_name: string;
  theory_type: TheoryType;
  default_doc_type: DocType;
  statutory_deadline_days: number;
  daily_penalty_cents: Generated<number>;
  trustee_required: Generated<boolean>;
  witnesses_required: Generated<number>;
  top_margin_inches: Generated<string>;
  bottom_margin_inches: Generated<string>;
  side_margin_inches: Generated<string>;
  notary_type: Generated<NotaryType>;
  source: Generated<string>;
  status: Generated<RuleStatus>;
  effective_date: Timestamp | null;
  verified_at: Timestamp | null;
  verified_by: string | null;
  version: Generated<number>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface CountyJurisdictionRulesTable {
  county_fips: string;
  state_code: string;
  county_name: string;
  base_recording_fee_cents: Generated<number>;
  per_page_fee_cents: Generated<number>;
  cover_page_required: Generated<boolean>;
  cover_page_fee_cents: Generated<number>;
  accepted_pria_level: Generated<PriaLevel>;
  custom_top_margin_inches: string | null;
  e_recording_network: Generated<ERecordingNetwork>;
  source: Generated<string>;
  status: Generated<RuleStatus>;
  effective_date: Timestamp | null;
  verified_at: Timestamp | null;
  verified_by: string | null;
  version: Generated<number>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface RuleVersionsTable {
  id: Generated<string>;
  rule_type: RuleType;
  rule_key: string;
  snapshot: unknown;
  changed_at: GeneratedTimestamp;
  changed_by: string | null;
  change_reason: string | null;
}

export interface PropertiesTable {
  id: Generated<string>;
  organization_id: string;
  parcel_number: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state_code: string;
  zip_code: string;
  county_fips: string;
  county_name: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface LoansTable {
  id: Generated<string>;
  organization_id: string;
  loan_number: string;
  property_id: string;
  unpaid_principal_cents: number;
  interest_rate_bps: number;
  original_book: string | null;
  original_page: string | null;
  original_instrument_number: string | null;
  borrower_name: string;
  status: Generated<LoanStatus>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface PayoffQuotesTable {
  id: Generated<string>;
  loan_id: string;
  quote_date: Timestamp;
  expiration_date: Timestamp;
  per_diem_cents: number;
  total_payoff_cents: number;
  wire_reference: string | null;
  is_settled: Generated<boolean>;
  settled_at: Timestamp | null;
  created_at: GeneratedTimestamp;
}

export interface RecordingPackagesTable {
  id: Generated<string>;
  organization_id: string;
  package_identifier: string;
  loan_id: string;
  property_id: string;
  state_code: string;
  county_fips: string;
  status: Generated<PackageStatus>;
  document_type: DocType;
  statutory_deadline: Timestamp;
  rejection_reason: string | null;
  county_tracking_number: string | null;
  recorded_book: string | null;
  recorded_page: string | null;
  recorded_instrument_number: string | null;
  recording_fee_charged_cents: number | null;
  submitted_at: Timestamp | null;
  recorded_at: Timestamp | null;
  completed_at: Timestamp | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface PartiesTable {
  id: Generated<string>;
  package_id: string;
  role: PartyRole;
  sequence_number: Generated<number>;
  is_organization: Generated<boolean>;
  name: string;
  contact_email: string | null;
  created_at: GeneratedTimestamp;
}

export interface DocumentsTable {
  id: Generated<string>;
  package_id: string;
  kind: DocumentKind;
  created_at: GeneratedTimestamp;
}

export interface DocumentVersionsTable {
  id: Generated<string>;
  document_id: string;
  version: number;
  storage_key: string;
  mime_type: string;
  page_count: number | null;
  checksum_sha256: string;
  byte_size: number;
  previous_version_id: string | null;
  created_at: GeneratedTimestamp;
  created_by: string | null;
}

export interface PreflightRunsTable {
  id: Generated<string>;
  package_id: string;
  passed: boolean;
  engine_version: string;
  ran_at: GeneratedTimestamp;
}

export interface PreflightFindingsTable {
  id: Generated<string>;
  preflight_run_id: string;
  severity: PreflightSeverity;
  code: string;
  message: string;
  page_number: number | null;
  created_at: GeneratedTimestamp;
}

export interface VendorSubmissionsTable {
  id: Generated<string>;
  package_id: string;
  network: ERecordingNetwork;
  attempt: Generated<number>;
  vendor_tracking_id: string | null;
  county_tracking_id: string | null;
  status: Generated<VendorSubmissionStatus>;
  request_payload: unknown;
  response_payload: unknown;
  rejection_reason: string | null;
  submitted_at: Timestamp | null;
  responded_at: Timestamp | null;
  created_at: GeneratedTimestamp;
}

export interface VendorEventsTable {
  id: Generated<string>;
  vendor_submission_id: string;
  event_type: VendorEventType;
  payload: unknown;
  occurred_at: GeneratedTimestamp;
}

export interface WorkflowEventsTable {
  id: Generated<string>;
  package_id: string;
  from_status: PackageStatus | null;
  to_status: PackageStatus;
  actor: string;
  reason: string | null;
  metadata: unknown;
  created_at: GeneratedTimestamp;
}

export interface WorkflowJobsTable {
  id: Generated<string>;
  package_id: string | null;
  job_type: string;
  status: Generated<JobStatus>;
  payload: unknown;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  available_at: GeneratedTimestamp;
  locked_at: Timestamp | null;
  locked_by: string | null;
  idempotency_key: string | null;
  last_error: string | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface EscrowAccountsTable {
  id: Generated<string>;
  organization_id: string;
  loan_id: string;
  balance_cents: Generated<number>;
  held_recording_fee_cents: Generated<number>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface LedgerTransactionsTable {
  id: Generated<string>;
  escrow_account_id: string;
  type: LedgerTransactionType;
  amount_cents: number;
  reference_package_id: string | null;
  description: string;
  created_at: GeneratedTimestamp;
}

export interface FeeEstimatesTable {
  id: Generated<string>;
  package_id: string;
  county_fips: string;
  base_fee_cents: number;
  per_page_fee_cents: number;
  cover_page_fee_cents: number;
  page_count: number;
  total_estimated_cents: number;
  calculated_at: GeneratedTimestamp;
}

export interface FeeReconciliationsTable {
  id: Generated<string>;
  package_id: string;
  estimated_fee_cents: number;
  actual_fee_cents: number;
  variance_cents: number;
  status: FeeReconciliationStatus;
  refund_amount_cents: Generated<number>;
  reconciled_at: GeneratedTimestamp;
}

export interface WebhookEndpointsTable {
  id: Generated<string>;
  organization_id: string;
  url: string;
  secret: string;
  subscribed_events: string[];
  is_active: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface WebhookDeliveriesTable {
  id: Generated<string>;
  webhook_endpoint_id: string;
  event_type: string;
  payload: unknown;
  status: Generated<WebhookDeliveryStatus>;
  attempts: Generated<number>;
  last_attempt_at: Timestamp | null;
  response_status_code: number | null;
  delivery_key: string;
  created_at: GeneratedTimestamp;
}

export interface IntegrationConnectionsTable {
  id: Generated<string>;
  organization_id: string;
  connector_type: ConnectorType;
  vendor: string;
  config: unknown;
  health: Generated<ConnectorHealth>;
  last_checked_at: Timestamp | null;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface AuditEventsTable {
  id: Generated<string>;
  organization_id: string | null;
  actor_type: ActorType;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: unknown;
  correlation_id: string | null;
  created_at: GeneratedTimestamp;
}

export interface Database {
  organizations: OrganizationsTable;
  users: UsersTable;
  org_memberships: OrgMembershipsTable;
  api_keys: ApiKeysTable;
  state_jurisdiction_rules: StateJurisdictionRulesTable;
  county_jurisdiction_rules: CountyJurisdictionRulesTable;
  rule_versions: RuleVersionsTable;
  properties: PropertiesTable;
  loans: LoansTable;
  payoff_quotes: PayoffQuotesTable;
  recording_packages: RecordingPackagesTable;
  parties: PartiesTable;
  documents: DocumentsTable;
  document_versions: DocumentVersionsTable;
  preflight_runs: PreflightRunsTable;
  preflight_findings: PreflightFindingsTable;
  vendor_submissions: VendorSubmissionsTable;
  vendor_events: VendorEventsTable;
  workflow_events: WorkflowEventsTable;
  workflow_jobs: WorkflowJobsTable;
  escrow_accounts: EscrowAccountsTable;
  ledger_transactions: LedgerTransactionsTable;
  fee_estimates: FeeEstimatesTable;
  fee_reconciliations: FeeReconciliationsTable;
  webhook_endpoints: WebhookEndpointsTable;
  webhook_deliveries: WebhookDeliveriesTable;
  integration_connections: IntegrationConnectionsTable;
  audit_events: AuditEventsTable;
}
