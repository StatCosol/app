import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollStatutorySlabEntity } from '../entities/payroll-statutory-slab.entity';

/**
 * StateSlabService
 *
 * Resolves a monetary amount from the payroll_statutory_slabs table
 * given clientId + stateCode + componentCode + baseAmount.
 *
 * Fallback order:
 *   1) Per-client + state-specific (e.g., clientId=X, stateCode='MH')
 *   2) Per-client + ALL
 *   3) Shared default + state-specific (clientId = SHARED_CLIENT_ID)
 *   4) Shared default + ALL
 *
 * Slab matching: baseAmount >= from_amount AND (to_amount IS NULL OR baseAmount <= to_amount)
 * Resolution: value_amount (fixed) takes priority, then value_percent (percentage of base).
 *
 * Shared defaults are seeded by migration 20260508_state_pt_lwf_global_slabs.sql
 * under the all-zeroes UUID and cover standard Indian state PT and LWF rates.
 */
export const SHARED_SLAB_CLIENT_ID = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class StateSlabService {
  constructor(
    @InjectRepository(PayrollStatutorySlabEntity)
    private readonly slabRepo: Repository<PayrollStatutorySlabEntity>,
  ) {}

  /**
   * Keep only the rows in force on `asOfDate`, then the newest version of them.
   *
   * A state can have several generations of slabs in the table at once — that
   * is the point of the effective dates. Filtering by date alone can still
   * leave two generations overlapping (an old row nobody closed off, and its
   * replacement), and the band match would then take whichever sorted first.
   * The latest effective_from wins, which is what "revised with effect from"
   * means.
   */
  private static inForceOn(
    rows: PayrollStatutorySlabEntity[],
    asOfDate: string,
  ): PayrollStatutorySlabEntity[] {
    const live = rows.filter((r) => {
      const from = String(r.effectiveFrom ?? '');
      const to = r.effectiveTo != null ? String(r.effectiveTo) : null;
      if (from && from > asOfDate) return false;
      if (to && to < asOfDate) return false;
      return true;
    });
    if (live.length === 0) return [];

    let newest = '';
    for (const r of live) {
      const from = String(r.effectiveFrom ?? '');
      if (from > newest) newest = from;
    }
    return live.filter((r) => String(r.effectiveFrom ?? '') === newest);
  }

  /** Today, when a caller has no payroll period to offer. */
  private static today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  async resolveAmount(params: {
    clientId: string;
    stateCode: string;
    componentCode: string;
    baseAmount: number;
    /**
     * The payroll period this is being computed for, as YYYY-MM-DD.
     *
     * Without it every lookup answered with today's rates, so reprocessing an
     * earlier month applied a revision that month never saw. Optional because
     * preview and admin callers legitimately mean "as things stand now".
     */
    asOfDate?: string;
  }): Promise<number> {
    const { clientId, stateCode, componentCode, baseAmount } = params;
    const asOfDate =
      params.asOfDate && /^\d{4}-\d{2}-\d{2}$/.test(params.asOfDate)
        ? params.asOfDate
        : StateSlabService.today();

    const lookup = async (cid: string, sc: string) =>
      StateSlabService.inForceOn(
        await this.slabRepo.find({
          where: { clientId: cid, stateCode: sc, componentCode },
          order: { fromAmount: 'ASC' },
        }),
        asOfDate,
      );

    // 1) Per-client, state-specific
    let slabs = await lookup(clientId, stateCode);

    // 2) Per-client, ALL fallback
    if (slabs.length === 0 && stateCode !== 'ALL') {
      slabs = await lookup(clientId, 'ALL');
    }

    // 3) Shared defaults, state-specific
    if (slabs.length === 0 && clientId !== SHARED_SLAB_CLIENT_ID) {
      slabs = await lookup(SHARED_SLAB_CLIENT_ID, stateCode);
    }

    // 4) Shared defaults, ALL
    if (
      slabs.length === 0 &&
      clientId !== SHARED_SLAB_CLIENT_ID &&
      stateCode !== 'ALL'
    ) {
      slabs = await lookup(SHARED_SLAB_CLIENT_ID, 'ALL');
    }

    if (slabs.length === 0) return 0;

    for (const s of slabs) {
      const from = Number(s.fromAmount);
      const to = s.toAmount != null ? Number(s.toAmount) : null;
      const inRange = baseAmount >= from && (to === null || baseAmount <= to);

      if (!inRange) continue;

      if (s.valueAmount != null) return Number(s.valueAmount);
      if (s.valuePercent != null)
        return (baseAmount * Number(s.valuePercent)) / 100;
      return 0;
    }

    return 0;
  }

  /**
   * Read-only helper for UI: lists the effective slab rows for a client +
   * state + component, walking the same fallback chain as resolveAmount().
   * Returns the rows actually used by the calculator together with the
   * source tier (per-client / shared-default) so the user understands
   * exactly what runs in production.
   */
  async listEffective(params: {
    clientId: string;
    stateCode: string;
    componentCode: string;
    /** Same meaning as on resolveAmount; defaults to today. */
    asOfDate?: string;
  }): Promise<{
    source: 'CLIENT' | 'CLIENT_ALL' | 'SHARED' | 'SHARED_ALL' | 'NONE';
    stateCode: string;
    componentCode: string;
    slabs: Array<{
      fromAmount: number;
      toAmount: number | null;
      valueAmount: number | null;
      valuePercent: number | null;
    }>;
  }> {
    const { clientId, stateCode, componentCode } = params;
    // The UI has to show what the calculator would actually use, so it walks
    // the same period filter, not just the same fallback chain.
    const asOfDate =
      params.asOfDate && /^\d{4}-\d{2}-\d{2}$/.test(params.asOfDate)
        ? params.asOfDate
        : StateSlabService.today();

    const lookup = async (cid: string, sc: string) =>
      StateSlabService.inForceOn(
        await this.slabRepo.find({
          where: { clientId: cid, stateCode: sc, componentCode },
          order: { fromAmount: 'ASC' },
        }),
        asOfDate,
      );

    const map = (
      rows: PayrollStatutorySlabEntity[],
      source: 'CLIENT' | 'CLIENT_ALL' | 'SHARED' | 'SHARED_ALL',
      sc: string,
    ) => ({
      source,
      stateCode: sc,
      componentCode,
      slabs: rows.map((r) => ({
        fromAmount: Number(r.fromAmount),
        toAmount: r.toAmount != null ? Number(r.toAmount) : null,
        valueAmount: r.valueAmount != null ? Number(r.valueAmount) : null,
        valuePercent: r.valuePercent != null ? Number(r.valuePercent) : null,
      })),
    });

    let rows = await lookup(clientId, stateCode);
    if (rows.length) return map(rows, 'CLIENT', stateCode);

    if (stateCode !== 'ALL') {
      rows = await lookup(clientId, 'ALL');
      if (rows.length) return map(rows, 'CLIENT_ALL', 'ALL');
    }

    if (clientId !== SHARED_SLAB_CLIENT_ID) {
      rows = await lookup(SHARED_SLAB_CLIENT_ID, stateCode);
      if (rows.length) return map(rows, 'SHARED', stateCode);

      if (stateCode !== 'ALL') {
        rows = await lookup(SHARED_SLAB_CLIENT_ID, 'ALL');
        if (rows.length) return map(rows, 'SHARED_ALL', 'ALL');
      }
    }

    return {
      source: 'NONE',
      stateCode,
      componentCode,
      slabs: [],
    };
  }
}
