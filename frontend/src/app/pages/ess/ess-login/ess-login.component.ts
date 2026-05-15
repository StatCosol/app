import { Component, ChangeDetectorRef, HostListener, ViewEncapsulation, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { finalize, timeout } from 'rxjs/operators';
import { AuthService } from '../../../core/auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  encapsulation: ViewEncapsulation.ShadowDom,
  selector: 'app-ess-login',
  template: `
    <div class="page">
      <div class="layout">

        <!-- ═══════ LEFT: BRAND PANEL ═══════ -->
        <aside class="brand-panel">
          <div class="brand-bg"></div>
          <div class="brand-overlay"></div>

          <div class="brand-inner">
            <div class="brand-logo">
              <svg viewBox="0 0 64 64" fill="none" stroke="#1d4ed8" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <!-- arch -->
                <path d="M14 30 C 14 16, 50 16, 50 30" />
                <!-- left person -->
                <circle cx="22" cy="36" r="4.2" fill="#1d4ed8" stroke="none"/>
                <path d="M14 50 C 14 44, 18 41, 22 41 C 26 41, 30 44, 30 50 Z" fill="#1d4ed8" stroke="none"/>
                <!-- right person -->
                <circle cx="42" cy="36" r="4.2" fill="#1d4ed8" stroke="none"/>
                <path d="M34 50 C 34 44, 38 41, 42 41 C 46 41, 50 44, 50 50 Z" fill="#1d4ed8" stroke="none"/>
                <!-- centre person (slightly forward) -->
                <circle cx="32" cy="33" r="4.6" fill="#1d4ed8" stroke="none"/>
                <path d="M23 50 C 23 43, 27 39, 32 39 C 37 39, 41 43, 41 50 Z" fill="#1d4ed8" stroke="none"/>
              </svg>
            </div>

            <h1 class="brand-name">ESS</h1>
            <p class="brand-tag">Employee Self Service</p>
            <span class="brand-underline" aria-hidden="true"></span>

            <ul class="brand-features">
              <li>
                <span class="feat-ico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/></svg>
                </span>
                <span class="feat-text">Your Information<br/>At Your Fingertips</span>
              </li>
              <li>
                <span class="feat-ico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><rect x="9.5" y="11" width="5" height="4" rx="1"/><path d="M10.5 11V9.5a1.5 1.5 0 013 0V11"/></svg>
                </span>
                <span class="feat-text">Secure. Reliable.<br/>Always With You.</span>
              </li>
              <li>
                <span class="feat-ico">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V9"/><path d="M10 19v-6"/><path d="M16 19V5"/><path d="M3 19h18"/></svg>
                </span>
                <span class="feat-text">Empowering<br/>Employees</span>
              </li>
            </ul>
          </div>
        </aside>

        <!-- ═══════ RIGHT: LOGIN CARD ═══════ -->
        <section class="login-panel">
          <div class="login-card" [class.card-shake]="errorMsg">

            <div class="lang-row">
              <button type="button" class="lang-btn" aria-label="Language">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>
                <span>English</span>
                <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>

            <div class="welcome-row">
              <div class="welcome-text">
                <h2 class="welcome-title">Welcome Back!</h2>
                <p class="welcome-sub">Log in to access your account</p>
                <span class="welcome-underline" aria-hidden="true"></span>
              </div>
              <div class="welcome-shield" aria-hidden="true">
                <svg viewBox="0 0 64 64" fill="none">
                  <circle cx="32" cy="32" r="30" fill="none" stroke="#dbeafe" stroke-width="1" stroke-dasharray="2 3"/>
                  <path d="M32 10 L48 16 V32 C48 42 40 49 32 52 C24 49 16 42 16 32 V16 Z"
                        fill="url(#shieldGrad)" stroke="#1d4ed8" stroke-width="1"/>
                  <polyline points="24,32 30,38 42,26" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
                  <defs>
                    <linearGradient id="shieldGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#3b82f6"/>
                      <stop offset="100%" stop-color="#1e3a8a"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            <form (ngSubmit)="submit()" autocomplete="on" class="frm">

              <!-- Company code (only when not locked via /:companyCode/login) -->
              <div class="field" *ngIf="!companyCodeLocked">
                <div class="input-wrap" [class.input-err]="submitted && !companyCode.trim()">
                  <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01"/></svg>
                  <input id="ess-company-code" type="text" [(ngModel)]="companyCode" name="companyCode"
                         placeholder="Company Code" autocomplete="organization" />
                </div>
                <span class="field-err" *ngIf="submitted && !companyCode.trim()">Company code is required.</span>
              </div>

              <div class="locked-chip" *ngIf="companyCodeLocked">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/></svg>
                {{ companyCode }}
              </div>

              <!-- Username / Email -->
              <div class="field">
                <div class="input-wrap" [class.input-err]="submitted && !email.trim()">
                  <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/></svg>
                  <input id="ess-email" type="email" [(ngModel)]="email" name="email"
                         placeholder="Username / Employee ID" autocomplete="username" />
                </div>
                <span class="field-err" *ngIf="submitted && !email.trim()">Enter your username or employee ID.</span>
              </div>

              <!-- Password -->
              <div class="field">
                <div class="input-wrap" [class.input-err]="submitted && !password">
                  <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
                  <input id="ess-password" [type]="showPassword ? 'text' : 'password'"
                         [(ngModel)]="password" name="password"
                         placeholder="Password" autocomplete="current-password"
                         (keydown)="checkCapsLock($event)" />
                  <button type="button" class="pw-toggle" (click)="showPassword=!showPassword" tabindex="-1" aria-label="Show or hide password">
                    <svg *ngIf="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <svg *ngIf="showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  </button>
                </div>
                <span class="field-err" *ngIf="submitted && !password">Password is required.</span>
                <span class="caps-note" *ngIf="capsLockOn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Caps Lock is on
                </span>
              </div>

              <!-- Remember + Forgot -->
              <div class="row-between">
                <label class="remember">
                  <input type="checkbox" [(ngModel)]="rememberMe" name="remember" />
                  <span class="check-box" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12 10 17 19 7"/></svg>
                  </span>
                  <span class="check-label">Remember me</span>
                </label>
                <a class="forgot-link" (click)="goToForgotPassword()" href="javascript:void(0)">Forgot Password?</a>
              </div>

              <!-- Error banner -->
              <div class="err-banner" *ngIf="errorMsg">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                {{ errorMsg }}
              </div>

              <!-- Login button -->
              <button class="btn-login" type="submit" [disabled]="isLoading">
                <span class="btn-login-text" *ngIf="!isLoading">Login</span>
                <span class="btn-login-text" *ngIf="isLoading"><span class="spinner"></span> Signing in&hellip;</span>
                <svg *ngIf="!isLoading" class="btn-login-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>
              </button>

              <!-- "or" divider -->
              <div class="divider"><span>or</span></div>

              <!-- Biometrics -->
              <button type="button" class="btn-biometric" (click)="loginWithBiometrics()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11v3a2 2 0 002 2"/><path d="M5.5 9.5A8 8 0 0112 6a8 8 0 016.5 3.5"/><path d="M3 13a10 10 0 014-7.5"/><path d="M21 13a10 10 0 00-4-7.5"/><path d="M7 14a5 5 0 015-5 5 5 0 015 5v2"/><path d="M9 19a3 3 0 003-3"/><path d="M15 21a8 8 0 002-5"/></svg>
                <span>Login with Biometrics</span>
              </button>
            </form>

            <!-- Need help card -->
            <div class="help-card">
              <span class="help-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-2a9 9 0 0118 0v2"/><rect x="3" y="14" width="5" height="6" rx="1.5"/><rect x="16" y="14" width="5" height="6" rx="1.5"/><path d="M16 19a4 4 0 01-4 3"/></svg>
              </span>
              <div class="help-text">
                <div class="help-title">Need help?</div>
                <div class="help-sub">Contact <a href="mailto:support@statcosol.com">IT Support</a> for assistance</div>
              </div>
              <svg class="help-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
            </div>

            <!-- Protected footer -->
            <div class="protected">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><polyline points="9 12 11.5 14.5 16 10"/></svg>
              <span>Your data is protected</span>
            </div>
          </div>
        </section>

      </div>
    </div>
  `,
  styles: [`
    /* ═══ HOST ═══════════════════════════════ */
    :host {
      display: block;
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      color: #0f172a;
      box-sizing: border-box;
    }
    *, *::before, *::after { box-sizing: inherit; margin: 0; padding: 0; }

    /* ═══ PAGE / LAYOUT ═════════════════════ */
    .page {
      min-height: 100vh;
      background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%);
      padding: 24px;
      display: flex; align-items: center; justify-content: center;
    }
    .layout {
      width: 100%; max-width: 1100px;
      display: grid;
      grid-template-columns: minmax(320px, 1fr) minmax(360px, 1.05fr);
      background: #ffffff;
      border-radius: 32px;
      overflow: hidden;
      box-shadow: 0 30px 80px rgba(8, 15, 50, .35);
      min-height: 720px;
    }

    /* ═══ LEFT: BRAND PANEL ═════════════════ */
    .brand-panel {
      position: relative;
      color: #fff;
      overflow: hidden;
      isolation: isolate;
      padding: 56px 40px 48px;
      display: flex; flex-direction: column; justify-content: space-between;
    }
    .brand-bg {
      position: absolute; inset: 0; z-index: -2;
      background:
        linear-gradient(135deg, #1e40af 0%, #1d4ed8 45%, #2563eb 100%);
    }
    .brand-overlay {
      position: absolute; inset: 0; z-index: -1;
      background:
        radial-gradient(ellipse at 80% 110%, rgba(15, 23, 42, .55) 0%, transparent 60%),
        radial-gradient(circle at 12% 18%, rgba(255,255,255,.10) 0%, transparent 35%);
    }
    /* faint dotted texture, top-left */
    .brand-panel::before {
      content: '';
      position: absolute; left: 28px; top: 42%;
      width: 64px; height: 64px;
      background-image: radial-gradient(rgba(255,255,255,.35) 1.2px, transparent 1.4px);
      background-size: 8px 8px;
      opacity: .55;
      pointer-events: none;
    }
    /* faint city silhouette at bottom */
    .brand-panel::after {
      content: '';
      position: absolute; left: 0; right: 0; bottom: 0; height: 38%;
      background:
        linear-gradient(to top, rgba(8, 15, 50, .55), transparent 90%),
        url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 200' preserveAspectRatio='none'><g fill='%230b1f4d' opacity='0.55'><rect x='10' y='90' width='40' height='110'/><rect x='55' y='60' width='28' height='140'/><rect x='90' y='110' width='35' height='90'/><rect x='130' y='40' width='22' height='160'/><rect x='160' y='80' width='40' height='120'/><rect x='205' y='20' width='30' height='180'/><rect x='240' y='70' width='35' height='130'/><rect x='280' y='50' width='25' height='150'/><rect x='310' y='95' width='42' height='105'/><rect x='358' y='30' width='28' height='170'/><rect x='392' y='75' width='35' height='125'/><rect x='432' y='55' width='25' height='145'/><rect x='462' y='100' width='40' height='100'/><rect x='508' y='40' width='28' height='160'/><rect x='542' y='85' width='38' height='115'/></g></svg>") center bottom / 100% 100% no-repeat;
      pointer-events: none;
      z-index: -1;
    }

    .brand-inner {
      position: relative; z-index: 1;
      display: flex; flex-direction: column;
      gap: 0;
    }
    .brand-logo {
      width: 116px; height: 116px;
      background: #fff;
      border-radius: 22px;
      display: grid; place-items: center;
      box-shadow: 0 18px 40px rgba(8, 15, 50, .25);
      margin-bottom: 18px;
    }
    .brand-logo svg { width: 80px; height: 80px; }
    .brand-name {
      font-size: 56px; font-weight: 900; letter-spacing: -1px;
      line-height: 1;
      margin: 6px 0 4px;
      text-shadow: 0 2px 12px rgba(0,0,0,.18);
    }
    .brand-tag {
      font-size: 17px; font-weight: 500;
      color: rgba(255,255,255,.92);
      letter-spacing: .2px;
      margin-bottom: 10px;
    }
    .brand-underline {
      display: block; width: 64px; height: 3px; border-radius: 2px;
      background: linear-gradient(90deg, #38bdf8, transparent);
      margin-bottom: 36px;
    }

    .brand-features {
      list-style: none; display: flex; flex-direction: column; gap: 22px;
      margin-top: auto;
    }
    .brand-features li {
      display: flex; align-items: center; gap: 14px;
      font-size: 14.5px; font-weight: 500; color: rgba(255,255,255,.96);
      line-height: 1.35;
    }
    .feat-ico {
      flex-shrink: 0;
      width: 40px; height: 40px; border-radius: 50%;
      border: 1.5px solid rgba(255,255,255,.55);
      display: grid; place-items: center;
      color: #fff;
      background: rgba(255,255,255,.06);
    }
    .feat-ico svg { width: 20px; height: 20px; }

    /* ═══ RIGHT: LOGIN PANEL ════════════════ */
    .login-panel {
      position: relative;
      padding: 36px 44px 32px;
      display: flex; flex-direction: column;
      background: #fff;
    }
    .login-card {
      flex: 1;
      display: flex; flex-direction: column;
      animation: slideUp .45s cubic-bezier(.22,1,.36,1);
    }

    /* — Top language row */
    .lang-row {
      display: flex; justify-content: flex-end;
      margin-bottom: 18px;
    }
    .lang-btn {
      display: inline-flex; align-items: center; gap: 6px;
      border: 1px solid #e5e7eb; background: #fff;
      border-radius: 999px;
      padding: 7px 14px;
      font: inherit; font-size: 13px; color: #1e293b; font-weight: 500;
      cursor: pointer; transition: background .15s, border-color .15s;
    }
    .lang-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
    .lang-btn svg { width: 16px; height: 16px; color: #64748b; }
    .lang-btn .caret { width: 14px; height: 14px; }

    /* — Welcome header */
    .welcome-row {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 16px;
      margin-bottom: 28px;
    }
    .welcome-text { flex: 1; }
    .welcome-title {
      font-size: 30px; font-weight: 800; color: #0f172a;
      letter-spacing: -.5px;
      margin: 0 0 6px;
      line-height: 1.15;
    }
    .welcome-sub {
      font-size: 14.5px; color: #64748b; font-weight: 400;
      margin: 0;
    }
    .welcome-underline {
      display: block; margin-top: 8px;
      width: 56px; height: 3px; border-radius: 2px;
      background: linear-gradient(90deg, #1d4ed8, #38bdf8);
    }
    .welcome-shield {
      flex-shrink: 0; width: 84px; height: 84px;
      animation: floatY 4s ease-in-out infinite;
    }
    .welcome-shield svg { width: 100%; height: 100%; }

    /* — Form */
    .frm { display: flex; flex-direction: column; gap: 16px; }
    .field { display: flex; flex-direction: column; gap: 4px; }

    .input-wrap {
      display: flex; align-items: center;
      height: 54px;
      border: 1.5px solid #e2e8f0;
      border-radius: 14px;
      background: #f8fafc;
      padding: 0 16px;
      transition: border-color .2s, background .2s, box-shadow .2s;
    }
    .input-wrap:focus-within {
      border-color: #1d4ed8;
      background: #fff;
      box-shadow: 0 0 0 4px rgba(29, 78, 216, .12);
    }
    .input-wrap.input-err {
      border-color: #dc2626;
      background: #fef2f2;
      box-shadow: 0 0 0 4px rgba(220, 38, 38, .08);
    }
    .field-icon {
      width: 20px; height: 20px; flex-shrink: 0;
      color: #94a3b8; margin-right: 12px;
    }
    .input-wrap input {
      flex: 1; border: 0; outline: 0; background: none;
      font: inherit; font-size: 15px; color: #0f172a;
      height: 100%; padding: 0;
      -webkit-appearance: none; appearance: none;
    }
    .input-wrap input::placeholder { color: #94a3b8; }
    .pw-toggle {
      border: 0; background: transparent; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      padding: 4px; border-radius: 6px; color: #94a3b8;
      transition: color .15s, background .15s;
    }
    .pw-toggle svg { width: 20px; height: 20px; }
    .pw-toggle:hover { color: #1d4ed8; background: rgba(29,78,216,.08); }

    .field-err { font-size: 12.5px; color: #dc2626; font-weight: 500; padding-left: 4px; }
    .caps-note {
      display: flex; align-items: center; gap: 4px;
      font-size: 12.5px; color: #d97706; font-weight: 500; padding-left: 4px;
    }
    .caps-note svg { width: 14px; height: 14px; }

    .locked-chip {
      align-self: flex-start;
      display: inline-flex; align-items: center; gap: 8px;
      background: #eff6ff; border: 1px solid #bfdbfe;
      padding: 8px 14px; border-radius: 999px;
      font-size: 13px; font-weight: 700; color: #1d4ed8;
      text-transform: uppercase; letter-spacing: .5px;
    }
    .locked-chip svg { width: 14px; height: 14px; }

    /* — Remember + Forgot */
    .row-between {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; flex-wrap: wrap;
    }
    .remember {
      display: inline-flex; align-items: center; gap: 10px;
      cursor: pointer; user-select: none;
    }
    .remember input { position: absolute; opacity: 0; width: 0; height: 0; }
    .check-box {
      width: 20px; height: 20px; border-radius: 6px;
      border: 1.8px solid #cbd5e1; background: #fff;
      display: grid; place-items: center;
      color: #fff;
      transition: background .15s, border-color .15s;
    }
    .check-box svg { width: 14px; height: 14px; opacity: 0; transition: opacity .15s; }
    .remember input:checked + .check-box {
      background: #1d4ed8; border-color: #1d4ed8;
    }
    .remember input:checked + .check-box svg { opacity: 1; }
    .remember input:focus-visible + .check-box { box-shadow: 0 0 0 3px rgba(29,78,216,.25); }
    .check-label { font-size: 14px; color: #334155; font-weight: 500; }
    .forgot-link {
      font-size: 13.5px; font-weight: 600; color: #1d4ed8;
      text-decoration: none;
    }
    .forgot-link:hover { text-decoration: underline; }

    /* — Error banner */
    .err-banner {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 14px; border-radius: 12px;
      background: #fef2f2; border: 1px solid #fecaca;
      color: #991b1b; font-size: 13px; font-weight: 500;
    }
    .err-banner svg { width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px; color: #dc2626; }

    /* — Login button */
    .btn-login {
      position: relative;
      width: 100%; border: 0; cursor: pointer;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: #fff;
      font: inherit; font-weight: 700; font-size: 16px;
      padding: 16px 20px;
      border-radius: 14px;
      display: flex; align-items: center; justify-content: center; gap: 10px;
      box-shadow: 0 10px 28px rgba(29, 78, 216, .35);
      transition: transform .2s, box-shadow .2s, opacity .15s, background .2s;
      margin-top: 4px;
    }
    .btn-login-text { display: inline-flex; align-items: center; gap: 8px; }
    .btn-login-arrow {
      width: 18px; height: 18px;
      transition: transform .2s;
    }
    .btn-login:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 14px 36px rgba(29, 78, 216, .45);
      background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
    }
    .btn-login:hover:not(:disabled) .btn-login-arrow { transform: translateX(4px); }
    .btn-login:active:not(:disabled) { transform: translateY(0); }
    .btn-login:disabled { opacity: .6; cursor: not-allowed; }
    .btn-login:focus-visible { outline: 2px solid #38bdf8; outline-offset: 3px; }

    .spinner {
      width: 16px; height: 16px; display: inline-block;
      border: 2px solid rgba(255,255,255,.35);
      border-top-color: #fff; border-radius: 50%;
      animation: spin .6s linear infinite;
    }

    /* — "or" divider */
    .divider {
      position: relative;
      display: flex; align-items: center; justify-content: center;
      margin: 6px 0;
    }
    .divider::before, .divider::after {
      content: ''; flex: 1; height: 1px; background: #e2e8f0;
    }
    .divider span {
      padding: 0 14px; font-size: 13px; color: #94a3b8; font-weight: 500;
    }

    /* — Biometric button */
    .btn-biometric {
      width: 100%; cursor: pointer;
      background: #fff;
      border: 1.5px solid #e2e8f0;
      color: #1d4ed8;
      font: inherit; font-weight: 600; font-size: 15px;
      padding: 14px 20px;
      border-radius: 14px;
      display: flex; align-items: center; justify-content: center; gap: 10px;
      transition: background .15s, border-color .15s, box-shadow .15s;
    }
    .btn-biometric:hover {
      background: #f8fafc;
      border-color: #1d4ed8;
      box-shadow: 0 4px 14px rgba(29, 78, 216, .12);
    }
    .btn-biometric svg { width: 22px; height: 22px; }

    /* — Help card */
    .help-card {
      margin-top: 22px;
      display: flex; align-items: center; gap: 14px;
      padding: 14px 16px;
      background: #f1f5f9;
      border-radius: 14px;
      cursor: pointer; transition: background .15s;
    }
    .help-card:hover { background: #e2e8f0; }
    .help-ico {
      flex-shrink: 0;
      width: 40px; height: 40px; border-radius: 50%;
      background: #dbeafe;
      display: grid; place-items: center;
      color: #1d4ed8;
    }
    .help-ico svg { width: 20px; height: 20px; }
    .help-text { flex: 1; line-height: 1.3; }
    .help-title { font-size: 14.5px; font-weight: 700; color: #0f172a; }
    .help-sub { font-size: 12.5px; color: #64748b; margin-top: 2px; }
    .help-sub a { color: #1d4ed8; font-weight: 600; text-decoration: none; }
    .help-sub a:hover { text-decoration: underline; }
    .help-chevron { width: 16px; height: 16px; color: #94a3b8; flex-shrink: 0; }

    /* — Protected footer */
    .protected {
      margin-top: 18px;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      font-size: 12.5px; color: #94a3b8;
    }
    .protected svg { width: 14px; height: 14px; color: #1d4ed8; }

    /* shake on error */
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      20% { transform: translateX(-5px); }
      40% { transform: translateX(5px); }
      60% { transform: translateX(-3px); }
      80% { transform: translateX(3px); }
    }
    .card-shake { animation: shake .35s ease-in-out; }

    /* ═══ ANIMATIONS ═════════════════════════ */
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes floatY {
      0%,100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }

    /* ═══ RESPONSIVE ═════════════════════════ */
    /* Tablet — slightly tighter padding */
    @media (max-width: 960px) {
      .layout { min-height: 0; max-width: 720px; }
      .brand-panel { padding: 44px 32px 36px; }
      .login-panel { padding: 32px 36px 28px; }
      .brand-name { font-size: 48px; }
      .welcome-title { font-size: 26px; }
    }

    /* Phone — stack panels: brand on top compact, form below.
       Optimised for the ESS Android WebView wrapper (360-411 dp). */
    @media (max-width: 720px) {
      .page { padding: 0; align-items: stretch; background: #fff; }
      .layout {
        grid-template-columns: 1fr;
        border-radius: 0;
        box-shadow: none;
        min-height: 100vh;
        max-width: 100%;
      }
      .brand-panel {
        padding: 28px 24px 24px;
        min-height: 240px;
      }
      .brand-panel::after { height: 50%; }
      .brand-logo {
        width: 78px; height: 78px; border-radius: 18px;
        margin-bottom: 12px;
      }
      .brand-logo svg { width: 54px; height: 54px; }
      .brand-name { font-size: 38px; }
      .brand-tag { font-size: 14px; }
      .brand-underline { margin-bottom: 18px; }
      .brand-features {
        flex-direction: row; flex-wrap: wrap; gap: 10px 14px;
        margin-top: 14px;
      }
      .brand-features li {
        flex: 1 1 calc(50% - 14px);
        font-size: 12px; gap: 8px; line-height: 1.25;
      }
      .feat-ico { width: 30px; height: 30px; }
      .feat-ico svg { width: 14px; height: 14px; }

      .login-panel { padding: 24px 20px 20px; }
      .lang-row { margin-bottom: 12px; }
      .welcome-row { margin-bottom: 20px; }
      .welcome-title { font-size: 24px; }
      .welcome-shield { width: 60px; height: 60px; }
      .input-wrap { height: 50px; padding: 0 14px; }
      .input-wrap input { font-size: 16px; /* prevents iOS focus-zoom */ }
      .btn-login { padding: 14px 16px; font-size: 15px; }
      .btn-biometric { padding: 12px 16px; font-size: 14px; }
      .help-card { padding: 12px 14px; }
    }

    @media (max-width: 380px) {
      .brand-panel { padding: 24px 18px 20px; min-height: 220px; }
      .brand-name { font-size: 32px; }
      .login-panel { padding: 20px 16px 18px; }
      .brand-features li { flex: 1 1 100%; }
    }
  `],
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
    // Using replaceState (not pushState) avoids adding a session history item
    // without user interaction, which browsers now flag and skip.
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
    // The ESS Portal WebView wrapper can later expose `window.AndroidBiometric.authenticate()`.
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
