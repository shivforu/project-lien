import type {
  DocType,
  ERecordingNetwork,
  NotaryType,
  PriaLevel,
  RuleStatus,
  TheoryType,
} from "@project-lien/db";

/** Plain-data view of a `state_jurisdiction_rules` row (DB row -> this shape at the repo boundary). */
export interface StateRule {
  stateCode: string;
  stateName: string;
  theoryType: TheoryType;
  defaultDocType: DocType;
  statutoryDeadlineDays: number;
  dailyPenaltyCents: number;
  trusteeRequired: boolean;
  witnessesRequired: number;
  topMarginInches: number;
  bottomMarginInches: number;
  sideMarginInches: number;
  notaryType: NotaryType;
  status: RuleStatus;
}

/** Plain-data view of a `county_jurisdiction_rules` row. */
export interface CountyRule {
  countyFips: string;
  stateCode: string;
  countyName: string;
  baseRecordingFeeCents: number;
  perPageFeeCents: number;
  coverPageRequired: boolean;
  coverPageFeeCents: number;
  acceptedPriaLevel: PriaLevel;
  customTopMarginInches: number | null;
  eRecordingNetwork: ERecordingNetwork;
  status: RuleStatus;
}

/**
 * The merged rule a package actually operates against: state rule with any county-level
 * overrides applied (currently: top margin only, per docs/REQUIREMENTS_MATRIX.md #2 —
 * county rows may extend this over time without changing this shape's meaning).
 */
export interface ResolvedJurisdictionRule {
  stateCode: string;
  countyFips: string;
  theoryType: TheoryType;
  docType: DocType;
  statutoryDeadlineDays: number;
  dailyPenaltyCents: number;
  trusteeRequired: boolean;
  witnessesRequired: number;
  topMarginInches: number;
  bottomMarginInches: number;
  sideMarginInches: number;
  notaryType: NotaryType;
  eRecordingNetwork: ERecordingNetwork;
  acceptedPriaLevel: PriaLevel;
  coverPageRequired: boolean;
  coverPageFeeCents: number;
  baseRecordingFeeCents: number;
  perPageFeeCents: number;
  /** Surfaced so callers (UI, exception center) can flag UNVERIFIED-sourced data to users. */
  provenance: {
    stateStatus: RuleStatus;
    countyStatus: RuleStatus | null;
  };
}
