import type { Kysely } from "kysely";
import type { Database } from "@project-lien/db";
import type { Logger } from "@project-lien/shared-config";

export interface JobHandlerContext {
  db: Kysely<Database>;
  logger: Logger;
}

export type JobHandler = (payload: unknown, ctx: JobHandlerContext) => Promise<void>;
