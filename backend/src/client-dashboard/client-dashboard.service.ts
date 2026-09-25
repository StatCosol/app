import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { ContractorDocumentEntity } from '../contractor/entities/contractor-document.entity';
import { ContractorRequiredDocumentEntity } from '../contractor/entities/contractor-required-document.entity';
import { BranchContractorEntity } from '../branches/entities/branch-contractor.entity';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/entities/user.entity';
import { ClientDashboardQueryDto } from './dto/dashboard-query.dto';
import { ReqUser } from '../access/access-scope.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute cache

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

@Injectable()
export class ClientDashboardService {
  private readonly cache = new Map<string, CacheEntry>();

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  constructor(
    @InjectRepository(EmployeeEntity)
    private readonly employees: Repository<EmployeeEntity>,
    @InjectRepository(ContractorDocumentEntity)
    private readonly contractorDocs: Repository<ContractorDocumentEntity>,
    @InjectRepository(ContractorRequiredDocumentEntity)
    private readonly requiredDocs: Repository<ContractorRequiredDocumentEntity>,
    @InjectRepository(BranchContractorEntity)
    private readonly branchContractorRepo: Repository<BranchContractorEntity>,
    @InjectRepository(UserEntity)
    private readonly _usersRepo: Repository<UserEntity>,
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

  private async resolveScope(user: ReqUser, branchId?: string) {
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

    return { clientId: me.clientId, branchIds };
  }

  private computePendingDays(date?: string | Date | null) {
    if (!date) return 0;
    const d = date instanceof Date ? date : new Date(date + 'T00:00:00Z');
    const diff = Math.floor((Date.now() - d.getTime()) / DAY_MS);
    return diff > 0 ? diff : 0;
  }

  /**
   * Employees marked registered who carry no number for it.
   *
   * A registration without a UAN or an ESIC number cannot be filed against,
   * and because the row counts as registered it never appears in the pending
   * list either — so it sits unnoticed until a return is rejected.
   */
  private async registeredWithoutNumber(
    baseQb: SelectQueryBuilder<EmployeeEntity>,
    registeredColumn: 'pf_registered' | 'esi_registered',
    numberColumn: 'uan' | 'esic',
  ) {
    const rows = await baseQb
      .clone()
      .select([
        'e.id as id',
        'e.employee_code as employeeCode',
        'e.name as name',
        'e.date_of_joining as dateOfJoining',
      ])
      .andWhere(`e.${registeredColumn} = TRUE`)
      .andWhere(
        `NULLIF(BTRIM(COALESCE(e.${numberColumn}, '')), '') IS NULL`,
      )
      .getRawMany();
    return rows.map(
      (r: {
        id: string;
        employeeCode: string;
        name: string;
        dateOfJoining: string | null;
      }) => ({
        employeeId: r.id,
        empCode: r.employeeCode,
        name: r.name || '',
        dateOfJoining: r.dateOfJoining || null,
      }),
    );
  }

  async getPfEsiSummary(user: ReqUser, dto: ClientDashboardQueryDto) {
    const scope = await this.resolveScope(user, dto.branchId);
    const cacheKey = `pfesi:${scope.clientId}:${scope.branchIds.join(',')}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const baseQb = this.employees
      .createQueryBuilder('e')
      .where('e.client_id = :clientId', { clientId: scope.clientId })
      .andWhere('e.is_active = TRUE');

    if (scope.branchIds.length) {
      baseQb.andWhere('e.branch_id IN (:...branchIds)', {
        branchIds: scope.branchIds,
      });
    }

    // Registration is a fact about the employee; applicability is a wage test
    // that changes month to month. Someone registered whose pay has since
    // risen past the ESI ceiling stays registered and covered to the end of
    // the contribution period, so counting only the applicable ones drops
    // them from the figure — 10 of Vedha's 30 ESI registrations, in practice.
    const pfRegistered = await baseQb
      .clone()
      .andWhere('e.pf_registered = TRUE')
      .getCount();

    const pfPendingRows = await baseQb
      .clone()
      .select([
        'e.id as id',
        'e.employee_code as employeeCode',
        'e.name as name',
        'e.date_of_joining as dateOfJoining',
        'e.pf_applicable_from as pfApplicableFrom',
        'e.uan as uan',
      ])
      .andWhere(
        'e.pf_applicable = TRUE AND (e.pf_registered = FALSE OR e.pf_registered IS NULL)',
      )
      .getRawMany();

    const pfPending = pfPendingRows.map(
      (r: {
        id: string;
        employeeCode: string;
        name: string;
        dateOfJoining: string | null;
        pfApplicableFrom: string | null;
        uan: string | null;
      }) => ({
        employeeId: r.id,
        empCode: r.employeeCode,
        name: r.name || '',
        dateOfJoining: r.dateOfJoining || null,
        pfApplicable: true,
        pfRegistered: false,
        uanAvailable: !!r.uan,
        uan: r.uan || null,
        pendingDays: this.computePendingDays(
          r.pfApplicableFrom || r.dateOfJoining,
        ),
      }),
    );

    const esiRegistered = await baseQb
      .clone()
      .andWhere('e.esi_registered = TRUE')
      .getCount();

    const esiPendingRows = await baseQb
      .clone()
      .select([
        'e.id as id',
        'e.employee_code as employeeCode',
        'e.name as name',
        'e.date_of_joining as dateOfJoining',
        'e.esi_applicable_from as esiApplicableFrom',
        'e.esic as ipNumber',
      ])
      .andWhere(
        'e.esi_applicable = TRUE AND (e.esi_registered = FALSE OR e.esi_registered IS NULL)',
      )
      .getRawMany();

    const esiPending = esiPendingRows.map(
      (r: {
        id: string;
        employeeCode: string;
        name: string;
        dateOfJoining: string | null;
        esiApplicableFrom: string | null;
        ipNumber: string | null;
      }) => ({
        employeeId: r.id,
        empCode: r.employeeCode,
        name: r.name || '',
        dateOfJoining: r.dateOfJoining || null,
        esiApplicable: true,
        esiRegistered: false,
        ipNumberAvailable: !!r.ipNumber,
        ipNumber: r.ipNumber || null,
        pendingDays: this.computePendingDays(
          r.esiApplicableFrom || r.dateOfJoining,
        ),
      }),
    );

    // Marked registered but carrying no number. They count as done and drop
    // out of the pending list, yet no return can be filed for them, so
    // nothing would ever surface them again.
    const pfMissingNumber = await this.registeredWithoutNumber(
      baseQb,
      'pf_registered',
      'uan',
    );
    const esiMissingNumber = await this.registeredWithoutNumber(
      baseQb,
      'esi_registered',
      'esic',
    );

    const result = {
      pf: {
        registered: pfRegistered,
        notRegisteredApplicable: pfPending.length,
        pendingEmployees: pfPending,
        registeredWithoutNumber: pfMissingNumber.length,
        missingNumberEmployees: pfMissingNumber,
      },
      esi: {
        registered: esiRegistered,
        notRegisteredApplicable: esiPending.length,
        pendingEmployees: esiPending,
        registeredWithoutNumber: esiMissingNumber.length,
        missingNumberEmployees: esiMissingNumber,
      },
    };
    this.setCache(cacheKey, result);
    return result;
  }

  async getContractorUploadSummary(
    user: ReqUser,
    dto: ClientDashboardQueryDto,
  ) {
    const scope = await this.resolveScope(user, dto.branchId);
    const cacheKey = `contractor:${scope.clientId}:${scope.branchIds.join(',')}:${dto.month}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const { start, end } = this.parseMonth(dto.month);

    // ─── 1. Use branch_contractor as the source of truth for contractor IDs & names ───
    //    This guarantees we only show CONTRACTOR-role users (validated on creation).
    const bcQb = this.branchContractorRepo
      .createQueryBuilder('bc')
      .leftJoin('users', 'u', 'u.id = bc.contractor_user_id')
      .select('bc.contractor_user_id', 'contractorId')
      .addSelect("COALESCE(u.name, u.email, 'Contractor')", 'name')
      .where('bc.client_id = :clientId', { clientId: scope.clientId });

    if (scope.branchIds.length) {
      bcQb.andWhere('bc.branch_id IN (:...branchIds)', {
        branchIds: scope.branchIds,
      });
    }

    const bcRows = await bcQb
      .groupBy('bc.contractor_user_id')
      .addGroupBy('u.name')
      .addGroupBy('u.email')
      .getRawMany();

    // Authoritative contractor IDs → names map (only real CONTRACTOR users)
    const nameMap = new Map<string, string>();
    bcRows.forEach((r: { contractorId: string; name: string }) =>
      nameMap.set(String(r.contractorId), String(r.name)),
    );

    const contractorIds = Array.from(nameMap.keys());
    if (!contractorIds.length) {
      return { overallPercent: 0, contractors: [], top10: [], bottom10: [] };
    }

    // ─── 2. Expected docs from contractor_required_documents (scoped to real contractors) ───
    const reqQb = this.requiredDocs
      .createQueryBuilder('r')
      .select('r.contractor_user_id', 'contractorId')
      .addSelect('COUNT(*)', 'expected')
      .where('r.client_id = :clientId', { clientId: scope.clientId })
      .andWhere('r.is_required = TRUE')
      .andWhere('r.contractor_user_id IN (:...contractorIds)', {
        contractorIds,
      });

    if (scope.branchIds.length) {
      reqQb.andWhere(
        '(r.branch_id IS NULL OR r.branch_id IN (:...branchIds))',
        {
          branchIds: scope.branchIds,
        },
      );
    }

    const requiredRows = await reqQb
      .groupBy('r.contractor_user_id')
      .getRawMany();
    const requiredMap = new Map<string, number>();
    requiredRows.forEach(
      (r: { contractorId: string; expected: string | number }) =>
        requiredMap.set(String(r.contractorId), Number(r.expected || 0)),
    );

    // ─── 3. Uploaded docs from contractor_documents (scoped to real contractors) ───
    const monthStr = dto.month; // YYYY-MM
    const uploadedQb = this.contractorDocs
      .createQueryBuilder('d')
      .select('d.contractor_user_id', 'contractorId')
      .addSelect(
        "SUM(CASE WHEN d.status IN ('UPLOADED','APPROVED','PENDING_REVIEW') THEN 1 ELSE 0 END)",
        'uploaded',
      )
      .where('d.client_id = :clientId', { clientId: scope.clientId })
      .andWhere('d.contractor_user_id IN (:...contractorIds)', {
        contractorIds,
      })
      .andWhere(
        '(d.doc_month = :monthStr OR (d.doc_month IS NULL AND d.created_at >= :start AND d.created_at < :end))',
        { monthStr, start, end },
      );

    if (scope.branchIds.length) {
      uploadedQb.andWhere('d.branch_id IN (:...branchIds)', {
        branchIds: scope.branchIds,
      });
    }

    const uploadedRows = await uploadedQb
      .groupBy('d.contractor_user_id')
      .getRawMany();
    const uploadedMap = new Map<string, number>();
    uploadedRows.forEach(
      (r: { contractorId: string; uploaded: string | number }) =>
        uploadedMap.set(String(r.contractorId), Number(r.uploaded || 0)),
    );

    // ─── 4. Build results for every known contractor ───
    let totalExpected = 0;
    let totalUploaded = 0;

    const contractors = contractorIds.map((id) => {
      const expected = requiredMap.get(id) ?? 0;
      const uploaded = uploadedMap.get(id) ?? 0;
      totalExpected += expected;
      totalUploaded += uploaded;
      const percent =
        expected > 0 ? Math.round((uploaded / expected) * 100) : 0;
      return {
        contractorUserId: id,
        name: nameMap.get(id) ?? 'Contractor',
        percent,
        uploaded,
        expected,
      };
    });

    const overallPercent =
      totalExpected > 0 ? Math.round((totalUploaded / totalExpected) * 100) : 0;

    const sorted = [...contractors].sort((a, b) => b.percent - a.percent);

    const result = {
      overallPercent,
      contractors,
      top10: sorted.slice(0, 10),
      bottom10: [...contractors]
        .sort((a, b) => a.percent - b.percent)
        .slice(0, 10),
    };
    this.setCache(cacheKey, result);
    return result;
  }
}
