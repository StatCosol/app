import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModuleOptions } from '@nestjs/throttler';
import { ThrottlerStorage } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

/**
 * Rate limit per signed-in user, not per source address.
 *
 * The limit (120/min) is applied to whatever getTracker() returns. The stock
 * guard returns req.ip, and behind nginx + the Azure ingress that is the
 * proxy's address — identical for every customer — so the whole tenant base
 * shared one bucket and a busy afternoon could 429 unrelated users. Screens
 * that swallow load errors render those as "no data" rather than an error.
 *
 * The throttler runs before JwtAuthGuard, so req.user is not populated yet;
 * we verify the bearer token here instead. Verification (not decode) matters:
 * an unsigned `sub` would let a caller mint unlimited buckets. Anything
 * without a usable token — login included — still falls back to the address,
 * which main.ts now resolves through the proxy chain.
 */
@Injectable()
export class RequestThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Request): Promise<string> {
    const header = req.headers?.authorization;
    const token =
      typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
        ? header.slice(7).trim()
        : null;
    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub?: string }>(token);
        if (payload?.sub) return `user:${payload.sub}`;
      } catch {
        // Expired or forged: fall through to the address bucket.
      }
    }
    return `ip:${req.ip ?? req.socket?.remoteAddress ?? 'unknown'}`;
  }
}
