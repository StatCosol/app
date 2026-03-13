import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { AuthService } from './auth.service';
import { ToastService } from '../shared/toast/toast.service';

/**
 * Monitors user activity (mouse, keyboard, touch, scroll) and
 * automatically logs out after IDLE_TIMEOUT_MS of inactivity.
 *
 * Usage: inject in the root App component and call `start()` once.
 */
@Injectable({ providedIn: 'root' })
export class IdleTimeoutService implements OnDestroy {
  /** Idle duration before auto-logout (15 minutes). */
  private readonly IDLE_TIMEOUT_MS = 15 * 60 * 1000;

  /** How often we check the idle clock (every 30 s). */
  private readonly CHECK_INTERVAL_MS = 30 * 1000;

  /** Warning toast shown this many ms before actual logout (60 s). */
  private readonly WARN_BEFORE_MS = 60 * 1000;

  private lastActivity = Date.now();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private warningShown = false;
  private started = false;

  private readonly EVENTS: (keyof DocumentEventMap)[] = [
    'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel',
  ];

  private readonly onActivity = () => {
    this.lastActivity = Date.now();
    this.warningShown = false;
  };

  constructor(
    private auth: AuthService,
    private zone: NgZone,
    private toast: ToastService,
  ) {}

  /** Call once from the root component's constructor or OnInit. */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Listen outside Angular zone so these high-frequency events
    // don't trigger unnecessary change detection cycles.
    this.zone.runOutsideAngular(() => {
      this.EVENTS.forEach((evt) =>
        document.addEventListener(evt, this.onActivity, { passive: true }),
      );

      this.intervalId = setInterval(() => this.check(), this.CHECK_INTERVAL_MS);
    });
  }

  /** Stop monitoring (e.g. on destroy). */
  stop(): void {
    this.EVENTS.forEach((evt) =>
      document.removeEventListener(evt, this.onActivity),
    );
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.started = false;
  }

  ngOnDestroy(): void {
    this.stop();
  }

  // ---- internals ----

  private check(): void {
    // Only check when user is actually logged in
    if (!this.auth.isLoggedIn()) return;

    const idle = Date.now() - this.lastActivity;

    if (idle >= this.IDLE_TIMEOUT_MS) {
      this.zone.run(() => {
        this.auth.logout('Session expired due to inactivity');
      });
      return;
    }

    // Show a console warning shortly before logout (could be upgraded to a toast)
    if (!this.warningShown && idle >= this.IDLE_TIMEOUT_MS - this.WARN_BEFORE_MS) {
      this.warningShown = true;
      this.toast.warning('You will be logged out in ~60 s due to inactivity.');
    }
  }
}
