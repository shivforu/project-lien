import { Router } from "express";
import type { Kysely } from "kysely";
import type { Database } from "@project-lien/db";
import { findCountyRule, findStateRule, listStateRules, resolveJurisdictionRule } from "@project-lien/domain-jurisdiction";
import { asyncHandler } from "../async-handler.js";

export function createJurisdictionsRouter(db: Kysely<Database>): Router {
  const router = Router();

  router.get("/", asyncHandler(async (_req, res) => {
    const states = await listStateRules(db);
    res.status(200).json({ data: states });
  }));

  router.get("/:stateCode", asyncHandler(async (req, res) => {
    const stateCode = req.params.stateCode;
    if (!stateCode) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "stateCode path parameter is required" } });
      return;
    }
    const state = await findStateRule(db, stateCode);
    if (!state) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: `No jurisdiction rule for state '${stateCode}'` } });
      return;
    }

    const countyFips = typeof req.query.countyFips === "string" ? req.query.countyFips : undefined;
    const county = countyFips ? await findCountyRule(db, countyFips) : null;
    if (countyFips && !county) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: `No county rule for FIPS '${countyFips}'` } });
      return;
    }

    res.status(200).json({ data: resolveJurisdictionRule(state, county) });
  }));

  return router;
}
