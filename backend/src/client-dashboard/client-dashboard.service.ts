import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { ContractorDocumentEntity } from '../contractor/entities/contractor-document.entity';
import { ContractorRequiredDocumentEntity } from '../contractor/entities/contractor-required-document.entity';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/entities/user.entity';
import { ClientDashboardQueryDto } from './dto/dashboard-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ClientDashboardService {
  constructor(
    @InjectRepository(EmployeeEntity)
    private readonly employees: Repository<EmployeeEntity>,
    @InjectRepository(ContractorDocumentEntity)
    private readonly contractorDocs: Repository<ContractorDocumentEntity>,
    @InjectRepository(ContractorRequiredDocumentEntity)
    private readonly requiredDocs: Repository<ContractorRequiredDocumentEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly usersService: UsersService,
  ) {}

  private parseMonth(month: string) {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m || m < 1 || m > 12)
      throw new BadRequestException('Invalid month format, expected YYYY-MM');
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    return { start, end };
  }

  private async resolveScope(user: any, branchId?: string) {
    if (user.roleCode !== 'CLIENT')
      throw new ForbiddenException('Client role required');

    const me = await this.usersService.getMe(user.userId);
    if (!me.clientId) throw new ForbiddenException('Client missing clientId');

    const allowedBranchIds = me.branchIds || [];
    let branchIds: string[] = [];

    if (branchId) {
      if (me.isMasterUser || allowedBranchIds.length === 0) {
        branchIds = [branchId];
      } else if (allowedBranchIds.includes(branchId)) {
        branchIds = [branchId];
      } else {
        throw new ForbiddenException('Branch not allowed');
      }
    } else if (!me.isMasterUser && allowedBranchIds.length) {
      branchIds = allowedBranchIds;
    }

    return { clientId: me.clientId as string, branchIds };
  }

  private computePendingDays(date?: string | Date | null) {
    if (!date) return 0;
    const d = date instanceof Date ? date : new Date(date + 'T00:00:00Z');
    const diff = Math.floor((Date.now() - d.getTime()) / DAY_MS);
    return diff > 0 ? diff : 0;
  }

  async getPfEsiSummary(user: any, dto: ClientDashboardQueryDto) {
    const scope = await this.resolveScope(user, dto.branchId);
    const baseQb = this.employees
      .createQueryBuilder('e')
      .where('e.client_id = :clientId', { clientId: scope.clientId })
      .andWhere('e.is_active = TRUE');

    if (scope.branchIds.length) {
      baseQb.andWhere('e.branch_id IN (:...branchIds)', {
        branchIds: scope.branchIds,
      });
    }

    const pfRegistered = await baseQb
      .clone()
      .andWhere('e.pf_applicable = TRUE AND e.pf_registered = TRUE')
      .getCount();

    const pfPendingRows = await baseQb
      .clone()
      .select([
        'e.id as id',
        'e.employee_code as employeeCode',
        'e.first_name as firstName',
        'e.last_name as lastName',
        'e.date_of_joining as dateOfJoining',
        'e.pf_applicable_from as pfApplicableFrom',
        'e.uan as uan',
      ])
      .andWhere(
        'e.pf_applicable = TRUE AND (e.pf_registered = FALSE OR e.pf_registered IS NULL)',
      )
      .getRawMany();

    const pfPending = pfPendingRows.map((r: any) => ({
      employeeId: r.id,
      empCode: r.employeeCode,
      name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim(),
      dateOfJoining: r.dateOfJoining || null,
      pfApplicable: true,
      pfRegistered: false,
      uanAvailable: !!r.uan,
      uan: r.uan || null,
      pendingDays: this.computePendingDays(r.pfApplicableFrom || r.dateOfJoining),
    }));

    const esiRegistered = await baseQb
      .clone()
      .andWhere('e.esi_applicable = TRUE AND e.esi_registered = TRUE')
      .getCount();

    const esiPendingRows = await baseQb
      .clone()
      .select([
        'e.id as id',
        'e.employee_code as employeeCode',
        'e.first_name as firstName',
        'e.last_name as lastName',
        'e.date_of_joining as dateOfJoining',
        'e.esi_applicable_from as esiApplicableFrom',
        'e.esic as ipNumber',
      ])
      .andWhere(
        'e.esi_applicable = TRUE AND (e.esi_registered = FALSE OR e.esi_registered IS NULL)',
      )
      .getRawMany();

    const esiPending = esiPendingRows.map((r: any) => ({
      employeeId: r.id,
      empCode: r.employeeCode,
      name: [r.firstName, r.lastName].filter(Boolean).join(' ').trim(),
      dateOfJoining: r.dateOfJoining || null,
      esiApplicable: true,
      esiRegistered: false,
      ipNumberAvailable: !!r.ipNumber,
      ipNumber: r.ipNumber || null,
      pendingDays: this.computePendingDays(r.esiApplicableFrom || r.dateOfJoining),
    }));

    return {
      pf: {
        registered: pfRegistered,
        notRegisteredApplicable: pfPending.length,
        pendingEmployees: pfPending,
      },
      esi: {
        registered: esiRegistered,
        notRegisteredApplicable: esiPending.length,
        pendingEmployees: esiPending,
      },
    };
  }

  async getContractorUploadSummary(user: any, dto: ClientDashboardQueryDto) {
    const scope = await this.resolveScope(user, dto.branchId);
    const { start, end } = this.parseMonth(dto.month);

    const reqQb = this.requiredDocs
      .createQueryBuilder('r')
      .select('r.contractor_id', 'contractorId')
      .addSelect('COUNT(*)', 'expected')
      .where('r.client_id = :clientId', { clientId: scope.clientId })
      .andWhere('r.is_required = TRUE');

    if (scope.branchIds.length) {
      reqQb.andWhere('(r.branch_id IS NULL OR r.branch_id IN (:...branchIds))', {
        branchIds: scope.branchIds,
      });
    }

    const requiredRows = await reqQb.groupBy('r.contractor_id').getRawMany();
    const requiredMap = new Map<string, number>();
    requiredRows.forEach((r: any) =>
      requiredMap.set(String(r.contractorId), Number(r.expected || 0)),
    );

    const monthStr = dto.month; // YYYY-MM
    const uploadedQb = this.contractorDocs
      .createQueryBuilder('d')
      .select('d.contractor_id', 'contractorId')
      .addSelect(
        "SUM(CASE WHEN d.status IN ('UPLOADED','APPROVED','PENDING_REVIEW') THEN 1 ELSE 0 END)",
        'uploaded',
      )
      .where('d.client_id = :clientId', { clientId: scope.clientId })
      .andWhere(
        '(d.doc_month = :monthStr OR (d.doc_month IS NULL AND d.created_at >= :start AND d.created_at < :end))',
        { monthStr, start, end },
      );

    if (scope.branchIds.length) {
      uploadedQb.andWhere('d.branch_id IN (:...branchIds)', {
        branchIds: scope.branchIds,
      });
    }

    const uploadedRows = await uploadedQb.groupBy('d.contractor_id').getRawMany();
    const uploadedMap = new Map<string, number>();
    uploadedRows.forEach((r: any) =>
      uploadedMap.set(String(r.contractorId), Number(r.uploaded || 0)),
    );

    const contractorIds = Array.from(
      new Set([
        ...requiredMap.keys(),
        ...uploadedMap.keys(),
      ]),
    );

    const names = contractorIds.length
      ? await this.usersRepo.find({
          select: ['id', 'name'],
          where: { id: In(contractorIds) },
        })
      : [];
    const nameMap = new Map<string, string>();
    names.forEach((u) => nameMap.set(u.id, u.name));

    let totalExpected = 0;
    let totalUploaded = 0;

    const contractors = contractorIds.map((id) => {
      const expected = requiredMap.get(id) ?? 0;
      const uploaded = uploadedMap.get(id) ?? 0;
      totalExpected += expected;
      totalUploaded += uploaded;
      const percent = expected > 0 ? Math.round((uploaded / expected) * 100) : 0;
      return {
        contractorId: id,
        name: nameMap.get(id) ?? 'Contractor',
        percent,
        uploaded,
        expected,
      };
    });

    const overallPercent = totalExpected > 0
      ? Math.round((totalUploaded / totalExpected) * 100)
      : 0;

    const sorted = [...contractors].sort((a, b) => b.percent - a.percent);

    return {
      overallPercent,
      contractors,
      top10: sorted.slice(0, 10),
      bottom10: [...contractors]
        .sort((a, b) => a.percent - b.percent)
        .slice(0, 10),
    };
  }
}
