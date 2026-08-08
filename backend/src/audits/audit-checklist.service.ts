import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { AuditEntity } from './entities/audit.entity';
import { AuditChecklistItemEntity } from './entities/audit-checklist-item.entity';

@Injectable()
export class AuditChecklistService {
  constructor(
    @InjectRepository(AuditEntity)
    private readonly repo: Repository<AuditEntity>,
    @InjectRepository(AuditChecklistItemEntity)
    private readonly checklistRepo: Repository<AuditChecklistItemEntity>,
    private readonly dataSource: DataSource,
  ) {}

  private assertAuditor(user: ReqUser) {
    if (!user || user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Auditor access only');
    }
  }

  async generateChecklistFromCompliance(user: ReqUser, auditId: string) {
    this.assertAuditor(user);
    const audit = await this.repo.findOne({ where: { id: auditId } });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId) {
      throw new ForbiddenException('Not your audit');
    }

    // Auto-generate checklist items based on audit type
    // Each entry: [label, docType?] — docType enables exact matching in autoLinkChecklistItem
    const typeChecklistMap: Record<string, Array<[string, string?]>> = {
      FACTORY: [
        ['Factory License', 'FACTORY_LICENSE'],
        ['Building Stability Certificate', 'BUILDING_STABILITY_CERT'],
        ['Fire Safety Certificate', 'FIRE_SAFETY_CERT'],
        ['Pollution Control Board Consent', 'PCB_CONSENT'],
        ['Hazardous Waste Authorization', 'HAZARDOUS_WASTE_AUTH'],
        ['Boiler Certificate', 'BOILER_CERTIFICATE'],
        ['Factory Plan Approval', 'FACTORY_PLAN_APPROVAL'],
        ['Annual Return (Form 21)', 'ANNUAL_RETURN_F21'],
        ['Half-Yearly Return (Form 22)', 'HALF_YEARLY_RETURN_F22'],
        ['Register of Workers', 'WORKERS_REGISTER'],
        ['Leave Register', 'LEAVE_REGISTER'],
        ['Overtime Register', 'OT_REGISTER'],
        ['Health & Safety Policy', 'HEALTH_SAFETY_POLICY'],
        ['First Aid Box', 'FIRST_AID_BOX'],
        ['Canteen License', 'CANTEEN_LICENSE'],
        ['Creche Facility (if applicable)', 'CRECHE_FACILITY'],
      ],
      SHOPS_ESTABLISHMENT: [
        ['Shops & Establishment Registration', 'SHOPS_EST_REGISTRATION'],
        ['Trade License', 'TRADE_LICENSE'],
        ['Professional Tax Registration', 'PT_REGISTRATION'],
        ['Employment Exchange Returns', 'EMPLOYMENT_EXCHANGE_RETURNS'],
        ['Register of Employees', 'EMPLOYMENT_REGISTER_F13'],
        ['Attendance Register', 'MUSTER_ROLL_REGISTER'],
        ['Wage Register', 'WAGE_REGISTER'],
        ['Leave Register', 'LEAVE_REGISTER'],
        ['Annual Return', 'ANNUAL_RETURN'],
      ],
      CONTRACTOR: [
        ['CLRA License', 'CLRA_LICENSE'],
        ['PF Registration', 'PF_REGISTRATION'],
        ['ESI Registration', 'ESI_REGISTRATION'],
        ['PF Monthly Challan', 'PF_CHALLAN'],
        ['ESI Monthly Challan', 'ESI_CHALLAN'],
        ['Professional Tax Challan', 'PT_CHALLAN'],
        ['Wage Register', 'WAGE_REGISTER'],
        ['Muster Roll / Attendance Register', 'MUSTER_ROLL_REGISTER'],
        ['Register of Fines', 'REGISTER_OF_FINES'],
        ['Register of Deductions', 'REGISTER_OF_DEDUCTIONS'],
        ['Service Certificates', 'SERVICE_CERTIFICATE'],
        ['Employment Cards', 'EMPLOYMENT_CARDS'],
        ['Wage Slips', 'WAGE_SLIPS'],
        ['Register of Employment (Form-13)', 'EMPLOYMENT_REGISTER_F13'],
        ['Bonus Register (Form C)', 'BONUS_FORM_C'],
        ['CLRA Annual Return', 'HALF_YEARLY_RETURNS_F14'],
      ],
      LABOUR_EMPLOYMENT: [
        ['Labour License', 'LABOUR_LICENSE'],
        ['Standing Orders', 'STANDING_ORDERS'],
        [
          'Employment Exchange Quarterly Returns',
          'EMPLOYMENT_EXCHANGE_RETURNS',
        ],
        ['Minimum Wages Register', 'MINIMUM_WAGES_RETURNS'],
        ['Equal Remuneration Register', 'EQUAL_REMUNERATION_REGISTER'],
        ['Maternity Benefit Records', 'MATERNITY_BENEFIT_RECORDS'],
        ['Gratuity Records', 'GRATUITY_RECORDS'],
        ['Industrial Disputes Records', 'INDUSTRIAL_DISPUTES_RECORDS'],
      ],
      FSSAI: [
        ['FSSAI License', 'FSSAI_LICENSE'],
        ['Food Handler Medical Certificate', 'FOOD_HANDLER_CERT'],
        ['Water Testing Report', 'WATER_TESTING_REPORT'],
        ['Pest Control Records', 'PEST_CONTROL_RECORDS'],
        ['Temperature Log (Cold Storage)', 'TEMPERATURE_LOG'],
        ['Hygiene & Sanitation Records', 'HYGIENE_SANITATION_RECORDS'],
        ['Raw Material Inspection Records', 'RAW_MATERIAL_INSPECTION'],
        ['FSSAI Annual Return', 'FSSAI_ANNUAL_RETURN'],
      ],
      PAYROLL: [
        ['PF Challan', 'PF_CHALLAN'],
        ['ESI Challan', 'ESI_CHALLAN'],
        ['Professional Tax Challan', 'PT_CHALLAN'],
        ['TDS Challan', 'TDS_CHALLAN'],
        ['Payroll Register', 'PAYROLL_REGISTER'],
        ['Salary Slips', 'WAGE_SLIPS'],
        ['Bank Statement (Salary A/c)', 'BANK_STATEMENT_SALARY'],
        ['Bonus Computation Sheet', 'BONUS_FORM_C'],
        ['Leave Encashment Records', 'LEAVE_ENCASHMENT_RECORDS'],
        ['Full & Final Settlement Records', 'FULL_FINAL_SETTLEMENT'],
      ],
      HR: [
        ['Appointment Letters', 'APPOINTMENT_LETTERS'],
        ['ID Cards Issued', 'ID_CARDS'],
        ['Employee Handbook Acknowledgement', 'EMPLOYEE_HANDBOOK'],
        ['Background Verification Records', 'BACKGROUND_VERIFICATION'],
        ['Training Records', 'TRAINING_RECORDS'],
        ['Performance Appraisal Records', 'APPRAISAL_RECORDS'],
        ['Employee Grievance Register', 'GRIEVANCE_REGISTER'],
        ['Sexual Harassment Committee (ICC) Records', 'ICC_RECORDS'],
        ['Exit Interview Records', 'EXIT_INTERVIEW_RECORDS'],
        ['Succession Planning Documents', 'SUCCESSION_PLANNING'],
      ],
      GAP: [
        ['Process Documentation', 'PROCESS_DOCUMENTATION'],
        ['SOP Compliance Check', 'SOP_COMPLIANCE'],
        ['Internal Audit Reports', 'INTERNAL_AUDIT_REPORT'],
        ['Gap Analysis Report', 'GAP_ANALYSIS_REPORT'],
        ['Corrective Action Plan', 'CORRECTIVE_ACTION_PLAN'],
        ['Risk Assessment Records', 'RISK_ASSESSMENT'],
        ['Management Review Minutes', 'MANAGEMENT_REVIEW'],
      ],
    };

    // For CONTRACTOR audits with a linked contractor, derive checklist from their
    // actual required document types so docType codes match uploaded documents
    // and auto-linking fires correctly.
    let entries: Array<[string, string?]> =
      typeChecklistMap[audit.auditType] || [];

    if (
      (audit.auditType as string) === 'CONTRACTOR' &&
      audit.contractorUserId
    ) {
      const CONTRACTOR_DOC_LABELS: Record<string, string> = {
        WAGE_REGISTER: 'Wage Register',
        MUSTER_ROLL: 'Muster Roll',
        OT_REGISTER: 'Overtime (OT) Register',
        PF_CHALLAN: 'PF Challan',
        ESI_CHALLAN: 'ESI Challan',
        PT_CHALLAN: 'Professional Tax (PT) Challan',
        CLRA_LICENSE: 'CLRA License',
        PF_REGISTRATION: 'PF Registration',
        ESI_REGISTRATION: 'ESI Registration',
        WORK_ORDER: 'Work Order / Contract Agreement',
        REGISTER_OF_FINES: 'Register of Fines',
        REGISTER_OF_DEDUCTIONS: 'Register of Deductions',
        REGISTER_OF_ADVANCES: 'Register of Advances',
        EMPLOYMENT_REGISTER_F13: 'Register of Employment (Form-13)',
        HALF_YEARLY_RETURNS_F14: 'Half Yearly Returns (Form XIV)',
        SERVICE_CERTIFICATE: 'Service Certificates',
        EMPLOYMENT_CARDS: 'Employment Cards',
        WAGE_SLIPS: 'Wage Slips',
        BONUS_FORM_C: 'Bonus Register (Form C)',
        MUSTER_ROLL_REGISTER: 'Muster Roll Register',
      };
      const toLabel = (dt: string) =>
        CONTRACTOR_DOC_LABELS[dt] ??
        dt.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      // Standard monthly types always required
      const standardTypes = [
        'WAGE_REGISTER',
        'MUSTER_ROLL',
        'OT_REGISTER',
        'PF_CHALLAN',
        'ESI_CHALLAN',
        'PT_CHALLAN',
      ];

      // CRM-configured extras for this contractor
      const dbRows = await this.dataSource.query(
        `SELECT DISTINCT doc_type FROM contractor_required_documents
         WHERE contractor_user_id = $1 AND client_id = $2 AND is_required = true`,
        [audit.contractorUserId, audit.clientId],
      );
      const extraTypes: string[] = (dbRows as { doc_type: string }[]).map(
        (r) => r.doc_type,
      );

      const allTypes = [...standardTypes];
      for (const dt of extraTypes) {
        if (!allTypes.includes(dt)) allTypes.push(dt);
      }

      entries = allTypes.map((dt) => [toLabel(dt), dt] as [string, string]);
    }

    if (entries.length === 0) {
      throw new BadRequestException(
        `No default checklist defined for audit type: ${audit.auditType}`,
      );
    }

    // Check if checklist already has items
    const existing = await this.checklistRepo.count({ where: { auditId } });
    if (existing > 0) {
      throw new BadRequestException(
        'Checklist already has items. Delete existing items first or add manually.',
      );
    }

    const items = entries.map(([label, docType], idx) =>
      this.checklistRepo.create({
        auditId,
        itemLabel: label,
        docType: docType ?? null,
        isRequired: true,
        sortOrder: idx + 1,
        status: 'PENDING',
      }),
    );
    await this.checklistRepo.save(items);
    return { created: items.length, items };
  }
}
