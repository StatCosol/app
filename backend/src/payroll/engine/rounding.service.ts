import { Injectable } from '@nestjs/common';

@Injectable()
export class RoundingService {
  applyRounding(amount: number, mode: string): number {
    switch (mode) {
      case 'NEAREST_RUPEE':
        return Math.round(amount);
      case 'FLOOR':
        return Math.floor(amount);
      case 'CEIL':
        return Math.ceil(amount);
      case 'ROUND_50':
        return Math.round(amount * 2) / 2;
      case 'NO_ROUNDING':
        return amount;
      default:
        return Math.round(amount);
    }
  }

  applyMinMax(amount: number, min: number | null, max: number | null): number {
    let result = amount;
    if (min !== null && min !== undefined && result < min) {
      result = min;
    }
    if (max !== null && max !== undefined && result > max) {
      result = max;
    }
    return result;
  }
}
