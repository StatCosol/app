import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';

export class ClientCommPolicyDto {
  @IsIn(['PAYROLL_INPUT_REQUEST', 'MCD_REQUEST'])
  commType: string;
  @IsInt()
  @Min(1)
  @Max(28)
  requestDay: number;
  @IsInt()
  @Min(1)
  @Max(28)
  deadlineDay: number;
  @IsBoolean()
  enabled: boolean;
  @IsInt()
  @Min(0)
  version: number;
}
export const COMM_POLICY_DEFAULTS = [
  {
    commType: 'PAYROLL_INPUT_REQUEST',
    requestDay: 1,
    deadlineDay: 7,
    enabled: true,
    version: 0,
  },
  {
    commType: 'MCD_REQUEST',
    requestDay: 16,
    deadlineDay: 25,
    enabled: true,
    version: 0,
  },
];
@Injectable()
export class ClientCommPolicyService {
  constructor(private readonly ds: DataSource) {}
  async list(clientId: string) {
    const rows = await this.ds.query(
      `SELECT comm_type AS "commType", request_day AS "requestDay", deadline_day AS "deadlineDay", enabled, version FROM client_communication_policies WHERE client_id=$1`,
      [clientId],
    );
    return COMM_POLICY_DEFAULTS.map((d) => ({
      ...d,
      ...rows.find((r) => r.commType === d.commType),
    }));
  }
  async get(clientId: string, commType: string) {
    return (await this.list(clientId)).find((p) => p.commType === commType)!;
  }
  async save(clientId: string, q: ClientCommPolicyDto, actor: string) {
    if (q.deadlineDay < q.requestDay)
      throw new BadRequestException(
        'Deadline must be on or after the request day',
      );
    const rows = await this.ds.query(
      `INSERT INTO client_communication_policies (client_id,comm_type,request_day,deadline_day,enabled,version,updated_by)
      SELECT $1,$2,$3,$4,$5,1,$7 WHERE $6=0
      ON CONFLICT (client_id,comm_type) DO NOTHING RETURNING version`,
      [
        clientId,
        q.commType,
        q.requestDay,
        q.deadlineDay,
        q.enabled,
        q.version,
        actor,
      ],
    );
    if (!rows.length) {
      const updated = await this.ds.query(
        `UPDATE client_communication_policies SET request_day=$3,deadline_day=$4,enabled=$5,version=version+1,updated_by=$7,updated_at=NOW() WHERE client_id=$1 AND comm_type=$2 AND version=$6 RETURNING version`,
        [
          clientId,
          q.commType,
          q.requestDay,
          q.deadlineDay,
          q.enabled,
          q.version,
          actor,
        ],
      );
      if (!updated.length)
        throw new ConflictException('Settings changed. Refresh before saving.');
    }
    return this.list(clientId);
  }
}
