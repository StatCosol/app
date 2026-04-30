export enum BranchType {
  HO = 'HO',
  ZONAL = 'ZONAL',
  SALES = 'SALES',
  ESTABLISHMENT = 'ESTABLISHMENT',
  FACTORY = 'FACTORY',
  OFFICE = 'OFFICE',
  SHOP = 'SHOP',
  COMMERCIAL_ESTABLISHMENT = 'COMMERCIAL_ESTABLISHMENT',
  WAREHOUSE = 'WAREHOUSE',
  DEPOT = 'DEPOT',
  OTHER = 'OTHER',
}

export enum Frequency {
  MONTHLY = 'MONTHLY',
  BI_MONTHLY = 'BI_MONTHLY',
  QUARTERLY = 'QUARTERLY',
  HALF_YEARLY = 'HALF_YEARLY',
  YEARLY = 'YEARLY',
  EVENT = 'EVENT',
}

export enum OwnerRole {
  CRM = 'CRM',
  AUDITOR = 'AUDITOR',
}

export enum ChecklistStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  OVERDUE = 'OVERDUE',
}

export enum AuditType {
  CONTRACTOR = 'CONTRACTOR',
  FACTORY = 'FACTORY',
  SHOPS_ESTABLISHMENT = 'SHOPS_ESTABLISHMENT',
  LABOUR_EMPLOYMENT = 'LABOUR_EMPLOYMENT',
  FSSAI = 'FSSAI',
  HR = 'HR',
  PAYROLL = 'PAYROLL',
  GAP = 'GAP',
}

export enum ComplianceDocStatus {
  NOT_UPLOADED = 'NOT_UPLOADED',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REUPLOAD_REQUIRED = 'REUPLOAD_REQUIRED',
  RESUBMITTED = 'RESUBMITTED',
  OVERDUE = 'OVERDUE',
}

export enum ModuleSource {
  BRANCHDESK = 'BRANCHDESK',
  CRM = 'CRM',
  CONTRACTOR = 'CONTRACTOR',
  AUDITXPERT = 'AUDITXPERT',
}

export enum DocumentScope {
  BRANCH = 'BRANCH',
  CONTRACTOR = 'CONTRACTOR',
  COMPANY = 'COMPANY',
}

export enum LawArea {
  PF = 'PF',
  ESI = 'ESI',
  FACTORY = 'FACTORY',
  CLRA = 'CLRA',
  PT = 'PT',
  LWF = 'LWF',
  BONUS = 'BONUS',
  GRATUITY = 'GRATUITY',
  LABOUR = 'LABOUR',
  OTHER = 'OTHER',
}
