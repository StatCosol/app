import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { ServiceEntitlementsService } from '../service-entitlements/service-entitlements.service';
import { FaceDeskAdminService } from './facedesk-admin.service';

@ApiTags('FaceDesk Platform Administration')
@ApiBearerAuth('JWT')
@Controller({ path: 'facedesk/platform-admin', version: '1' })
export class FaceDeskPlatformAdminController {
  constructor(
    private readonly admin: FaceDeskAdminService,
    private readonly entitlements: ServiceEntitlementsService,
  ) {}

  @Get('clients/:clientId/azure/backfill/status')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get Azure face backfill status for one client' })
  async getAzureBackfillStatus(
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ) {
    await this.requireFaceAttendance(clientId);
    return this.admin.getAzureFaceBackfillStatus(clientId);
  }

  @Post('clients/:clientId/azure/backfill')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Backfill Azure faces for one entitled client' })
  async backfillAzureFaces(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() body: { cursor?: string; limit?: number },
  ) {
    await this.requireFaceAttendance(clientId);
    return this.admin.backfillAzureFaceList(clientId, {
      cursor: body?.cursor,
      limit: body?.limit,
    });
  }

  private requireFaceAttendance(clientId: string): Promise<void> {
    return Promise.all([
      this.admin.assertAzureBackfillClient(clientId),
      this.entitlements.assertModule(clientId, 'CONTRACTOR_FACE_ATTENDANCE'),
    ]).then(() => undefined);
  }
}
