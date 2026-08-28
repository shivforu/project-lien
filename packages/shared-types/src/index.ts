/**
 * Cross-cutting TypeScript types shared between apps/api, apps/worker, and apps/web
 * that aren't database row shapes (those live in @project-lien/db). Grows through
 * later phases as the API request/response DTOs and webhook event payloads are
 * defined (Phase 8) — see docs/API.md.
 */

export interface RequestContext {
  requestId: string;
  organizationId: string;
  userId?: string;
  correlationId?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}
