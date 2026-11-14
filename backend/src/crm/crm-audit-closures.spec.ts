import { CrmComplianceTrackerController } from './crm-compliance-tracker.controller';
import {
  actualAuditObservationSql,
  actualAuditSql,
} from '../common/actual-records';

describe('CRM operational audit closures', () => {
  it.each([undefined, 'assigned-client'])(
    'filters fixtures before aggregation and preserves client scope (%s)',
    async (clientId) => {
      const rows = [
        { auditId: 'actual-audit', totalObservations: '2', closurePct: 50 },
      ];
      const many = jest.fn().mockResolvedValue(rows);
      const controller = new CrmComplianceTrackerController(
        { many } as any,
        {} as any,
      );
      const result = await controller.auditClosures(
        { id: 'crm-user' } as any,
        clientId ? { clientId } : {},
      );
      const [sql, params] = many.mock.calls[0];
      expect(params).toEqual(['crm-user', clientId || null]);
      expect(sql).toContain("ca.assignment_type = 'CRM'");
      expect(sql).toContain('ca.assigned_to_user_id = $1::uuid');
      expect(sql).toContain('JOIN crm_clients cc ON cc.client_id = c.id');
      expect(sql).toContain('($2::uuid IS NULL OR c.id = $2)');
      expect(sql).toContain(actualAuditSql('a'));
      expect(sql).toContain(actualAuditObservationSql('ao'));
      expect(sql.indexOf(actualAuditObservationSql('ao'))).toBeLessThan(
        sql.indexOf('GROUP BY'),
      );
      expect(sql).toContain('HAVING COUNT(ao.id) > 0');
      expect(sql).not.toMatch(/\b(UPDATE|DELETE|INSERT)\b/i);
      expect(result).toEqual({ data: rows });
      expect(many).toHaveBeenCalledTimes(1);
    },
  );
});
