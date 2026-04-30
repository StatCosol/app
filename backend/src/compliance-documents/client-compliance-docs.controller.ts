import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ComplianceDocumentsService } from './compliance-documents.service';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Compliance Documents')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/compliance-docs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientComplianceDocsController {
  constructor(private readonly svc: ComplianceDocumentsService) {}

  /** List compliance documents for the client's document library */
  @ApiOperation({ summary: 'List' })
  @Get()
  async list(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    return this.svc.listForClient(user.clientId!, user.id, {
      branchId: query.branchId,
      category: query.category,
      subCategory: query.subCategory,
      periodYear: query.periodYear ? +query.periodYear : undefined,
      periodMonth: query.periodMonth ? +query.periodMonth : undefined,
      search: query.search,
    });
  }

  /** Get document categories catalog */
  @ApiOperation({ summary: 'Get Categories' })
  @Get('categories')
  getCategories() {
    return this.svc.getCategories();
  }

  /** Get sub-categories for a given category */
  @ApiOperation({ summary: 'Get Sub Categories' })
  @Get('categories/:category/sub')
  getSubCategories(@Param('category') category: string) {
    return this.svc.getSubCategories(category);
  }

  /** Download a specific document */
  @ApiOperation({ summary: 'Download' })
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
  ) {
    const { absolutePath, fileName, mimeType } =
      await this.svc.getDocumentForDownload(
        id,
        user.id,
        'CLIENT',
        user.clientId!,
      );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.setHeader('Content-Type', mimeType);
    res.sendFile(absolutePath);
  }

  /** Get company settings (wage/salary register access) */
  @ApiOperation({ summary: 'Get Settings' })
  @Get('settings')
  async getSettings(@CurrentUser() user: ReqUser) {
    const settings = await this.svc.getCompanySettings(user.clientId!);
    return { clientId: user.clientId, ...settings };
  }

  /** Update company settings (master user only — enforced in service/frontend) */
  @ApiOperation({ summary: 'Update Settings' })
  @Post('settings')
  async updateSettings(
    @CurrentUser() user: ReqUser,
    @Body() dto: UpdateCompanySettingsDto,
  ) {
    return this.svc.updateCompanySettings(user.clientId!, user.id, dto);
  }
}
