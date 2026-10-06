import {
  Body,
  Get,
  Param,
  Query,
  Res,
  ParseUUIDPipe,
  Controller,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { LegitxAssistantService } from './legitx-assistant.service';
import { LegitxAssistantDocumentsService } from './legitx-assistant-documents.service';
import {
  AssistantDocumentDto,
  AssistantDocumentViewDto,
} from './dto/assistant-document.dto';
import { Response } from 'express';
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'BRANCH_DESK')
@Controller({ path: 'legitx/assistant', version: '1' })
export class LegitxAssistantController {
  constructor(
    private readonly assistant: LegitxAssistantService,
    private readonly documents: LegitxAssistantDocumentsService,
  ) {}
  @Post('documents/find')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  findDocuments(
    @CurrentUser() user: ReqUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    query: AssistantDocumentDto,
  ) {
    return this.documents.find(user, query);
  }

  @Get('documents/:kind/:id/view')
  async viewDocument(
    @CurrentUser() user: ReqUser,
    @Param('kind') kind: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: AssistantDocumentViewDto,
    @Res() res: Response,
  ) {
    const file = await this.documents.view(user, kind, id, query);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const safeTypes = new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/zip',
    ]);
    res.setHeader(
      'Content-Type',
      safeTypes.has(file.fileType) ? file.fileType : 'application/octet-stream',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );
    res.send(file.buffer);
  }
  @Post('plan')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  plan(
    @CurrentUser() user: ReqUser,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    query: DashboardQueryDto,
  ) {
    return this.assistant.plan(user, query);
  }
}
