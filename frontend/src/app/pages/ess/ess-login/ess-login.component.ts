import { Component, ChangeDetectorRef, HostListener, ViewEncapsulation, OnInit } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { finalize, timeout } from 'rxjs/operators';
import { AuthService } from '../../../core/auth.service';

@Component({
  standalone: true,
  imports: [FormsModule],
  encapsulation: ViewEncapsulation.ShadowDom,
  selector: 'app-ess-login',
  template: `
    <div class="page">
      <div class="screen">

        <!-- ═══════ LEFT: BRAND PANEL ═══════ -->
        <aside class="left">
          <img class="brand-logo" src="assets/images/statco-wordmark-white.png" alt="StatCo Solutions" />

          <h1>ESS</h1>
          <h3>Employee Self Service</h3>
          <div class="line"></div>

          <div class="features">
            <div>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/></svg>
              </span>
              <p>Everything You Need,<br/>In One Place</p>
            </div>
            <div>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></svg>
              </span>
              <p>Secure &amp; Reliable<br/>Access</p>
            </div>
            <div>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V9"/><path d="M10 19v-6"/><path d="M16 19V5"/><path d="M3 19h18"/></svg>
              </span>
              <p>Payroll, Leave &amp;<br/>Compliance at Your Fingertips</p>
            </div>
          </div>
          <p class="brand-footer">&copy; {{ currentYear }} StatCo Solutions</p>
        </aside>

        <!-- ═══════ RIGHT: LOGIN PANEL ═══════ -->
        <section class="right">
          <nav class="language-switch" aria-label="Language selection">
            <span class="language" aria-label="Current language: English">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>
              <span>English</span>
            </span>
            <button type="button" class="lang-link" lang="te" disabled
                    aria-label="Telugu translation is not yet available" title="Telugu translation is not yet available">తెలుగు</button>
            <span class="lang-separator" aria-hidden="true">|</span>
            <button type="button" class="lang-link" lang="hi" disabled
                    aria-label="Hindi translation is not yet available" title="Hindi translation is not yet available">हिन्दी</button>
          </nav>

          <div class="shield" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12 10 17 19 7"/></svg>
          </div>

          <div class="form-area" [class.card-shake]="errorMsg">
            <h2>Welcome Back!</h2>
            <p class="caption">Sign in to access your Employee Self Service account</p>
            <div class="blue-line"></div>

            <form (ngSubmit)="submit()" autocomplete="on" class="frm">

              <!-- Company code (only when not locked via /:companyCode/login) -->
              @if (!companyCodeLocked) {
<div class="field">
                <label for="ess-company-code">Company Code</label>
                <div class="input" [class.input-err]="submitted && !companyCode.trim()">
                  <span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01"/></svg>
                  </span>
                  <input id="ess-company-code" type="text" [(ngModel)]="companyCode" name="companyCode"
                         placeholder="Enter company code" autocomplete="organization" />
                </div>
                @if (submitted && !companyCode.trim()) {
<span class="field-err">Company code is required.</span>
}
              </div>
}

              @if (companyCodeLocked) {
<div class="locked-chip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/></svg>
                {{ companyCode }}
              </div>
}

              <!-- Username / Email -->
              <div class="field">
                <label for="ess-email">Email / Employee ID</label>
                <div class="input" [class.input-err]="submitted && !email.trim()">
                  <span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/></svg>
                  </span>
                  <input id="ess-email" type="email" [(ngModel)]="email" name="email"
                         placeholder="Enter email or employee ID" autocomplete="username" />
                </div>
                @if (submitted && !email.trim()) {
<span class="field-err">Enter your username or employee ID.</span>
}
              </div>

              <!-- Password -->
              <div class="field">
                <label for="ess-password">Password</label>
                <div class="input" [class.input-err]="submitted && !password">
                  <span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
                  </span>
                  <input id="ess-password" [type]="showPassword ? 'text' : 'password'"
                         [(ngModel)]="password" name="password"
                         placeholder="Password" autocomplete="current-password"
                         (keydown)="checkCapsLock($event)" />
                  <button type="button" class="pw-toggle" (click)="showPassword=!showPassword" tabindex="-1" aria-label="Show or hide password">
                    @if (!showPassword) {
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
}
                    @if (showPassword) {
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
}
                  </button>
                </div>
                @if (submitted && !password) {
<span class="field-err">Password is required.</span>
}
                @if (capsLockOn) {
<span class="caps-note">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Caps Lock is on
                </span>
}
              </div>

              <!-- Remember + Forgot -->
              <div class="row">
                <label class="remember">
                  <input type="checkbox" [(ngModel)]="rememberMe" name="remember" />
                  <span>Remember me</span>
                </label>
                <a class="forgot" (click)="goToForgotPassword()" href="javascript:void(0)">Forgot Password?</a>
              </div>

              <!-- Error banner -->
              @if (errorMsg) {
<div class="err-banner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                {{ errorMsg }}
              </div>
}

              <!-- Login button -->
              <button class="login" type="submit" [disabled]="isLoading">
                @if (!isLoading) {
<span class="btn-text">Login</span>
}
                @if (isLoading) {
<span class="btn-text"><span class="spinner"></span> Signing in&hellip;</span>
}
                @if (!isLoading) {
<span class="arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>
                </span>
}
              </button>

            <div class="or">
              <i></i><p>or</p><i></i>
            </div>

            <button type="button" class="bio" disabled aria-describedby="biometric-status">
                <span aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11v3a2 2 0 002 2"/><path d="M5.5 9.5A8 8 0 0112 6a8 8 0 016.5 3.5"/><path d="M3 13a10 10 0 014-7.5"/><path d="M21 13a10 10 0 00-4-7.5"/><path d="M7 14a5 5 0 015-5 5 5 0 015 5v2"/><path d="M9 19a3 3 0 003-3"/><path d="M15 21a8 8 0 002-5"/></svg>
                </span>
                Login with Biometrics
                <span class="coming-soon" id="biometric-status">Coming Soon</span>
              </button>

              <div class="support-strip">
                <strong>Need help?</strong>
                <a href="tel:+919000607839">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.62 2.61a2 2 0 0 1-.45 2.11L8 9.72a16 16 0 0 0 6.28 6.28l1.28-1.28a2 2 0 0 1 2.11-.45c.84.29 1.71.5 2.61.62A2 2 0 0 1 22 16.92z"/></svg>
                  +91 9000607839
                </a>
                <a href="mailto:it_admin@statcosol.com">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                  it_admin@statcosol.com
                </a>
              </div>
            </form>

            <div class="help">
              <div class="help-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-2a9 9 0 0118 0v2"/><rect x="3" y="14" width="5" height="6" rx="1.5"/><rect x="16" y="14" width="5" height="6" rx="1.5"/><path d="M16 19a4 4 0 01-4 3"/></svg>
              </div>
              <div class="help-text">
                <h4>Need help?</h4>
                <p>Contact <a href="mailto:support@statcosol.com"><b>IT Support</b></a> for assistance</p>
              </div>
              <strong aria-hidden="true">›</strong>
            </div>

            <p class="secure">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><polyline points="9 12 11.5 14.5 16 10"/></svg>
              Your data is protected
            </p>
          </div>
        </section>

      </div>
    </div>
  `,
  styleUrl: './ess-login.component.scss',
})
export class EssLoginComponent implements OnInit {
  companyCode = '';
  email = '';
  password = '';
  showPassword = false;
  isLoading = false;
  errorMsg = '';
  submitted = false;
  capsLockOn = false;
  companyCodeLocked = false;
  currentYear = new Date().getFullYear();
  rememberMe = true;

  private static readonly REMEMBERED_EMAIL_KEY = 'ess_remembered_email';
  private static readonly REMEMBERED_CODE_KEY = 'ess_remembered_company_code';

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {
    if (this.auth.isLoggedIn() && this.auth.getRoleCode() === 'EMPLOYEE') {
      this.router.navigateByUrl('/ess/dashboard');
    }
    const code = this.route.snapshot.paramMap.get('companyCode');
    if (code) {
      this.companyCode = code.toUpperCase();
      this.companyCodeLocked = true;
    }
    // Restore remembered values
    try {
      const remEmail = localStorage.getItem(EssLoginComponent.REMEMBERED_EMAIL_KEY);
      if (remEmail) { this.email = remEmail; this.rememberMe = true; }
      if (!this.companyCodeLocked) {
        const remCode = localStorage.getItem(EssLoginComponent.REMEMBERED_CODE_KEY);
        if (remCode) { this.companyCode = remCode; }
      }
    } catch { /* localStorage unavailable */ }
  }

  ngOnInit(): void {
    // Replace current history entry so Back doesn't return to a pre-login page.
    if (!this.auth.isLoggedIn()) {
      window.history.replaceState(null, '', window.location.href);
    }
  }

  checkCapsLock(e: KeyboardEvent): void {
    this.capsLockOn = e.getModifierState?.('CapsLock') ?? false;
  }

  @HostListener('window:keyup', ['$event'])
  clearCaps(e: KeyboardEvent): void {
    this.capsLockOn = e.getModifierState?.('CapsLock') ?? false;
  }

  goToForgotPassword(): void {
    this.router.navigate(['/ess/forgot-password']);
  }

  loginWithBiometrics(): void {
    // Placeholder for native biometric integration via Android JavascriptInterface.
    const bridge = (window as unknown as { AndroidBiometric?: { authenticate: () => void } }).AndroidBiometric;
    if (bridge && typeof bridge.authenticate === 'function') {
      try { bridge.authenticate(); return; } catch { /* fall through */ }
    }
    this.errorMsg = 'Biometric login is coming soon. Please use your password for now.';
    this.cdr.detectChanges();
  }

  submit(): void {
    this.submitted = true;
    this.errorMsg = '';

    const code = this.companyCode.trim();
    const email = this.email.trim();

    if (!code || !email || !this.password) {
      this.errorMsg = 'All fields are required';
      return;
    }

    this.isLoading = true;

    this.auth.essLogin(code, email, this.password).pipe(
      timeout(10000),
      finalize(() => { this.isLoading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
        this.isLoading = false;
        // Verify the authenticated user actually has the EMPLOYEE role
        const role = this.auth.getRoleCode();
        if (role !== 'EMPLOYEE') {
          this.auth.logoutOnce('wrong role for ESS');
          this.errorMsg = 'This login is for employees only. Please use the main login page.';
          this.cdr.detectChanges();
          return;
        }
        // Persist or clear remembered values based on checkbox
        try {
          if (this.rememberMe) {
            localStorage.setItem(EssLoginComponent.REMEMBERED_EMAIL_KEY, email);
            if (!this.companyCodeLocked) {
              localStorage.setItem(EssLoginComponent.REMEMBERED_CODE_KEY, code);
            }
          } else {
            localStorage.removeItem(EssLoginComponent.REMEMBERED_EMAIL_KEY);
            localStorage.removeItem(EssLoginComponent.REMEMBERED_CODE_KEY);
          }
        } catch { /* ignore */ }
        this.router.navigateByUrl('/ess/dashboard');
      },
      error: (e) => {
        this.isLoading = false;
        if (e?.status === 401 || e?.status === 403) {
          this.errorMsg = e?.error?.message || 'Invalid company code, email, or password';
        } else {
          this.errorMsg = e?.error?.message || 'Login failed. Please try again.';
        }
        this.cdr.detectChanges();
      },
    });
  }
}
