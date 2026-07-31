import { Injectable } from '@nestjs/common';

/**
 * Liveness-provider seam for FaceDesk attendance.
 *
 * Today the only provider is {@link DeviceLivenessProvider}, which trusts the
 * on-device blink detector (and/or a server-scored frame). The interface exists
 * so a stronger provider — notably **Azure AI Face Liveness** — can be dropped
 * in later WITHOUT touching the attendance service: implement the interface,
 * bind it to {@link FACEDESK_LIVENESS_PROVIDER} in the module, and select it via
 * `FD_LIVENESS_PROVIDER`.
 *
 * Azure integration notes (deferred — needs Microsoft Limited Access approval):
 *   - Azure liveness is a *session* flow: the backend creates a liveness session
 *     (REST), hands the token to the kiosk's Azure Vision SDK, the SDK runs the
 *     passive/active check on-device against Azure, and the backend then reads
 *     the session result. So an AzureFaceLivenessProvider would need a
 *     session-create endpoint + a result lookup, not just this evaluate() call —
 *     evaluate() would consume the already-resolved Azure verdict passed up with
 *     the punch. It is cloud-only, so keep it a per-client opt-in and leave the
 *     device provider as the offline-capable default.
 */
export interface LivenessInput {
  /** The on-device blink detector's verdict (dto.livenessPassed). Untrusted. */
  clientAsserted: boolean;
  /**
   * Per-frame liveness scores produced by the SERVER (nulls = not scored). Must
   * never include request-supplied scores — the strict gate relies on these
   * being server-originated. See ResolvedFrame.serverLivenessScore.
   */
  serverScores: Array<number | null>;
}

export interface LivenessResult {
  passed: boolean;
  /** Best available liveness score in [0,1], or null when none was scored. */
  score: number | null;
  /** Which provider produced the verdict (for auditing). */
  provider: string;
}

export interface FaceDeskLivenessProvider {
  readonly name: string;
  evaluate(input: LivenessInput): Promise<LivenessResult>;
}

/** DI token so the concrete provider can be swapped without code changes. */
export const FACEDESK_LIVENESS_PROVIDER = 'FACEDESK_LIVENESS_PROVIDER';

/**
 * Default provider: the on-device blink detector is the primary signal, with an
 * optional server-scored frame as corroboration.
 *
 *  - FD_REQUIRE_SERVER_LIVENESS=true → ignore the client-asserted flag entirely
 *    and require a server-scored frame at/above the floor, so a modified or old
 *    APK can't assert liveness it never actually checked.
 *  - FD_SERVER_LIVENESS_MIN (default 0.5) → the server-score floor.
 */
@Injectable()
export class DeviceLivenessProvider implements FaceDeskLivenessProvider {
  readonly name = 'device';

  private readonly requireServer =
    (process.env.FD_REQUIRE_SERVER_LIVENESS ?? 'false').toLowerCase() === 'true';
  private readonly floor = Number(process.env.FD_SERVER_LIVENESS_MIN ?? 0.5);

  async evaluate(input: LivenessInput): Promise<LivenessResult> {
    let best = -1;
    for (const s of input.serverScores) {
      if (s != null && s > best) best = s;
    }
    const serverLive = best >= this.floor;
    const passed = this.requireServer
      ? serverLive
      : input.clientAsserted || serverLive;
    return { passed, score: best >= 0 ? best : null, provider: this.name };
  }
}
