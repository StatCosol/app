import { Controller, Get, Post, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';
import { AppraisalTemplatesService } from '../services/appraisal-templates.service';
import { CreateAppraisalTemplateDto } from '../dto/appraisal-template.dto';

@ApiTags('Appraisal Templates')
@ApiBearerAuth('JWT')
@Controller({ path: 'appraisal/templates', version: '1' })
export class AppraisalTemplatesController {
  constructor(private readonly templatesService: AppraisalTemplatesService) {}

  @Post()
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'Create appraisal template' })
  create(@Body() dto: CreateAppraisalTemplateDto, @CurrentUser() user: ReqUser) {
    return this.templatesService.createTemplate(user.clientId!, dto, user.id);
  }

  @Get()
  @Roles('CLIENT', 'ADMIN', 'BRANCH')
  @ApiOperation({ summary: 'List appraisal templates' })
  findAll(@CurrentUser() user: ReqUser) {
    return this.templatesService.findAllTemplates(user.clientId!);
  }

  @Get(':id')
  @Roles('CLIENT', 'ADMIN', 'BRANCH')
  @ApiOperation({ summary: 'Get appraisal template with sections and items' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.findOneTemplate(id);
  }

  // Rating Scales
  @Get('scales/list')
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'List rating scales' })
  listScales(@CurrentUser() user: ReqUser) {
    return this.templatesService.findAllScales(user.clientId!);
  }

  @Post('scales')
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'Create rating scale' })
  createScale(@Body() data: any, @CurrentUser() user: ReqUser) {
    return this.templatesService.createScale(user.clientId!, data);
  }

  @Get('scales/:id')
  @Roles('CLIENT', 'ADMIN')
  @ApiOperation({ summary: 'Get rating scale details' })
  getScale(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.findOneScale(id);
  }
}
