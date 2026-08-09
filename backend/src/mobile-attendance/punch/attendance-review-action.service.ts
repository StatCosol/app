import { BadRequestException, Injectable } from '@nestjs/common';
import { FaceDeskAdminService } from '../../facedesk/facedesk-admin.service';
import { PunchReviewService } from './punch-review.service';
import { FederatedReviewQueue } from './attendance-review-federation.service';

@Injectable()
export class AttendanceReviewActionService {
  constructor(
    private readonly punchReview: PunchReviewService,
    private readonly facedeskAdmin: FaceDeskAdminService,
  ) {}

  async actOnFederatedItem(
    clientId: string,
    queue: FederatedReviewQueue,
    itemId: string,
    actorUserId: string,
    dto: {
      action: 'APPROVE' | 'REJECT';
      note?: string;
      subjectType?: 'EMPLOYEE' | 'CONTRACTOR';
    },
    branchIds: string[] | null,
  ): Promise<{ ok: true; decision?: string; status?: string }> {
    if (dto.action !== 'APPROVE' && dto.action !== 'REJECT') {
      throw new BadRequestException('action must be APPROVE or REJECT');
    }

    if (queue === 'MOBILE_BORDERLINE') {
      const subjectType = dto.subjectType ?? 'EMPLOYEE';
      if (subjectType !== 'EMPLOYEE' && subjectType !== 'CONTRACTOR') {
        throw new BadRequestException('subjectType must be EMPLOYEE or CONTRACTOR');
      }
      const result = await this.punchReview.reviewPunch(
        clientId,
        subjectType,
        itemId,
        dto.action,
        actorUserId,
        dto.note,
        branchIds,
      );
      return { ok: true, decision: result.decision };
    }

    if (queue === 'FACEDESK_VERIFICATION') {
      const result = await this.facedeskAdmin.actOnReview(
        clientId,
        itemId,
        actorUserId,
        { action: dto.action, remarks: dto.note },
        branchIds,
      );
      return { ok: true, status: result.status };
    }

    throw new BadRequestException('queue must be MOBILE_BORDERLINE or FACEDESK_VERIFICATION');
  }
}
