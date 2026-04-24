import { Component, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { AuthService } from '../../../core/auth.service';

type Step = 'email' | 'sent';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  encapsulation: ViewEncapsulation.ShadowDom,
  selector: 'app-ess-forgot-password',
  template: `
    <div class="page">
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>

      <div class="layout">
        <div class="card-col">
          <div class="card">
            <!-- Logo + Heading -->
            <div class="logo-row">
              <img class="logo-img" src="assets/images/statco-logo.svg" alt="StatCo Solutions" />
              <div class="logo-text">
                <h1 class="heading" *ngIf="step === 'email'">Forgot Password</h1>
                <h1 class="heading" *ngIf="step === 'sent'">Check Your Email</h1>
                <p class="sub-heading" *ngIf="step === 'email'">Enter your email to receive a password reset link</p>
                <p class="sub-heading" *ngIf="step === 'sent'">We've sent a reset link to your email</p>
              </div>
            </div>

            <!-- Error -->
            <div class="err-banner" *ngIf="error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              {{ error }}
            </div>

            <!-- Step 1: Email Form -->
            <form *ngIf="step === 'email'" (ngSubmit)="submitEmail()" class="frm">
              <div class="field">
                <label class="lbl" for="reset-email">Email Address</label>
                <div class="input-wrap">
                  <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>
                  <input id="reset-email" type="email" [(ngModel)]="email" name="email"
                         [disabled]="isLoading" autocomplete="email"
                         placeholder="you&#64;company.com" required />
                </div>
              </div>

              <button class="btn-primary" type="submit" [disabled]="isLoading">
                <ng-container *ngIf="!isLoading">Send Reset Link</ng-container>
                <span *ngIf="isLoading" class="ld-row"><span class="spinner"></span> Sending&hellip;</span>
              </button>
            </form>

            <!-- Step 2: Email Sent -->
            <div *ngIf="step === 'sent'" class="sent-section">
              <div class="sent-icon">
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                  <circle cx="28" cy="28" r="26" stroke="#38bdf8" stroke-width="2.5"/>
                  <rect x="14" y="19" width="28" height="18" rx="3" stroke="#0e3a6e" stroke-width="2"/>
                  <path d="M14 21l14 9 14-9" stroke="#0e3a6e" stroke-width="2" stroke-linejoin="round"/>
                </svg>
              </div>
              <p class="sent-text">
                If an account exists for <strong>{{ email }}</strong>, you'll receive a password reset link shortly.
                Check your inbox and spam folder.
              </p>
              <p class="sent-hint">The link will expire in 1 hour.</p>

              <div class="resend-row">
                <span>Didn't receive the email?</span>
                <button type="button" class="accent-btn" (click)="resendEmail()" [disabled]="isLoading">Resend</button>
              </div>

              <button class="btn-primary" type="button" (click)="goToLogin()" style="margin-top: 20px;">
                Back to Sign In
              </button>
            </div>

            <!-- Back to login -->
            <div class="back-row" *ngIf="step === 'email'">
              <button type="button" class="back-link" (click)="goToLogin()">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Back to Sign In
              </button>
            </div>

            <!-- Footer -->
            <div class="card-footer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <span>Your session is encrypted and secured.</span>
            </div>
          </div>

          <div class="below-card">
            <span>&copy; {{ currentYear }} StatCo Solutions</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      color: #2d2d2d;
      box-sizing: border-box;
    }
    *, *::before, *::after { box-sizing: inherit; margin: 0; padding: 0; }

    .page {
      min-height: 100vh;
      background: linear-gradient(145deg, #e8f4fd 0%, #d0e6f8 40%, #b8d8f0 100%);
      position: relative;
      overflow: hidden;
      display: grid;
      place-items: center;
    }

    .orb {
      position: absolute; border-radius: 50%; pointer-events: none;
      background: radial-gradient(circle, rgba(56,189,248,.20), transparent 70%);
    }
    .orb-1 { width: 360px; height: 360px; top: -80px; right: 10%; animation: float 7s ease-in-out infinite; }
    .orb-2 { width: 200px; height: 200px; bottom: 8%; left: 5%; background: radial-gradient(circle, rgba(255,255,255,.40), transparent 70%); animation: float 9s ease-in-out infinite reverse; }
    .orb-3 { width: 120px; height: 120px; top: 55%; right: 4%; background: radial-gradient(circle, rgba(14,58,110,.12), transparent 70%); animation: float 6s ease-in-out infinite 1s; }

    .layout {
      position: relative; z-index: 1;
      padding: 32px 24px;
      width: 100%;
      max-width: 500px;
    }

    .card-col { display: flex; flex-direction: column; align-items: center; }

    .card {
      width: 100%;
      background: rgba(255,255,255,.82);
      backdrop-filter: blur(20px) saturate(1.4);
      -webkit-backdrop-filter: blur(20px) saturate(1.4);
      border-radius: 28px;
      padding: 40px 36px 32px;
      box-shadow: 0 20px 60px rgba(14,58,110,.10), 0 1px 3px rgba(0,0,0,.06);
      border: 1px solid rgba(255,255,255,.6);
      animation: slideUp .5s cubic-bezier(.22,1,.36,1);
    }

    .logo-row {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 28px;
    }
    .logo-img { height: 48px; width: auto; flex-shrink: 0; }
    .logo-text { display: flex; flex-direction: column; }

    .heading {
      font-size: 26px; font-weight: 900; color: #1a1a1a;
      margin: 0; line-height: 1.2;
    }
    .sub-heading {
      margin: 3px 0 0; font-size: 13px; color: #777; font-weight: 400;
    }

    .frm { margin-top: 8px; }

    .field { margin-bottom: 18px; }
    .lbl {
      display: block;
      font-size: 13px; font-weight: 600; color: #555;
      margin: 0 0 7px;
    }

    .input-wrap {
      display: flex; align-items: center;
      height: 50px;
      border: 1.5px solid #c8d8e8;
      border-radius: 14px;
      background: #fff;
      padding: 0 14px;
      transition: border-color .2s, box-shadow .2s;
    }
    .input-wrap:focus-within {
      border-color: #38bdf8;
      box-shadow: 0 0 0 4px rgba(56,189,248,.14);
    }

    .field-icon {
      width: 18px; height: 18px; flex-shrink: 0;
      color: #8ba8c4; margin-right: 10px;
    }

    .input-wrap input {
      flex: 1; border: 0; outline: 0; background: none;
      font: inherit; font-size: 14px; color: #1a1a1a;
      height: 100%; padding: 0;
    }
    .input-wrap input::placeholder { color: #bbb; }
    .input-wrap input:disabled { opacity: .55; }

    .err-banner {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 14px; border-radius: 12px;
      background: #fff5f5; border: 1px solid #fed7d7;
      color: #9b2c2c; font-size: 13px; font-weight: 500;
      margin-bottom: 16px;
    }
    .err-banner svg { width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px; color: #e53e3e; }

    .btn-primary {
      width: 100%; border: 0;
      background: linear-gradient(135deg, #0a1628 0%, #1e40af 100%);
      color: #fff;
      font: inherit; font-weight: 800; font-size: 15px;
      padding: 14px 16px; border-radius: 14px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 28px rgba(14,58,110,.30);
      transition: transform .2s, box-shadow .2s;
    }
    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 14px 40px rgba(14,58,110,.42);
      background: linear-gradient(135deg, #0e2040 0%, #2563eb 100%);
    }
    .btn-primary:active:not(:disabled) { transform: translateY(0); }
    .btn-primary:disabled { opacity: .55; cursor: not-allowed; transform: none; box-shadow: none; }

    .ld-row { display: inline-flex; align-items: center; gap: 8px; }
    .spinner {
      width: 16px; height: 16px; display: inline-block;
      border: 2px solid rgba(255,255,255,.35);
      border-top-color: #fff; border-radius: 50%;
      animation: spin .6s linear infinite;
    }

    .sent-section { text-align: center; }
    .sent-icon { margin-bottom: 16px; }
    .sent-icon svg { animation: scaleIn .4s ease both; }
    .sent-text {
      color: #555; font-size: 14px; line-height: 1.6; margin-bottom: 8px;
    }
    .sent-hint {
      color: #999; font-size: 12px; margin-bottom: 16px;
    }

    .resend-row {
      display: flex; justify-content: center; align-items: center; gap: 6px;
      font-size: 13px; color: #777;
    }
    .accent-btn {
      border: 0; background: none; color: #0e3a6e; font-weight: 600;
      font-size: 13px; cursor: pointer; padding: 0;
    }
    .accent-btn:hover { text-decoration: underline; }
    .accent-btn:disabled { opacity: .5; cursor: not-allowed; }

    .back-row {
      display: flex; justify-content: center; margin-top: 20px;
    }
    .back-link {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 13px; color: #0e3a6e; font-weight: 600;
      border: 0; background: none; cursor: pointer;
      text-decoration: none;
    }
    .back-link:hover { text-decoration: underline; }

    .card-footer {
      display: flex; align-items: center; gap: 6px;
      margin-top: 22px; padding-top: 16px;
      border-top: 1px solid rgba(0,0,0,.06);
      font-size: 12px; color: #999;
    }
    .card-footer svg { width: 14px; height: 14px; color: #bbb; }

    .below-card {
      margin-top: 16px; font-size: 12px; color: #7a93a8;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes float {
      0%,100% { transform: translateY(0); }
      50% { transform: translateY(-14px); }
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(.6); }
      to   { opacity: 1; transform: scale(1); }
    }

    @media (max-width: 540px) {
      .layout { padding: 20px 14px; }
      .card { padding: 28px 22px 24px; border-radius: 22px; }
      .heading { font-size: 22px; }
    }
  `],
})
export class EssForgotPasswordComponent implements OnDestroy {
  step: Step = 'email';
  email = '';
  isLoading = false;
  error = '';
  currentYear = new Date().getFullYear();

  private destroy$ = new Subject<void>();

  constructor(private auth: AuthService, private router: Router) {}

  submitEmail(): void {
    this.error = '';
    if (!this.email.trim()) {
      this.error = 'Please enter your email address';
      return;
    }

    this.isLoading = true;
    this.auth
      .forgotPassword(this.email.trim())
      .pipe(takeUntil(this.destroy$), timeout(15000), finalize(() => (this.isLoading = false)))
      .subscribe({
        next: () => { this.step = 'sent'; },
        error: (e) => {
          this.error = e?.error?.message || 'Failed to send reset email. Please try again.';
        },
      });
  }

  resendEmail(): void {
    this.step = 'email';
    this.submitEmail();
  }

  goToLogin(): void {
    this.router.navigate(['/ess/login']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
