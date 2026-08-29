import type { Kysely } from "kysely";
import type { ActorType, Database } from "@project-lien/db";

export interface RecordAuditEventInput {
  organizationId: string | null;
  actorType: ActorType;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: unknown;
  correlationId?: string | null;
}

/**
 * Appends one immutable audit trail entry (docs/REQUIREMENTS_MATRIX.md #24). This is
 * separate from `workflow_events` (which is specifically the package status-transition
 * history): `audit_events` covers actor-attributable actions across the whole system —
 * auth, package creation, webhook registration, and so on — regardless of whether a
 * package status changed. There is no update or delete path for this table by design.
 */
export async function recordAuditEvent(db: Kysely<Database>, input: RecordAuditEventInput): Promise<void> {
  await db
    .insertInto("audit_events")
    .values({
      organization_id: input.organizationId,
      actor_type: input.actorType,
      actor_user_id: input.actorUserId ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      details: input.details === undefined ? null : JSON.stringify(input.details),
      correlation_id: input.correlationId ?? null,
    })
    .execute();
}
