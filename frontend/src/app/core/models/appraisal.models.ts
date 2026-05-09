export interface AppraisalCycle {
  id: string;
  clientId: string;
  cycleCode: string;
  cycleName: string;
  financialYear: string;
  appraisalType: string;
  reviewPeriodFrom: string;
  reviewPeriodTo: string;
  effectiveDate?: string;
  templateId?: string;
  status: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  eligibleCount?: number;
  completedCount?: number;
  pendingCount?: number;
  scopes?: AppraisalCycleScope[];
}

export interface AppraisalCycleScope {
  id: string;
  cycleId: string;
  branchId?: string;
  departmentId?: string;
  designationId?: string;
  employmentType?: string;
  isActive: boolean;
}

export interface AppraisalTemplate {
  id: string;
  clientId?: string;
  templateCode: string;
  templateName: string;
  description?: string;
  ratingScaleId?: string;
  isDefault: boolean;
  isActive: boolean;
  sections?: AppraisalTemplateSection[];
}

export interface AppraisalTemplateSection {
  id: string;
  templateId: string;
  sectionCode: string;
  sectionName: string;
  sectionType: string;
  sequence: number;
  weightage: number;
  isRequired: boolean;
  items?: AppraisalTemplateItem[];
}

export interface AppraisalTemplateItem {
  id: string;
  templateId: string;
  sectionId: string;
  itemCode: string;
  itemName: string;
  description?: string;
  weightage: number;
  maxScore: number;
  sequence: number;
  inputType: string;
}

export interface EmployeeAppraisal {
  id: string;
  clientId: string;
  branchId?: string;
  employeeId: string;
  cycleId: string;
  templateId?: string;
  managerId?: string;
  status: string;
  selfStatus?: string;
  managerStatus?: string;
  branchStatus?: string;
  clientStatus?: string;
  attendanceScore?: number;
  kpiScore?: number;
  competencyScore?: number;
  totalScore?: number;
  finalRatingCode?: string;
  finalRatingLabel?: string;
  recommendation?: string;
  recommendedIncrementPercent?: number;
  recommendedIncrementAmount?: number;
  recommendedNewCtc?: number;
  promotionDesignationId?: string;
  pipRequired: boolean;
  finalRemarks?: string;
  lockedAt?: string;
  createdAt: string;
  updatedAt: string;

  // Joined fields
  employee_code?: string;
  employee_name?: string;
  department?: string;
  designation?: string;
  date_of_joining?: string;
  ctc?: number;
  monthly_gross?: number;
  branch_name?: string;
  cycle_name?: string;
  financial_year?: string;
  review_period_from?: string;
  review_period_to?: string;

  items?: EmployeeAppraisalItem[];
  approvals?: AppraisalApproval[];
}

export interface EmployeeAppraisalItem {
  id: string;
  employeeAppraisalId: string;
  sectionId?: string;
  templateItemId?: string;
  itemName: string;
  weightage: number;
  targetValue?: string;
  achievementValue?: string;
  selfRating?: number;
  managerRating?: number;
  branchRating?: number;
  finalRating?: number;
  weightedScore?: number;
  employeeRemarks?: string;
  managerRemarks?: string;
  branchRemarks?: string;
  finalRemarks?: string;
  sequence: number;
}

export interface AppraisalApproval {
  id: string;
  employeeAppraisalId: string;
  approvalLevel: string;
  approverId: string;
  action: string;
  remarks?: string;
  actionAt: string;
}

export interface AppraisalDashboard {
  summary: {
    total: number;
    initiated: number;
    manager_reviewed: number;
    branch_reviewed: number;
    client_approved: number;
    sent_back: number;
    closed: number;
    pending: number;
    avg_score: number;
    increment_recommended: number;
    promotion_recommended: number;
    pip_recommended: number;
    pip_count: number;
  };
  topPerformers: { total_score: number; final_rating_label: string; name: string; employee_code: string; branch_name: string }[];
  lowPerformers: { total_score: number; final_rating_label: string; name: string; employee_code: string; branch_name: string }[];
  branchSummary: { branch_name: string; total: number; avg_score: number; completed: number }[];
}

export interface RatingScale {
  id: string;
  clientId?: string;
  scaleName: string;
  isActive: boolean;
  items?: RatingScaleItem[];
}

export interface RatingScaleItem {
  id: string;
  scaleId: string;
  ratingCode: string;
  ratingLabel: string;
  minScore: number;
  maxScore: number;
  colorCode?: string;
  sequence: number;
}

export interface AppraisalPaginatedResult {
  data: EmployeeAppraisal[];
  total: number;
  page: number;
  pageSize: number;
}
