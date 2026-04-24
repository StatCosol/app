/* ── Applicability-engine enums ── */

export enum UnitType {
  COMPANY = 'COMPANY',
  BRANCH = 'BRANCH',
  SITE = 'SITE',
}

export enum EstablishmentType {
  FACTORY = 'FACTORY',
  ESTABLISHMENT = 'ESTABLISHMENT',
  BOCW_SITE = 'BOCW_SITE',
}

export enum PlantType {
  HAZARDOUS = 'HAZARDOUS',
  NON_HAZARDOUS = 'NON_HAZARDOUS',
  NA = 'NA',
}

export enum Periodicity {
  MONTHLY = 'MONTHLY',
  BI_MONTHLY = 'BI_MONTHLY',
  QUARTERLY = 'QUARTERLY',
  HALF_YEARLY = 'HALF_YEARLY',
  ANNUAL = 'ANNUAL',
  EVENT = 'EVENT',
  AS_REQUIRED = 'AS_REQUIRED',
}

export enum ComplianceSource {
  AUTO_RULE = 'AUTO_RULE',
  ACT_TOGGLE = 'ACT_TOGGLE',
  PACKAGE = 'PACKAGE',
  MANUAL_OVERRIDE = 'MANUAL_OVERRIDE',
}

export enum RuleApplyMode {
  ATTACH_PACKAGE = 'ATTACH_PACKAGE',
  ATTACH_COMPLIANCE = 'ATTACH_COMPLIANCE',
}

export enum TaskStatus {
  OPEN = 'OPEN',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  RETURNED = 'RETURNED',
  CLOSED = 'CLOSED',
}
