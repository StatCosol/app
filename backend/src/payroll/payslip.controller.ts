import {
  Controller,
  Post,
  Param,
  Req,
  Res,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { PayslipGeneratorService } from './services/payslip-generator.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'payroll/payslips', version: '1' })
@Roles('PAYROLL', 'ADMIN', 'CLIENT')
export class PayslipController {
  constructor(private readonly generator: PayslipGeneratorService) {}

  /** Generate payslip PDF for a single employee in a run */
  @ApiOperation({ summary: 'Generate For Employee' })
  @Post('runs/:runId/employees/:employeeId/generate')
  async generateForEmployee(
    @Param('runId') runId: string,
    @Param('employeeId') employeeId: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user?.userId ?? req.user?.id;
    if (!userId) throw new BadRequestException('Authenticated user required');

    const { buffer, fileName } = await this.generator.generateForEmployee(
      runId,
      employeeId,
      userId,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });
    return new StreamableFile(buffer);
  }

  /** Batch generate payslips for entire run */
  @ApiOperation({ summary: 'Generate For Run' })
  @Post('runs/:runId/generate-all')
  async generateForRun(@Param('runId') runId: string, @Req() req: any) {
    const userId = req.user?.userId ?? req.user?.id;
    if (!userId) throw new BadRequestException('Authenticated user required');
    return this.generator.generateForRun(runId, userId);
  }
}
