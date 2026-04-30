import { Injectable } from '@nestjs/common';

/**
 * Gratuity Calculator — Payment of Gratuity Act, 1972 (India)
 *
 * Formula: Gratuity = (15 × last drawn salary × years of service) / 26
 *
 * - "Last drawn salary" = basic + DA (dearness allowance)
 * - Minimum 5 years of continuous service required (except death/disability)
 * - Maximum gratuity: ₹25,00,000 (as per 2024 amendment)
 */
import { IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';

export class GratuityInput {
  @IsNumber() @Min(0) lastDrawnSalary: number; // monthly basic + DA
  @IsNumber() @Min(0) yearsOfService: number;
  @IsOptional() @IsNumber() @Min(0) monthsOfService?: number; // partial year (rounds ≥ 6 months up)
  @IsOptional() @IsBoolean() isDeathOrDisability?: boolean; // waives 5-year minimum
}

export interface GratuityResult {
  eligible: boolean;
  reason?: string;
  grossGratuity: number;
  cappedGratuity: number; // capped at ₹25L
  yearsConsidered: number;
  formula: string;
}

const MAX_GRATUITY = 2500000; // ₹25,00,000

@Injectable()
export class GratuityCalculatorService {
  calculate(input: GratuityInput): GratuityResult {
    let years = input.yearsOfService;
    const months = input.monthsOfService ?? 0;

    // Round up if partial year ≥ 6 months
    if (months >= 6) {
      years += 1;
    }

    // Eligibility check
    if (years < 5 && !input.isDeathOrDisability) {
      return {
        eligible: false,
        reason: 'Minimum 5 years of continuous service required',
        grossGratuity: 0,
        cappedGratuity: 0,
        yearsConsidered: years,
        formula: 'N/A — not eligible',
      };
    }

    const gross = (15 * input.lastDrawnSalary * years) / 26;
    const capped = Math.min(gross, MAX_GRATUITY);

    return {
      eligible: true,
      grossGratuity: Math.round(gross * 100) / 100,
      cappedGratuity: Math.round(capped * 100) / 100,
      yearsConsidered: years,
      formula: `(15 × ₹${input.lastDrawnSalary} × ${years}) / 26 = ₹${gross.toFixed(2)}`,
    };
  }
}
