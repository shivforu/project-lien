import { Router } from "express";
import { z } from "zod";
import type { Kysely } from "kysely";
import type { Database } from "@project-lien/db";
import { findCountyRule } from "@project-lien/domain-jurisdiction";
import { calculateRecordingFee } from "@project-lien/domain-fees";
import { asyncHandler } from "../async-handler.js";

const calculateSchema = z.object({ countyFips: z.string().min(1), pageCount: z.number().int().min(1) });

export function createFeesRouter(db: Kysely<Database>): Router {
  const router = Router();

  router.post("/calculate", asyncHandler(async (req, res) => {
    const parsed = calculateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.issues } });
      return;
    }

    const county = await findCountyRule(db, parsed.data.countyFips);
    if (!county) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: `No county rule for FIPS '${parsed.data.countyFips}'` } });
      return;
    }

    const breakdown = calculateRecordingFee(
      {
        baseRecordingFeeCents: county.baseRecordingFeeCents,
        perPageFeeCents: county.perPageFeeCents,
        coverPageRequired: county.coverPageRequired,
        coverPageFeeCents: county.coverPageFeeCents,
      },
      { pageCount: parsed.data.pageCount },
    );

    res.status(200).json({ data: breakdown });
  }));

  return router;
}
