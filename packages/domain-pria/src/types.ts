import type { DocType, PriaLevel } from "@project-lien/db";

/**
 * Canonical PRIA-shaped package model. This is this project's OWN interpretation of the
 * PRIA (Property Records Industry Association) eRecording data model, built from public
 * descriptions and the transcript's Module 3 discussion (Requirements.pdf pp.53-56,
 * 96-98) — NOT the actual licensed PRIA XML schema, which is not publicly available (see
 * docs/EXTERNAL_DEPENDENCIES.md). Field names below are deliberately close to, but not
 * guaranteed identical to, the real PRIA standard.
 */
export interface PriaParty {
  role: "GRANTOR" | "GRANTEE" | "TRUSTEE" | "WITNESS" | "NOTARY" | "SUBMITTER";
  isOrganization: boolean;
  name: string;
}

export interface PriaPackage {
  packageIdentifier: string;
  priaLevel: PriaLevel;
  documentType: DocType;
  submitter: {
    name: string;
    contactEmail: string;
    returnAddressLine1: string;
    returnCity: string;
    returnStateCode: string;
    returnZip: string;
  };
  jurisdiction: {
    stateCode: string;
    countyFips: string;
    countyName: string;
  };
  property: {
    parcelNumber: string;
    addressLine1: string;
    city: string;
    zip: string;
    legalDescription: string;
  };
  reference: {
    originalInstrumentNumber: string | null;
    originalBook: string | null;
    originalPage: string | null;
  };
  parties: PriaParty[];
  pageCount: number;
}
