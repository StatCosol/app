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
            <button type="button" class="language" aria-label="Current language: English">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>
              <span>English</span>
              <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button type="button" class="lang-link" lang="te">తెలుగు</button>
            <span class="lang-separator" aria-hidden="true">|</span>
            <button type="button" class="lang-link" lang="hi">हिन्दी</button>
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
  styles: [`
    /* ═══ HOST ═══════════════════════════════ */
    :host {
      display: block;
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      color: #11284f;
      box-sizing: border-box;
    }
    *, *::before, *::after { box-sizing: inherit; margin: 0; padding: 0; }

    /* ═══ PAGE ═════════════════════════════════ */
    .page {
      min-height: 100vh;
      width: 100%;
      background:
        linear-gradient(43deg, transparent 0 61%, #ffffff 61.15% 62.05%, transparent 62.2%),
        linear-gradient(43deg, transparent 0 55%, #06335f 55.15%, #087ef5 68%, #06335f 96%),
        #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px clamp(18px, 4vw, 64px);
      overflow-x: hidden;
      position: relative;
      isolation: isolate;
    }
    .page::before {
      content: "";
      position: absolute;
      left: -10vw;
      bottom: -18vh;
      width: min(42vw, 560px);
      height: min(48vh, 440px);
      background:
        linear-gradient(135deg, rgba(15,94,154,.1), rgba(8,126,245,.18)),
        repeating-linear-gradient(135deg, rgba(8,126,245,.16) 0 2px, transparent 2px 24px);
      clip-path: polygon(0 28%, 74% 0, 100% 72%, 20% 100%);
      z-index: -1;
    }
    .page::after {
      content: "";
      position: absolute;
      right: clamp(24px, 5vw, 86px);
      top: clamp(86px, 15vh, 150px);
      width: min(18vw, 260px);
      height: min(38vh, 360px);
      background:
        linear-gradient(135deg, transparent 0 42%, rgba(255,255,255,.72) 42.4% 44.4%, transparent 44.8%),
        repeating-linear-gradient(135deg, rgba(255,255,255,.62) 0 1px, transparent 1px 18px);
      opacity: .68;
      transform: skewX(-8deg);
      z-index: -1;
    }

    /* ═══ SCREEN (white card) ═════════════════ */
    .screen {
      width: 100%;
      max-width: 840px;
      min-height: min(580px, calc(100vh - 36px));
      background: #fff;
      border-radius: 24px;
      display: grid;
      grid-template-columns: 34% 66%;
      overflow: hidden;
      box-shadow: 0 26px 70px rgba(15, 38, 79, .2);
      margin: 0 auto;
      position: relative;
      z-index: 1;
    }

    /* ═══ LEFT BRAND PANEL ═════════════════════ */
    .left {
      color: #fff;
      padding: 36px 30px;
      background:
        linear-gradient(180deg, rgba(15, 94, 154, .96), rgba(7, 37, 84, .98)),
        radial-gradient(circle at 20% 80%, rgba(20, 184, 166, .8), transparent 35%);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .left::after {
      content: "";
      position: absolute;
      bottom: 0; left: 0;
      width: 100%; height: 180px;
      background: linear-gradient(transparent, rgba(0,0,0,.35));
      pointer-events: none;
    }

    .logo-box {
      width: 72px; height: 72px;
      background: #fff;
      border-radius: 22px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 20px 45px rgba(0,0,0,.18);
      position: relative;
      z-index: 2;
    }
    .people-icon { width: 46px; height: 46px; }

    .left h1 {
      font-size: 44px;
      margin: 24px 0 0;
      line-height: 1;
      font-weight: 900;
      letter-spacing: -1.5px;
      position: relative;
      z-index: 2;
    }
    .left h3 {
      font-size: 15px;
      margin: 12px 0 0;
      font-weight: 600;
      position: relative;
      z-index: 2;
    }
    .line {
      width: 74px;
      height: 4px;
      background: #19c8ff;
      margin: 18px 0 22px;
      border-radius: 20px;
      position: relative;
      z-index: 2;
    }

    .features {
      position: relative;
      z-index: 2;
      display: grid;
      gap: 12px;
    }
    .features > div {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .features span {
      flex-shrink: 0;
      width: 34px; height: 34px;
      border: 1px solid rgba(255,255,255,.45);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,.08);
      color: #fff;
    }
    .features span svg { width: 17px; height: 17px; }
    .features p {
      margin: 0;
      font-size: 12px;
      line-height: 1.45;
    }
    .brand-footer {
      margin-top: auto;
      padding-top: 24px;
      position: relative;
      z-index: 2;
      color: rgba(255,255,255,.72);
      font-size: 11px;
      font-weight: 600;
      line-height: 1.4;
    }

    /* ═══ RIGHT LOGIN PANEL ═══════════════════ */
    .right {
      background: #fbfdff;
      border-top-left-radius: 76px;
      padding: 26px 36px;
      position: relative;
      overflow-y: auto;
    }

    .language {
      position: absolute;
      top: 22px; right: 36px;
      background: #fff;
      border: 0;
      border-radius: 35px;
      padding: 8px 14px;
      color: #33405c;
      font-size: 14px;
      box-shadow: 0 10px 30px rgba(0,0,0,.08);
      display: inline-flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      font-family: inherit;
    }
    .language svg { width: 15px; height: 15px; color: #005cff; }
    .language .caret { width: 12px; height: 12px; color: #8794ad; }

    .shield {
      position: absolute;
      top: 112px; right: 68px;
      width: 46px; height: 46px;
      border-radius: 18px;
      background: linear-gradient(145deg, #1685ff, #0046d9);
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 18px 36px rgba(0,98,255,.3);
      animation: floatY 3.4s ease-in-out infinite;
    }
    .shield svg { width: 24px; height: 24px; }

    .form-area {
      margin-top: 74px;
      max-width: 370px;
    }

    .form-area h2 {
      font-size: 25px;
      color: #11284f;
      margin: 0;
      font-weight: 900;
      letter-spacing: -.4px;
    }
    .caption {
      font-size: 13px;
      color: #68738a;
      margin: 10px 0 0;
    }
    .blue-line {
      width: 70px;
      height: 4px;
      background: #086dff;
      border-radius: 20px;
      margin: 12px 0 18px;
    }

    .frm { display: block; }

    .field { margin-bottom: 6px; }

    .input {
      height: 46px;
      border-radius: 14px;
      background: #fff;
      border: 1px solid #dde7f6;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 0 18px;
      margin-bottom: 4px;
      box-shadow: 0 12px 28px rgba(30,80,150,.07);
      transition: border-color .2s, box-shadow .2s;
    }
    .input:focus-within {
      border-color: #086dff;
      box-shadow: 0 12px 28px rgba(30,80,150,.07), 0 0 0 4px rgba(8,109,255,.12);
    }
    .input.input-err { border-color: #ef4444; }
    .input > span {
      display: inline-flex; align-items: center; justify-content: center;
      color: #6b7790;
    }
    .input > span svg { width: 18px; height: 18px; }

    .input input {
      flex: 1;
      border: 0;
      outline: 0;
      font-size: 14px;
      color: #11284f;
      background: transparent;
      font-family: inherit;
      min-width: 0;
    }
    .input input::placeholder { color: #98a3b8; }

    .pw-toggle {
      background: transparent;
      border: 0;
      padding: 6px;
      cursor: pointer;
      color: #6b7790;
      display: inline-flex; align-items: center; justify-content: center;
      border-radius: 8px;
    }
    .pw-toggle:hover { color: #086dff; background: #eef5ff; }
    .pw-toggle svg { width: 22px; height: 22px; }

    .field-err {
      display: block;
      font-size: 12px;
      color: #dc2626;
      margin: 4px 4px 8px;
    }
    .caps-note {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12.5px; color: #b45309;
      background: #fef3c7;
      border-radius: 10px;
      padding: 6px 10px;
      margin: 6px 4px 14px;
    }
    .caps-note svg { width: 14px; height: 14px; }

    .locked-chip {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 12px 18px;
      border-radius: 999px;
      background: #eef5ff;
      color: #11284f;
      font-weight: 700;
      font-size: 16px;
      margin-bottom: 18px;
    }
    .locked-chip svg { width: 18px; height: 18px; color: #086dff; }

    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 6px 4px 10px;
      font-size: 13px;
      flex-wrap: wrap;
      gap: 10px;
    }
    .remember {
      display: inline-flex; align-items: center;
      color: #1e2e4e;
      cursor: pointer;
      user-select: none;
    }
    .remember input {
      width: 16px; height: 16px;
      accent-color: #0072ff;
      margin-right: 10px;
      cursor: pointer;
    }
    .forgot {
      color: #005cff;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
    }
    .forgot:hover { text-decoration: underline; }

    .err-banner {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 16px;
      border-radius: 14px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      font-size: 14px;
      margin-bottom: 18px;
    }
    .err-banner svg { width: 18px; height: 18px; flex-shrink: 0; }

    .login {
      width: 100%;
      height: 46px;
      border: 0;
      border-radius: 14px;
      color: #fff;
      font-size: 15px;
      font-weight: 800;
      background: linear-gradient(135deg, #087cff, #003ab8);
      box-shadow: 0 18px 38px rgba(0,82,255,.35);
      cursor: pointer;
      position: relative;
      display: flex; align-items: center; justify-content: center;
      gap: 16px;
      font-family: inherit;
      transition: transform .15s, box-shadow .2s, opacity .2s;
    }
    .login:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 22px 44px rgba(0,82,255,.4);
    }
    .login:active:not(:disabled) { transform: translateY(0); }
    .login:disabled { opacity: .7; cursor: progress; }
    .login .arrow {
      position: absolute;
      right: 18px;
      top: 50%; transform: translateY(-50%);
      display: inline-flex;
    }
    .login .arrow svg { width: 20px; height: 20px; }
    .spinner {
      width: 18px; height: 18px;
      border: 2.5px solid rgba(255,255,255,.4);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin .9s linear infinite;
      display: inline-block;
      vertical-align: -3px;
      margin-right: 8px;
    }

    .or {
      display: flex;
      align-items: center;
      gap: 26px;
      margin: 12px 0 10px;
      color: #8d96a8;
    }
    .or i {
      flex: 1;
      height: 1px;
      background: #dbe4f2;
    }
    .or p { margin: 0; font-size: 16px; }

    .bio {
      width: 100%;
      height: 42px;
      border-radius: 14px;
      border: 1px solid #d3e1f5;
      background: #fff;
      color: #005cff;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      gap: 14px;
      font-family: inherit;
      transition: background .2s, border-color .2s;
    }
    .bio:hover { background: #f1f7ff; border-color: #086dff; }
    .bio span { display: inline-flex; }
    .bio span svg { width: 20px; height: 20px; }

    .support-strip {
      margin-top: 12px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 14px;
      color: #475569;
      font-size: 12px;
      line-height: 1.35;
    }
    .support-strip a {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #0f766e;
      font-weight: 700;
      text-decoration: none;
      white-space: nowrap;
    }
    .support-strip a:hover { color: #0f5e9a; text-decoration: underline; }
    .support-strip svg {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    .help { display: none; }
    .help-icon {
      flex-shrink: 0;
      width: 38px; height: 38px;
      background: #d9ebff;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #005cff;
    }
    .help-icon svg { width: 18px; height: 18px; }
    .help-text { flex: 1; min-width: 0; }
    .help h4 {
      margin: 0;
      font-size: 14px;
      color: #11284f;
      font-weight: 700;
    }
    .help p {
      margin: 7px 0 0;
      color: #68738a;
      font-size: 12px;
    }
    .help p a {
      color: #005cff;
      text-decoration: none;
    }
    .help p a:hover { text-decoration: underline; }
    .help strong {
      margin-left: auto;
      font-size: 28px;
      color: #8792a5;
      line-height: 1;
      font-weight: 400;
    }

    .secure { display: none; }
    .secure svg { width: 16px; height: 16px; }

    /* ═══ ANIMATIONS ═══════════════════════════ */
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes floatY {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      20% { transform: translateX(-5px); }
      40% { transform: translateX(5px); }
      60% { transform: translateX(-3px); }
      80% { transform: translateX(3px); }
    }
    .card-shake { animation: shake .35s ease-in-out; }

    /* ═══ RESPONSIVE ═════════════════════════ */

    /* tablet — tighten paddings, reduce hero typography */
    @media (max-width: 1100px) {
      .screen { max-width: 880px; grid-template-columns: 32% 68%; }
      .left { padding: 38px 32px; }
      .left h1 { font-size: 48px; }
      .right { padding: 30px 36px; border-top-left-radius: 64px; }
      .language { top: 24px; right: 36px; }
      .shield { top: 140px; right: 68px; width: 52px; height: 52px; }
      .form-area { margin-top: 96px; max-width: 400px; }
    }

    /* phone — stack panels, hide hero ornaments */
    @media (max-width: 900px) {
      .page { padding: 0; align-items: stretch; background: #fff; }
      .page::before, .page::after { display: none; }
      .screen {
        height: auto;
        min-height: 100vh;
        max-width: 100%;
        grid-template-columns: 1fr;
        border-radius: 0;
        box-shadow: none;
      }
      .left {
        padding: 46px 30px;
        text-align: center;
      }
      .logo-box {
        margin: 0 auto;
        width: 86px; height: 86px;
        border-radius: 22px;
      }
      .people-icon { width: 54px; height: 54px; }
      .left h1 { font-size: 46px; margin-top: 24px; }
      .left h3 { font-size: 18px; }
      .line { margin: 22px auto 0; }
      .features { display: none; }
      .brand-footer {
        margin-top: 22px;
        padding-top: 0;
        text-align: center;
      }

      .right {
        border-top-left-radius: 0;
        padding: 38px 24px 32px;
      }
      .language, .shield { display: none; }

      .form-area { margin-top: 8px; }
      .form-area h2 { font-size: 28px; }
      .caption { font-size: 16px; }
      .blue-line { margin: 24px 0 32px; }

      .input {
        height: 56px;
        padding: 0 18px;
        gap: 16px;
        border-radius: 14px;
      }
      .input > span svg { width: 20px; height: 20px; }
      .input input { font-size: 16px; /* prevents iOS focus-zoom */ }

      .row { font-size: 15px; margin: 8px 4px 22px; }
      .login {
        height: 54px;
        font-size: 17px;
        border-radius: 14px;
      }
      .login .arrow { right: 18px; }
      .login .arrow svg { width: 20px; height: 20px; }

      .or { margin: 26px 0 22px; }

      .bio {
        height: 48px;
        font-size: 15px;
        border-radius: 14px;
      }
      .bio span svg { width: 22px; height: 22px; }

      .support-strip {
        justify-content: center;
        font-size: 12px;
      }
      .help { padding: 16px; gap: 14px; margin-top: 28px; }
      .help-icon { width: 52px; height: 52px; }
      .help-icon svg { width: 22px; height: 22px; }
      .help h4 { font-size: 17px; }
      .help p { font-size: 14px; }
      .help strong { font-size: 32px; }
      .secure { font-size: 14px; margin-top: 24px; }
    }

    @media (max-width: 380px) {
      .left { padding: 32px 18px; }
      .left h1 { font-size: 48px; }
      .right { padding: 28px 16px 24px; }
    }

    /* Full-width ESS composition supplied for the production login. */
    :host, .page, .screen { width: 100%; }
    :host { letter-spacing: 0; }
    button, input { font: inherit; }

    .page {
      min-height: 100dvh;
      padding: 0;
      align-items: stretch;
      background: #f4f8ff;
      overflow: visible;
    }
    .page::before, .page::after { display: none; }

    .screen {
      max-width: none;
      min-height: 100dvh;
      grid-template-columns: minmax(360px, 35.6%) minmax(0, 64.4%);
      border-radius: 0;
      box-shadow: none;
      overflow: visible;
      margin: 0;
    }

    .left {
      min-height: 100dvh;
      padding: clamp(34px, 5vh, 52px) clamp(38px, 4.7vw, 72px) 48px clamp(46px, 6vw, 92px);
      border-radius: 0 12px 12px 0;
      background:
        radial-gradient(circle at 92% 45%, rgba(14, 81, 170, .32), transparent 34%),
        linear-gradient(180deg, #06265f 0%, #06255c 52%, #05215a 100%);
    }
    .left::before {
      content: "";
      position: absolute;
      top: 10px;
      right: 14px;
      width: 120px;
      height: 102px;
      opacity: .58;
      background-image: radial-gradient(circle, #0865e7 2px, transparent 2.4px);
      background-size: 15px 15px;
    }
    .left::after {
      content: "";
      position: absolute;
      right: -86px;
      bottom: 18%;
      left: auto;
      width: 240px;
      height: 240px;
      border-radius: 50%;
      opacity: .25;
      background: repeating-radial-gradient(circle, transparent 0 15px, rgba(19, 94, 206, .62) 16px 17px);
    }
    .brand-logo {
      display: block;
      width: min(292px, 100%);
      height: auto;
      position: relative;
      z-index: 2;
    }
    .left h1 {
      margin-top: clamp(28px, 4.4vh, 45px);
      font-size: clamp(64px, 5.6vw, 86px);
      line-height: .95;
      letter-spacing: 0;
      font-weight: 800;
    }
    .left h3 {
      margin-top: 13px;
      font-size: clamp(19px, 1.65vw, 25px);
      line-height: 1.2;
      letter-spacing: 0;
      font-weight: 700;
    }
    .line {
      width: 92px;
      margin: 20px 0 0;
      background: #6cb82a;
    }
    .features {
      margin-top: clamp(24px, 3vh, 31px);
      gap: 18px;
    }
    .features > div { gap: 16px; }
    .features span {
      width: 56px;
      height: 56px;
      border-color: rgba(50, 131, 246, .25);
      background: rgba(6, 76, 166, .54);
      color: #6cb82a;
    }
    .features span svg { width: 30px; height: 30px; }
    .features p {
      font-size: clamp(14px, 1.05vw, 16px);
      line-height: 1.45;
      font-weight: 600;
    }
    .brand-footer {
      color: rgba(255, 255, 255, .94);
      font-size: 13px;
      font-weight: 400;
    }

    .right {
      min-width: 0;
      min-height: 100dvh;
      padding: 0 clamp(24px, 3.5vw, 54px);
      border-radius: 0;
      overflow-x: hidden;
      overflow-y: auto;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      background:
        radial-gradient(circle at 38% 30%, rgba(255, 255, 255, .98) 0 26%, rgba(249, 252, 255, .94) 51%, rgba(237, 245, 255, .97) 100%);
    }
    .right::before {
      content: "";
      position: absolute;
      right: -90px;
      bottom: -230px;
      width: 460px;
      height: 720px;
      border-radius: 18px;
      background: linear-gradient(145deg, #0c377c 0%, #0755ce 78%);
      transform: rotate(43deg);
    }
    .right::after {
      content: "";
      position: absolute;
      right: -4px;
      top: 92px;
      width: 380px;
      height: 360px;
      opacity: .48;
      background: repeating-linear-gradient(135deg, transparent 0 14px, rgba(42, 111, 239, .34) 15px 16px);
      clip-path: polygon(42% 0, 100% 0, 100% 100%, 0 100%);
    }
    .shield { display: none; }

    .language-switch {
      position: absolute;
      top: clamp(24px, 4.6vh, 47px);
      right: clamp(28px, 4.2vw, 65px);
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 17px;
    }
    .language {
      position: static;
      height: 43px;
      padding: 0 16px;
      border: 1px solid #d3dfef;
      border-radius: 999px;
      box-shadow: 0 6px 18px rgba(46, 75, 120, .06);
      font-weight: 650;
    }
    .language svg { width: 20px; height: 20px; }
    .language .caret { width: 16px; height: 16px; }
    .lang-link {
      border: 0;
      padding: 5px 0;
      background: transparent;
      color: #0759e8;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
    }
    .lang-link:focus-visible, .language:focus-visible { outline: 3px solid rgba(7, 89, 232, .28); outline-offset: 3px; }
    .lang-separator { color: #8fa4c0; }

    .form-area {
      position: relative;
      z-index: 3;
      width: min(584px, 100%);
      max-width: none;
      margin: clamp(92px, 12vh, 123px) auto 145px;
      padding: 33px 40px 35px;
      border: 1px solid rgba(220, 230, 243, .75);
      border-radius: 22px;
      background: rgba(255, 255, 255, .97);
      box-shadow: 0 10px 29px rgba(35, 68, 114, .12);
    }
    .form-area h2 {
      font-size: 32px;
      line-height: 1.1;
      letter-spacing: 0;
      font-weight: 800;
      color: #09235a;
    }
    .caption { margin-top: 12px; font-size: 16px; color: #3d557e; }
    .blue-line { width: 72px; margin: 19px 0 30px; background: #0759e8; }

    .field { margin-bottom: 18px; }
    .field > label {
      display: block;
      margin-bottom: 8px;
      color: #17315f;
      font-size: 15px;
      font-weight: 600;
    }
    .input {
      height: 50px;
      margin-bottom: 0;
      padding: 0 16px;
      gap: 14px;
      border: 1px solid #ccdaec;
      border-radius: 10px;
      box-shadow: none;
    }
    .input:focus-within { border-color: #86b3f7; box-shadow: 0 0 0 4px rgba(7, 89, 232, .08); }
    .input > span svg { width: 23px; height: 23px; }
    .input input { font-size: 16px; }
    .locked-chip {
      width: 100%;
      min-height: 50px;
      margin-bottom: 18px;
      border: 1px solid #ccdaec;
      border-radius: 10px;
      background: #f8fbff;
    }
    .row { margin: -2px 0 20px; font-size: 14px; }
    .remember input { width: 18px; height: 18px; margin-right: 9px; }
    .login {
      height: 54px;
      border-radius: 10px;
      font-size: 16px;
      background: linear-gradient(90deg, #0d63f3 0%, #054bd6 100%);
      box-shadow: 0 8px 20px rgba(9, 83, 222, .16);
    }
    .or { gap: 15px; margin: 20px 0 19px; color: #3f587d; }
    .bio {
      height: 52px;
      border-radius: 9px;
      border-color: #cbd9ec;
      gap: 12px;
      opacity: 1;
      cursor: not-allowed;
    }
    .bio:disabled { color: #466da8; background: #f9fbfe; }
    .coming-soon {
      margin-left: 3px;
      padding: 5px 12px;
      border-radius: 999px;
      background: #e6efff;
      color: #0759e8;
      font-size: 11px;
      font-weight: 700;
    }
    .support-strip {
      position: absolute;
      top: calc(100% + 30px);
      left: 0;
      width: 100%;
      min-height: 90px;
      margin: 0;
      padding: 15px 18px;
      border: 1px solid rgba(220, 230, 243, .72);
      border-radius: 19px;
      background: rgba(255, 255, 255, .94);
      box-shadow: 0 11px 30px rgba(35, 68, 114, .08);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px 22px;
      font-size: 14px;
    }
    .support-strip strong { color: #112b59; }
    .support-strip a { color: #102b58; font-weight: 500; }
    .support-strip svg { width: 20px; height: 20px; color: #315a91; }

    @media (min-width: 981px) and (max-height: 820px) {
      .left { padding-top: 30px; padding-bottom: 30px; }
      .brand-logo { width: 245px; }
      .left h1 { margin-top: 24px; font-size: 64px; }
      .features { gap: 12px; }
      .features span { width: 46px; height: 46px; }
      .features span svg { width: 24px; height: 24px; }
      .form-area { margin-top: 76px; padding: 25px 34px 28px; }
      .form-area h2 { font-size: 28px; }
      .caption { margin-top: 7px; font-size: 14px; }
      .blue-line { margin: 14px 0 20px; }
      .field { margin-bottom: 12px; }
      .field > label { margin-bottom: 6px; font-size: 14px; }
      .input, .locked-chip { min-height: 46px; height: 46px; }
      .row { margin-bottom: 14px; }
      .login { height: 50px; }
      .or { margin: 12px 0; }
      .bio { height: 46px; }
      .support-strip { top: calc(100% + 18px); min-height: 72px; }
    }

    @media (max-width: 980px) {
      .screen { display: block; min-height: 100dvh; }
      .left {
        min-height: auto;
        padding: 32px clamp(22px, 6vw, 52px) 36px;
        border-radius: 0 0 28px 28px;
        text-align: left;
      }
      .brand-logo { width: 250px; margin: 0; }
      .left h1 { margin-top: 24px; font-size: 58px; }
      .left h3 { font-size: 21px; }
      .line { margin-left: 0; }
      .features { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .features > div { align-items: flex-start; gap: 10px; }
      .features span { width: 46px; height: 46px; }
      .features span svg { width: 24px; height: 24px; }
      .features p { font-size: 13px; }
      .brand-footer { margin-top: 24px; padding-top: 0; text-align: left; }
      .right { min-height: 760px; padding: 88px 20px 50px; }
      .right::before, .right::after { opacity: .22; }
      .language-switch { top: 24px; left: 20px; right: 20px; justify-content: center; }
      .form-area { margin: 0 auto 32px; }
      .support-strip { position: static; margin-top: 28px; }
    }

    @media (max-width: 620px) {
      .left { padding: 24px 20px 26px; text-align: center; }
      .brand-logo { width: 210px; margin: 0 auto; }
      .left h1 { font-size: 48px; }
      .left h3 { font-size: 18px; }
      .line { margin-left: auto; margin-right: auto; }
      .features { display: none; }
      .brand-footer { margin-top: 20px; text-align: center; font-size: 12px; }
      .right { min-height: auto; padding: 82px 12px 28px; }
      .language-switch { gap: 9px; }
      .language { height: 40px; padding: 0 12px; }
      .lang-link { font-size: 14px; }
      .form-area { padding: 27px 20px 28px; border-radius: 18px; }
      .form-area h2 { font-size: 28px; }
      .caption { font-size: 14px; line-height: 1.45; }
      .blue-line { margin-bottom: 25px; }
      .field { margin-bottom: 16px; }
      .row { align-items: center; }
      .bio { height: auto; min-height: 52px; padding: 9px 10px; flex-wrap: wrap; }
      .coming-soon { padding: 4px 8px; }
      .support-strip { align-items: flex-start; justify-content: flex-start; }
      .support-strip strong { flex-basis: 100%; }
    }

    @media (max-width: 390px) {
      .lang-separator, .lang-link:last-child { display: none; }
      .form-area { padding-inline: 16px; }
      .row { font-size: 13px; gap: 8px; }
      .support-strip a { white-space: normal; overflow-wrap: anywhere; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
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
