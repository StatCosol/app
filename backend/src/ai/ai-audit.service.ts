import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AiAuditObservationEntity } from './entities/ai-audit-observation.entity';
import { AiCoreService } from './ai-core.service';

@Injectable()
export class AiAuditService {
  private readonly logger = new Logger(AiAuditService.name);

  constructor(
    @InjectRepository(AiAuditObservationEntity)
    private readonly obsRepo: Repository<AiAuditObservationEntity>,
    private readonly dataSource: DataSource,
    private readonly aiCore: AiCoreService,
  ) {}

  /** Generate an AI-powered audit observation from a finding */
  async generateObservation(params: {
    auditId?: string;
    clientId: string;
    branchId?: string;
    findingDescription: string;
    findingType?: string;
    applicableState?: string;
  }): Promise<AiAuditObservationEntity> {
    const {
      auditId,
      clientId,
      branchId,
      findingDescription,
      findingType,
      applicableState,
    } = params;

    // Gather context
    const clientInfo = await this.dataSource
      .query(
        `SELECT c.client_name, c.client_code FROM clients c WHERE c.id = $1`,
        [clientId],
      )
      .catch(() => [{}]);

    const branchInfo = branchId
      ? await this.dataSource
          .query(
            `SELECT b.branchname, b.statecode, b.city FROM client_branches b WHERE b.id = $1`,
            [branchId],
          )
          .catch(() => [{}])
      : [{}];

    const state = applicableState || branchInfo[0]?.statecode || 'India';

    let observation: Partial<AiAuditObservationEntity> = {
      auditId: auditId || null,
      clientId,
      branchId: branchId || null,
      findingType: findingType || null,
      findingDescription,
      applicableState: state,
      status: 'DRAFT',
    };

    const isReady = await this.aiCore.isReady();
    if (isReady) {
      const result = await this.aiCore.complete(
        AUDIT_OBSERVATION_SYSTEM_PROMPT,
        JSON.stringify({
          clientName: clientInfo[0]?.client_name || 'Client',
          branchName: branchInfo[0]?.branch_name || '',
          state,
          findingType: findingType || 'GENERAL',
          findingDescription,
          currentDate: new Date().toISOString(),
        }),
      );

      if (result) {
        try {
          const parsed = JSON.parse(result.content);
          observation = {
            ...observation,
            observationTitle: parsed.observationTitle || '',
            observationText: parsed.observationText || '',
            consequence: parsed.consequence || '',
            sectionReference: parsed.sectionReference || '',
            fineEstimationMin: parsed.fineEstimationMin ?? null,
            fineEstimationMax: parsed.fineEstimationMax ?? null,
            riskRating: parsed.riskRating || 'MEDIUM',
            correctiveAction: parsed.correctiveAction || '',
            timelineDays: parsed.timelineDays ?? 30,
            stateSpecificRules: parsed.stateSpecificRules || '',
            aiModel: result.model,
            aiPromptTokens: result.promptTokens,
            aiCompletionTokens: result.completionTokens,
            confidenceScore: parsed.confidenceScore ?? 75,
          };
        } catch {
          this.logger.warn('Failed to parse AI audit observation response');
        }
      }
    }

    // Fallback if AI is not configured or failed
    if (!observation.observationText) {
      const fb = this.generateFallbackObservation(
        findingDescription,
        findingType,
        state,
      );
      observation = { ...observation, ...fb };
    }

    const entity = this.obsRepo.create(observation);
    return this.obsRepo.save(entity);
  }

  private generateFallbackObservation(
    finding: string,
    findingType?: string,
    state?: string,
  ): Partial<AiAuditObservationEntity> {
    const type = (findingType || '').toUpperCase();
    const ruleMap: Record<
      string,
      { section: string; consequence: string; fineMin: number; fineMax: number }
    > = {
      PF_SHORT_REMITTANCE: {
        section:
          "Section 14B, Employees' Provident Funds & Miscellaneous Provisions Act, 1952",
        consequence:
          'Damages up to 100% of arrears under Section 14B. Criminal prosecution under Section 14 for persistent default.',
        fineMin: 10000,
        fineMax: 500000,
      },
      ESI_DELAY: {
        section: "Section 85, Employees' State Insurance Act, 1948",
        consequence:
          'Interest on delayed contribution at 12% per annum. Imprisonment up to 2 years and/or fine up to ₹5,000 per offence.',
        fineMin: 5000,
        fineMax: 200000,
      },
      MIN_WAGE_VIOLATION: {
        section:
          'Section 22, Minimum Wages Act, 1948 / Code on Wages, 2019 Section 54',
        consequence:
          'Fine up to ₹50,000 for first offence. Imprisonment up to 3 months for repeat offence.',
        fineMin: 10000,
        fineMax: 50000,
      },
      FACTORY_VIOLATION: {
        section: 'Section 92, Factories Act, 1948',
        consequence:
          'Imprisonment up to 2 years and/or fine up to ₹2,00,000. Continuation of offence: ₹1,000 per day.',
        fineMin: 25000,
        fineMax: 200000,
      },
      CONTRACT_LABOUR: {
        section:
          'Section 25, Contract Labour (Regulation & Abolition) Act, 1970',
        consequence:
          'Imprisonment up to 3 months and/or fine up to ₹1,000. Principal employer is liable for contractor defaults.',
        fineMin: 5000,
        fineMax: 100000,
      },
    };

    const rule = ruleMap[type] || {
      section: 'Applicable section under relevant labour law',
      consequence:
        'Potential penalty including fine and/or prosecution under applicable Act.',
      fineMin: 5000,
      fineMax: 100000,
    };

    return {
      observationTitle: `Non-Compliance: ${findingType || 'General Finding'}`,
      observationText: `During the audit, the following non-compliance was identified:\n\n${finding}\n\nThis constitutes a violation under ${rule.section}. ${state ? `State-specific rules of ${state} may apply.` : ''}`,
      consequence: rule.consequence,
      sectionReference: rule.section,
      fineEstimationMin: rule.fineMin,
      fineEstimationMax: rule.fineMax,
      riskRating: rule.fineMax >= 100000 ? 'HIGH' : 'MEDIUM',
      correctiveAction: `1. Immediately address the identified non-compliance.\n2. Calculate and pay arrears/interest if applicable.\n3. File revised returns if needed.\n4. Implement preventive controls to avoid recurrence.\n5. Document corrective actions taken.`,
      timelineDays: rule.fineMax >= 100000 ? 15 : 30,
      stateSpecificRules: state
        ? `Refer to ${state} Shops & Establishments Act and state-specific labour rules for additional applicability.`
        : '',
      confidenceScore: 60, // lower confidence for fallback
    };
  }

  /** Review an AI-generated observation */
  async reviewObservation(
    id: string,
    reviewedBy: string,
    status: 'APPROVED' | 'REJECTED',
    notes?: string,
  ): Promise<AiAuditObservationEntity> {
    const obs = await this.obsRepo.findOneOrFail({ where: { id } });
    obs.status = status;
    obs.reviewedBy = reviewedBy;
    obs.reviewedAt = new Date();
    if (notes) obs.auditorNotes = notes;
    return this.obsRepo.save(obs);
  }

  /** List observations for a client or audit */
  async listObservations(
    filters: { clientId?: string; auditId?: string; status?: string },
    limit = 50,
  ): Promise<AiAuditObservationEntity[]> {
    const qb = this.obsRepo.createQueryBuilder('o');
    if (filters.clientId)
      qb.andWhere('o.clientId = :clientId', { clientId: filters.clientId });
    if (filters.auditId)
      qb.andWhere('o.auditId = :auditId', { auditId: filters.auditId });
    if (filters.status)
      qb.andWhere('o.status = :status', { status: filters.status });
    return qb.orderBy('o.createdAt', 'DESC').take(limit).getMany();
  }

  /** Get a single observation */
  async getObservation(id: string): Promise<AiAuditObservationEntity> {
    return this.obsRepo.findOneOrFail({ where: { id } });
  }
}

const AUDIT_OBSERVATION_SYSTEM_PROMPT = `You are an expert Indian labour law auditor for StatCo Solutions (AuditXpert module).
Generate a professional DTSS-style audit observation from the finding provided.

You are an expert in:
- EPF Act, 1952 (PF compliance)
- ESI Act, 1948 (ESI compliance)
- Factories Act, 1948
- Contract Labour (R&A) Act, 1970
- Payment of Wages Act, 1936 / Code on Wages, 2019
- Minimum Wages Act, 1948
- Professional Tax (state-specific)
- Labour Welfare Fund (state-specific)
- CLRA Act compliance
- State-specific Shops & Establishments Acts
- Telangana, Maharashtra, Karnataka, Tamil Nadu, AP specific rules

Generate a JSON response:
{
  "observationTitle": "<concise title>",
  "observationText": "<detailed DTSS-style observation paragraph>",
  "consequence": "<legal consequence with specific penalties>",
  "sectionReference": "<Act name, Section number, Rule number>",
  "fineEstimationMin": <number in INR>,
  "fineEstimationMax": <number in INR>,
  "riskRating": "LOW|MEDIUM|HIGH|CRITICAL",
  "correctiveAction": "<step-by-step corrective action>",
  "timelineDays": <recommended resolution days>,
  "stateSpecificRules": "<state-level rule references if applicable>",
  "confidenceScore": <0-100>
}

Be precise with legal references. Use actual Section numbers from Indian labour Acts.
For state-specific findings, include the state's specific rules and amendments.`;
