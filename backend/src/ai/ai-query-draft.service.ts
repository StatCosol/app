import { Injectable, Logger } from '@nestjs/common';
import { AiCoreService } from './ai-core.service';
import { AiRequestLogService } from './ai-request-log.service';

/** Routing target with role and department */
interface RouteTarget {
  department: string;
  role: string;
  reason: string;
}

/** Full output of query-draft */
export interface QueryDraftResult {
  aiRequestId: string;
  route: RouteTarget;
  draftReply: string;
  keyQuestions: string[];
  confidence: number;
}

const KEYWORD_MAP: Record<string, RouteTarget> = {
  COMPLIANCE: {
    department: 'Compliance',
    role: 'CCO',
    reason: 'Query contains compliance-related keywords',
  },
  AUDIT: {
    department: 'Audit',
    role: 'AUDITOR',
    reason: 'Query contains audit-related keywords',
  },
  PAYROLL: {
    department: 'Payroll',
    role: 'PAYROLL',
    reason: 'Query contains payroll-related keywords',
  },
  HR: {
    department: 'HR / Branch',
    role: 'BRANCH',
    reason: 'Query contains HR or employee-related keywords',
  },
  TECHNICAL: {
    department: 'IT / Admin',
    role: 'ADMIN',
    reason: 'Query contains technical or system keywords',
  },
};

const KEYWORD_PATTERNS: Record<string, RegExp> = {
  COMPLIANCE:
    /\b(compliance|mcd|pf\b|esi\b|epfo|labour|license|registration|return|filing|statutory|act\b|rule|regulation|penalty)\b/i,
  AUDIT:
    /\b(audit|observation|nc\b|non.?compliance|check|finding|corrective|capa|recommendation)\b/i,
  PAYROLL:
    /\b(payroll|salary|wage|ctc|deduction|bonus|gratuity|leave\s*encashment|pay\s*slip|disbursement)\b/i,
  HR: /\b(employee|contractor|onboard|offboard|transfer|branch|manpower|headcount|probation|notice\s*period|posh)\b/i,
  TECHNICAL:
    /\b(server|api|error|bug|login|password|system|deploy|database|access|permission|role)\b/i,
};

const QUERY_DRAFT_SYSTEM_PROMPT = `You are a senior compliance operations assistant at StatCo, a labour-law compliance SaaS company.
Given a user query, provide:
1. A concise, professional draft reply (max 200 words) that addresses the user's concern.
2. Up to 3 clarifying questions to ask the user before finalising the reply.
3. A confidence value between 0 and 1 indicating how certain you are about the routing and reply.

Reply in JSON: { "draftReply": "...", "keyQuestions": ["..."], "confidence": 0.85 }

Context about StatCo modules:
- Compliance: MCD items, PF/ESI registration tracking, statutory returns, compliance tasks
- Audit: Periodic audits of client branches, observations (NC/Recommendation), CAPA tracking
- Payroll: Salary processing, statutory deductions (PF/ESI/PT), payslips, CTC management
- HR/Branch: Employee lifecycle, contractor management, branch operations
- Technical: System administration, user access, integrations`;

@Injectable()
export class AiQueryDraftService {
  private readonly logger = new Logger(AiQueryDraftService.name);

  constructor(
    private readonly aiCore: AiCoreService,
    private readonly requestLog: AiRequestLogService,
  ) {}

  /** Route a free-text query and generate a draft reply */
  async draft(params: {
    message: string;
    queryTypeHint?: string;
    subject?: string;
    tenantId?: string;
    createdBy?: string;
  }): Promise<QueryDraftResult> {
    // 1. Log request
    const request = await this.requestLog.createRequest({
      module: 'QUERY',
      payload: {
        message: params.message,
        queryTypeHint: params.queryTypeHint,
        subject: params.subject,
      },
      createdBy: params.createdBy,
      tenantId: params.tenantId,
    });

    try {
      // 2. Rule-based routing
      const route = this.detectRoute(params.message, params.queryTypeHint);

      // 3. Generate draft reply via AI
      const userPrompt = `Subject: ${params.subject || 'General Query'}
Query: ${params.message}
Detected Department: ${route.department}
Detected Role: ${route.role}

Generate a professional draft reply, key clarifying questions, and confidence.`;

      let draftReply: string;
      let keyQuestions: string[] = [];
      let confidence = 0.7;

      try {
        const aiResult = await this.aiCore.complete(
          QUERY_DRAFT_SYSTEM_PROMPT,
          userPrompt,
        );
        if (aiResult) {
          const parsed = JSON.parse(aiResult.content);
          draftReply =
            parsed.draftReply || this.fallbackReply(route, params.message);
          keyQuestions = parsed.keyQuestions || [];
          confidence = parsed.confidence ?? 0.7;
        } else {
          draftReply = this.fallbackReply(route, params.message);
          keyQuestions = this.fallbackQuestions(route);
          confidence = 0.5;
        }
      } catch (aiErr) {
        this.logger.warn(`AI call failed, using rule-based fallback: ${aiErr}`);
        draftReply = this.fallbackReply(route, params.message);
        keyQuestions = this.fallbackQuestions(route);
        confidence = 0.5;
      }

      const result: QueryDraftResult = {
        aiRequestId: request.id,
        route,
        draftReply,
        keyQuestions,
        confidence,
      };

      // 4. Log response
      await this.requestLog.completeRequest(request.id, result, {
        confidence,
        model: 'gpt-4o-mini',
      });

      return result;
    } catch (err: unknown) {
      await this.requestLog.failRequest(request.id, (err as Error).message);
      throw err;
    }
  }

  /** Detect which department/role should handle this query */
  private detectRoute(message: string, hint?: string): RouteTarget {
    // If user provided a hint, use it directly
    if (hint && KEYWORD_MAP[hint.toUpperCase()]) {
      return KEYWORD_MAP[hint.toUpperCase()];
    }

    // Score each category by keyword matches
    let bestCat = 'COMPLIANCE';
    let bestScore = 0;

    for (const [cat, pattern] of Object.entries(KEYWORD_PATTERNS)) {
      const matches = message.match(new RegExp(pattern, 'gi'));
      const score = matches ? matches.length : 0;
      if (score > bestScore) {
        bestScore = score;
        bestCat = cat;
      }
    }

    return KEYWORD_MAP[bestCat];
  }

  /** Fallback reply when AI is unavailable */
  private fallbackReply(route: RouteTarget, _message: string): string {
    return (
      `Thank you for your query. This has been routed to the ${route.department} team (${route.role}). ` +
      `A team member will review your query and respond within 24 hours. ` +
      `For urgent matters, please contact your account manager directly.`
    );
  }

  /** Fallback questions when AI is unavailable */
  private fallbackQuestions(route: RouteTarget): string[] {
    const common: Record<string, string[]> = {
      COMPLIANCE: [
        'Which state/location does this concern?',
        'What is the specific compliance item or act?',
        'What is the deadline or due date?',
      ],
      AUDIT: [
        'What is the audit period and branch?',
        'Is this related to an existing observation?',
        'What is the severity level?',
      ],
      PAYROLL: [
        'Which payroll period does this concern?',
        'Which employee(s) are affected?',
        'Is this about processing or reporting?',
      ],
      HR: [
        'Which branch or contractor is involved?',
        'What is the employee ID or name?',
        'Is this urgent?',
      ],
      TECHNICAL: [
        'Can you provide a screenshot or error message?',
        'Which module or page is affected?',
        'When did this issue start?',
      ],
    };
    const cat =
      Object.entries(KEYWORD_MAP).find(([, v]) => v === route)?.[0] ||
      'COMPLIANCE';
    return common[cat] || common['COMPLIANCE'];
  }
}
