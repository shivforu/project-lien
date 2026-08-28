import type { Kysely } from "kysely";
import type { Database } from "@project-lien/db";
import type { CountyRule, StateRule } from "./types.js";

/** Maps a DB row (snake_case, numeric strings for NUMERIC columns) to the domain shape. */
function toStateRule(row: {
  state_code: string;
  state_name: string;
  theory_type: StateRule["theoryType"];
  default_doc_type: StateRule["defaultDocType"];
  statutory_deadline_days: number;
  daily_penalty_cents: number;
  trustee_required: boolean;
  witnesses_required: number;
  top_margin_inches: string;
  bottom_margin_inches: string;
  side_margin_inches: string;
  notary_type: StateRule["notaryType"];
  status: StateRule["status"];
}): StateRule {
  return {
    stateCode: row.state_code,
    stateName: row.state_name,
    theoryType: row.theory_type,
    defaultDocType: row.default_doc_type,
    statutoryDeadlineDays: row.statutory_deadline_days,
    dailyPenaltyCents: row.daily_penalty_cents,
    trusteeRequired: row.trustee_required,
    witnessesRequired: row.witnesses_required,
    topMarginInches: Number(row.top_margin_inches),
    bottomMarginInches: Number(row.bottom_margin_inches),
    sideMarginInches: Number(row.side_margin_inches),
    notaryType: row.notary_type,
    status: row.status,
  };
}

function toCountyRule(row: {
  county_fips: string;
  state_code: string;
  county_name: string;
  base_recording_fee_cents: number;
  per_page_fee_cents: number;
  cover_page_required: boolean;
  cover_page_fee_cents: number;
  accepted_pria_level: CountyRule["acceptedPriaLevel"];
  custom_top_margin_inches: string | null;
  e_recording_network: CountyRule["eRecordingNetwork"];
  status: CountyRule["status"];
}): CountyRule {
  return {
    countyFips: row.county_fips,
    stateCode: row.state_code,
    countyName: row.county_name,
    baseRecordingFeeCents: row.base_recording_fee_cents,
    perPageFeeCents: row.per_page_fee_cents,
    coverPageRequired: row.cover_page_required,
    coverPageFeeCents: row.cover_page_fee_cents,
    acceptedPriaLevel: row.accepted_pria_level,
    customTopMarginInches: row.custom_top_margin_inches === null ? null : Number(row.custom_top_margin_inches),
    eRecordingNetwork: row.e_recording_network,
    status: row.status,
  };
}

export async function findStateRule(db: Kysely<Database>, stateCode: string): Promise<StateRule | null> {
  const row = await db
    .selectFrom("state_jurisdiction_rules")
    .selectAll()
    .where("state_code", "=", stateCode.toUpperCase())
    .executeTakeFirst();
  return row ? toStateRule(row) : null;
}

export async function findCountyRule(db: Kysely<Database>, countyFips: string): Promise<CountyRule | null> {
  const row = await db
    .selectFrom("county_jurisdiction_rules")
    .selectAll()
    .where("county_fips", "=", countyFips)
    .executeTakeFirst();
  return row ? toCountyRule(row) : null;
}

export async function listStateRules(db: Kysely<Database>): Promise<StateRule[]> {
  const rows = await db.selectFrom("state_jurisdiction_rules").selectAll().orderBy("state_code").execute();
  return rows.map(toStateRule);
}
