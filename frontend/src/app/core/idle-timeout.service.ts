import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ToastService } from '../shared/toast/toast.service';

/**
 * Monitors user activity (mouse, keyboard, touch, scroll) and
 * automatically logs out after an idle timeout fetched from the backend.
 *
 * Uses multiple strategies to ensure logout even after laptop sleep:
 * 1. Dedicated logout alarm setTimeout (fires at exact expiry — most reliable on wake)
 * 2. setInterval polling (works in active tabs)
 * 3. setTimeout chaining (self-healing timer that survives browser throttling)
 * 4. requestAnimationFrame polling (fires reliably when tab is visible)
 * 5. visibilitychange / focus / pageshow / resume events (fire on wake from sleep)
 * 6. Each activity event checks idle time before resetting
 * 7. Auth interceptor calls checkFromInterceptor() on every API request
 */
@Injectable({ providedIn: 'root' })
export class IdleTimeoutService implements OnDestroy {
  /** Loaded from backend GET /api/v1/auth/session-config; fallback 15 min. */
  private idleTimeoutMs = 15 * 60 * 1000;

  /** How often we poll (every 10 s). */
  private readonly CHECK_INTERVAL_MS = 10 * 1000;

  /** Warning shown this many ms before actual logout. */
  private readonly WARN_BEFORE_MS = 60 * 1000;

  /** sessionStorage key for persisting last activity timestamp. */
  private readonly STORAGE_KEY = 'idle_last_activity';

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private alarmId: ReturnType<typeof setTimeout> | null = null;
  private warnAlarmId: ReturnType<typeof setTimeout> | null = null;
  private rafId: number | null = null;
  private lastRafCheck = 0;
  private warningShown = false;
  private started = false;
  private monitoringInitialized = false;
  private loggingOut = false;

  private readonly EVENTS: (keyof DocumentEventMap)[] = [
    'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel', 'click',
  ];

  private readonly onActivity = () => {
    if (this.loggingOut) return;
    const idle = this.getIdleMs();
    if (idle >= this.idleTimeoutMs && this.auth.isLoggedIn()) {
      this.doLogout();
      return;
    }
    this.setLastActivity(Date.now());
    this.warningShown = false;
    this.scheduleAlarms();
  };

  private readonly onWake = () => {
    if (this.loggingOut) return;
    // On visibilitychange, only act when becoming visible
    if (document.visibilityState === 'hidden') return;
    this.check();
    // Re-arm alarms: browser may have frozen them during sleep
    if (!this.loggingOut) this.scheduleAlarms();
  };

  /** Fires when a frozen tab is unfrozen (Page Lifecycle API). */
  private readonly onResume = () => {
    if (this.loggingOut) return;
    this.check();
    if (!this.loggingOut) this.scheduleAlarms();
  };

  /** rAF-based polling: fires reliably when the tab is visible/painted. */
  private readonly rafLoop = () => {
    if (this.loggingOut) return;
    const now = Date.now();
    if (now - this.lastRafCheck >= this.CHECK_INTERVAL_MS) {
      this.lastRafCheck = now;
      this.check();
    }
    this.rafId = requestAnimationFrame(this.rafLoop);
  };

  constructor(
    private auth: AuthService,
    private zone: NgZone,
    private toast: ToastService,
    private http: HttpClient,
  ) {}

  /** Call once from the root component. */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Fetch global timeout from backend, then begin monitoring
    this.http.get<{ idleTimeoutMs: number }>(
      `${environment.apiBaseUrl}/api/v1/auth/session-config`,
    ).subscribe({
      next: (cfg) => {
        if (cfg?.idleTimeoutMs > 0) {
          this.idleTimeoutMs = cfg.idleTimeoutMs;
        }
        this.beginMonitoring();
      },
      error: () => {
        // Use default 15 min on failure
        this.beginMonitoring();
      },
    });
  }

  /**
   * Called by the auth interceptor on every HTTP request.
   * Acts as a safety net: if the user is idle beyond the timeout,
   * logout immediately instead of letting the API call proceed.
   * Returns true if the session is still valid, false if logging out.
   */
  checkFromInterceptor(): boolean {
    if (this.loggingOut) return false;
    if (!this.auth.isLoggedIn()) return true; // no session to check
    const idle = this.getIdleMs();
    if (idle >= this.idleTimeoutMs) {
      this.doLogout();
      return false;
    }
    return true;
  }

  private beginMonitoring(): void {
    // If no stored timestamp, set one now
    if (!sessionStorage.getItem(this.STORAGE_KEY)) {
      this.setLastActivity(Date.now());
    }
    this.monitoringInitialized = true;

    // Listen outside Angular zone to avoid change detection on high-frequency events
    this.zone.runOutsideAngular(() => {
      this.EVENTS.forEach((evt) =>
        document.addEventListener(evt, this.onActivity, { passive: true }),
      );

      document.addEventListener('visibilitychange', this.onWake);
      window.addEventListener('focus', this.onWake);
      window.addEventListener('pageshow', this.onWake);

      // Page Lifecycle API: fires when a frozen tab resumes
      document.addEventListener('resume', this.onResume);

      // Strategy 1: Dedicated logout alarm — fires at exact expiry time.
      // Browsers MUST fire expired timeouts immediately on wake from sleep.
      this.scheduleAlarms();

      // Strategy 2: setInterval (may be throttled in background tabs)
      this.intervalId = setInterval(() => this.check(), this.CHECK_INTERVAL_MS);

      // Strategy 3: self-healing setTimeout chain
      this.scheduleTimeout();

      // Strategy 4: requestAnimationFrame (fires reliably when tab is visible)
      this.lastRafCheck = Date.now();
      this.rafId = requestAnimationFrame(this.rafLoop);
    });

    // Immediate check on start (e.g. page was reloaded after being idle)
    this.check();
  }

  /**
   * Set one-shot timeouts for warning and logout at the exact moments
   * they should fire. Browsers must fire expired timeouts on tab unfreeze.
   */
  private scheduleAlarms(): void {
    if (this.alarmId) { clearTimeout(this.alarmId); this.alarmId = null; }
    if (this.warnAlarmId) { clearTimeout(this.warnAlarmId); this.warnAlarmId = null; }

    if (!this.auth.isLoggedIn()) return;

    const idle = this.getIdleMs();
    const remaining = this.idleTimeoutMs - idle;

    if (remaining <= 0) {
      this.check(); // already expired
      return;
    }

    // Logout alarm: fires at exact expiry
    this.alarmId = setTimeout(() => {
      this.alarmId = null;
      this.check();
    }, remaining);

    // Warning alarm: fires WARN_BEFORE_MS before expiry
    const warnRemaining = remaining - this.WARN_BEFORE_MS;
    if (warnRemaining > 0) {
      this.warnAlarmId = setTimeout(() => {
        this.warnAlarmId = null;
        this.check();
      }, warnRemaining);
    }
  }

  /** Self-healing setTimeout chain: each timeout schedules the next one. */
  private scheduleTimeout(): void {
    this.timeoutId = setTimeout(() => {
      this.check();
      if (!this.loggingOut) {
        this.scheduleTimeout();
      }
    }, this.CHECK_INTERVAL_MS);
  }

  stop(): void {
    this.EVENTS.forEach((evt) =>
      document.removeEventListener(evt, this.onActivity),
    );
    document.removeEventListener('visibilitychange', this.onWake);
    window.removeEventListener('focus', this.onWake);
    window.removeEventListener('pageshow', this.onWake);
    document.removeEventListener('resume', this.onResume);
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.alarmId) {
      clearTimeout(this.alarmId);
      this.alarmId = null;
    }
    if (this.warnAlarmId) {
      clearTimeout(this.warnAlarmId);
      this.warnAlarmId = null;
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.started = false;
    this.monitoringInitialized = false;
  }

  ngOnDestroy(): void {
    this.stop();
  }

  // ---- internals ----

  /** Read last activity from sessionStorage (source of truth). */
  private getLastActivity(): number {
    try {
      const stored = sessionStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const ts = parseInt(stored, 10);
        if (!isNaN(ts) && ts > 0) return ts;
      }
    } catch { /* ignore */ }
    // Before monitoring is initialized (e.g. during login or first load),
    // treat as "just now" to avoid false logouts from the race condition.
    // After monitoring is running, empty storage means expired → force logout.
    return this.monitoringInitialized ? 0 : Date.now();
  }

  private setLastActivity(time: number): void {
    try {
      sessionStorage.setItem(this.STORAGE_KEY, String(time));
    } catch { /* ignore */ }
  }

  /** How many ms the user has been idle. */
  private getIdleMs(): number {
    return Date.now() - this.getLastActivity();
  }

  private check(): void {
    if (this.loggingOut) return;
    if (!this.auth.isLoggedIn()) return;

    const idle = this.getIdleMs();

    if (idle >= this.idleTimeoutMs) {
      this.doLogout();
      return;
    }

    if (!this.warningShown && idle >= this.idleTimeoutMs - this.WARN_BEFORE_MS) {
      this.warningShown = true;
      const secsLeft = Math.round((this.idleTimeoutMs - idle) / 1000);
      this.zone.run(() =>
        this.toast.warning(`You will be logged out in ~${secsLeft}s due to inactivity.`),
      );
    }
  }

  /**
   * Nuclear logout: clear everything and hard-redirect.
   */
  private doLogout(): void {
    if (this.loggingOut) return;
    this.loggingOut = true;
    this.stop();

    try { sessionStorage.removeItem(this.STORAGE_KEY); } catch {}
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');

    // Hard redirect — bypasses Angular router entirely
    const isEss = window.location.pathname.includes('/ess/');
    window.location.href = isEss ? '/ess/login' : '/login';
  }
}
