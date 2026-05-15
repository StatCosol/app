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
      <div class="screen" [class.card-shake]="errorMsg">

        <!-- ═══════ LEFT: BRAND PANEL ═══════ -->
        <aside class="left">
          <div class="logo-box">
            <svg class="people-icon" viewBox="0 0 64 64" fill="none" stroke="#1d4ed8" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14 30 C 14 16, 50 16, 50 30"/>
              <circle cx="22" cy="36" r="4.2" fill="#1d4ed8" stroke="none"/>
              <path d="M14 50 C 14 44, 18 41, 22 41 C 26 41, 30 44, 30 50 Z" fill="#1d4ed8" stroke="none"/>
              <circle cx="42" cy="36" r="4.2" fill="#1d4ed8" stroke="none"/>
              <path d="M34 50 C 34 44, 38 41, 42 41 C 46 41, 50 44, 50 50 Z" fill="#1d4ed8" stroke="none"/>
              <circle cx="32" cy="33" r="4.6" fill="#1d4ed8" stroke="none"/>
              <path d="M23 50 C 23 43, 27 39, 32 39 C 37 39, 41 43, 41 50 Z" fill="#1d4ed8" stroke="none"/>
            </svg>
          </div>

          <h1>ESS</h1>
          <h3>Employee Self Service</h3>
          <div class="line"></div>

          <div class="features">
            <div>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/></svg>
              </span>
              <p>Your Information<br/>At Your Fingertips</p>
            </div>
            <div>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></svg>
              </span>
              <p>Secure, Reliable,<br/>Always With You.</p>
            </div>
            <div>
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V9"/><path d="M10 19v-6"/><path d="M16 19V5"/><path d="M3 19h18"/></svg>
              </span>
              <p>Empowering<br/>Employees</p>
            </div>
          </div>
        </aside>

        <!-- ═══════ RIGHT: LOGIN PANEL ═══════ -->
        <section class="right">
          <button type="button" class="language" aria-label="Language">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>
            <span>English</span>
            <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>

          <div class="shield" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12 10 17 19 7"/></svg>
          </div>

          <div class="form-area">
            <h2>Welcome Back!</h2>
            <p class="caption">Log in to access your account</p>
            <div class="blue-line"></div>

            <form (ngSubmit)="submit()" autocomplete="on" class="frm">

              <!-- Company code (only when not locked via /:companyCode/login) -->
              <div class="field" *ngIf="!companyCodeLocked">
                <div class="input" [class.input-err]="submitted && !companyCode.trim()">
                  <span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01"/></svg>
                  </span>
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
                <div class="input" [class.input-err]="submitted && !email.trim()">
                  <span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/></svg>
                  </span>
                  <input id="ess-email" type="email" [(ngModel)]="email" name="email"
                         placeholder="Username / Employee ID" autocomplete="username" />
                </div>
                <span class="field-err" *ngIf="submitted && !email.trim()">Enter your username or employee ID.</span>
              </div>

              <!-- Password -->
              <div class="field">
                <div class="input" [class.input-err]="submitted && !password">
                  <span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
                  </span>
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
              <div class="row">
                <label class="remember">
                  <input type="checkbox" [(ngModel)]="rememberMe" name="remember" />
                  <span>Remember me</span>
                </label>
                <a class="forgot" (click)="goToForgotPassword()" href="javascript:void(0)">Forgot Password?</a>
              </div>

              <!-- Error banner -->
              <div class="err-banner" *ngIf="errorMsg">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                {{ errorMsg }}
              </div>

              <!-- Login button -->
              <button class="login" type="submit" [disabled]="isLoading">
                <span class="btn-text" *ngIf="!isLoading">Login</span>
                <span class="btn-text" *ngIf="isLoading"><span class="spinner"></span> Signing in&hellip;</span>
                <span class="arrow" *ngIf="!isLoading" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>
                </span>
              </button>

              <div class="or">
                <i></i><p>or</p><i></i>
              </div>

              <button type="button" class="bio" (click)="loginWithBiometrics()">
                <span aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11v3a2 2 0 002 2"/><path d="M5.5 9.5A8 8 0 0112 6a8 8 0 016.5 3.5"/><path d="M3 13a10 10 0 014-7.5"/><path d="M21 13a10 10 0 00-4-7.5"/><path d="M7 14a5 5 0 015-5 5 5 0 015 5v2"/><path d="M9 19a3 3 0 003-3"/><path d="M15 21a8 8 0 002-5"/></svg>
                </span>
                Login with Biometrics
              </button>
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
      background: #005cff;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    /* ═══ SCREEN (white card) ═════════════════ */
    .screen {
      width: 100%;
      max-width: 1080px;
      min-height: min(1360px, calc(100vh - 48px));
      background: #fff;
      border-radius: 44px;
      display: grid;
      grid-template-columns: 38% 62%;
      overflow: hidden;
      box-shadow: 0 35px 90px rgba(0, 30, 100, .45);
    }

    /* ═══ LEFT BRAND PANEL ═════════════════════ */
    .left {
      color: #fff;
      padding: 90px 64px;
      background:
        linear-gradient(180deg, rgba(0,95,255,.95), rgba(0,20,95,.98)),
        radial-gradient(circle at 20% 80%, #48c7ff, transparent 35%);
      position: relative;
      overflow: hidden;
    }
    .left::after {
      content: "";
      position: absolute;
      bottom: 0; left: 0;
      width: 100%; height: 320px;
      background: linear-gradient(transparent, rgba(0,0,0,.35));
      pointer-events: none;
    }

    .logo-box {
      width: 145px; height: 145px;
      background: #fff;
      border-radius: 34px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 20px 45px rgba(0,0,0,.18);
      position: relative;
      z-index: 2;
    }
    .people-icon { width: 92px; height: 92px; }

    .left h1 {
      font-size: 96px;
      margin: 58px 0 0;
      line-height: 1;
      font-weight: 900;
      letter-spacing: -1.5px;
      position: relative;
      z-index: 2;
    }
    .left h3 {
      font-size: 26px;
      margin: 20px 0 0;
      font-weight: 600;
      position: relative;
      z-index: 2;
    }
    .line {
      width: 74px;
      height: 5px;
      background: #19c8ff;
      margin: 38px 0 70px;
      border-radius: 20px;
      position: relative;
      z-index: 2;
    }

    .features {
      position: relative;
      z-index: 2;
      display: grid;
      gap: 34px;
    }
    .features > div {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .features span {
      flex-shrink: 0;
      width: 58px; height: 58px;
      border: 1px solid rgba(255,255,255,.45);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,.08);
      color: #fff;
    }
    .features span svg { width: 26px; height: 26px; }
    .features p {
      margin: 0;
      font-size: 17px;
      line-height: 1.45;
    }

    /* ═══ RIGHT LOGIN PANEL ═══════════════════ */
    .right {
      background: #fbfdff;
      border-top-left-radius: 145px;
      padding: 70px 58px;
      position: relative;
    }

    .language {
      position: absolute;
      top: 56px; right: 58px;
      background: #fff;
      border: 0;
      border-radius: 35px;
      padding: 14px 22px;
      color: #33405c;
      font-size: 17px;
      box-shadow: 0 10px 30px rgba(0,0,0,.08);
      display: inline-flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      font-family: inherit;
    }
    .language svg { width: 18px; height: 18px; color: #005cff; }
    .language .caret { width: 14px; height: 14px; color: #8794ad; }

    .shield {
      position: absolute;
      top: 270px; right: 122px;
      width: 95px; height: 95px;
      border-radius: 30px;
      background: linear-gradient(145deg, #1685ff, #0046d9);
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 18px 36px rgba(0,98,255,.3);
      animation: floatY 3.4s ease-in-out infinite;
    }
    .shield svg { width: 46px; height: 46px; }

    .form-area { margin-top: 245px; }

    .form-area h2 {
      font-size: 42px;
      color: #11284f;
      margin: 0;
      font-weight: 900;
      letter-spacing: -.4px;
    }
    .caption {
      font-size: 20px;
      color: #68738a;
      margin: 14px 0 0;
    }
    .blue-line {
      width: 70px;
      height: 5px;
      background: #086dff;
      border-radius: 20px;
      margin: 36px 0 48px;
    }

    .frm { display: block; }

    .field { margin-bottom: 8px; }

    .input {
      height: 86px;
      border-radius: 22px;
      background: #fff;
      border: 1px solid #dde7f6;
      display: flex;
      align-items: center;
      gap: 22px;
      padding: 0 28px;
      margin-bottom: 8px;
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
    .input > span svg { width: 24px; height: 24px; }

    .input input {
      flex: 1;
      border: 0;
      outline: 0;
      font-size: 20px;
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
      font-size: 13px;
      color: #dc2626;
      margin: 6px 4px 14px;
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
      margin: 14px 4px 32px;
      font-size: 18px;
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
      width: 22px; height: 22px;
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
      height: 88px;
      border: 0;
      border-radius: 22px;
      color: #fff;
      font-size: 26px;
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
      right: 24px;
      top: 50%; transform: translateY(-50%);
      display: inline-flex;
    }
    .login .arrow svg { width: 26px; height: 26px; }
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
      margin: 36px 0 30px;
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
      height: 72px;
      border-radius: 20px;
      border: 1px solid #d3e1f5;
      background: #fff;
      color: #005cff;
      font-size: 20px;
      font-weight: 700;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      gap: 14px;
      font-family: inherit;
      transition: background .2s, border-color .2s;
    }
    .bio:hover { background: #f1f7ff; border-color: #086dff; }
    .bio span { display: inline-flex; }
    .bio span svg { width: 26px; height: 26px; }

    .help {
      margin-top: 42px;
      background: #eef5ff;
      border-radius: 22px;
      padding: 24px;
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .help-icon {
      flex-shrink: 0;
      width: 66px; height: 66px;
      background: #d9ebff;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #005cff;
    }
    .help-icon svg { width: 28px; height: 28px; }
    .help-text { flex: 1; min-width: 0; }
    .help h4 {
      margin: 0;
      font-size: 20px;
      color: #11284f;
      font-weight: 700;
    }
    .help p {
      margin: 7px 0 0;
      color: #68738a;
      font-size: 16px;
    }
    .help p a {
      color: #005cff;
      text-decoration: none;
    }
    .help p a:hover { text-decoration: underline; }
    .help strong {
      margin-left: auto;
      font-size: 42px;
      color: #8792a5;
      line-height: 1;
      font-weight: 400;
    }

    .secure {
      text-align: center;
      margin-top: 34px;
      color: #7b9ad1;
      font-size: 16px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      justify-content: center;
    }
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
      .left { padding: 64px 44px; }
      .left h1 { font-size: 78px; }
      .right { padding: 60px 44px; border-top-left-radius: 110px; }
      .language { top: 40px; right: 44px; }
      .shield { top: 230px; right: 88px; width: 84px; height: 84px; }
      .form-area { margin-top: 210px; }
    }

    /* phone — stack panels, hide hero ornaments */
    @media (max-width: 900px) {
      .page { padding: 0; align-items: stretch; background: #fff; }
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
        width: 110px; height: 110px;
        border-radius: 28px;
      }
      .people-icon { width: 70px; height: 70px; }
      .left h1 { font-size: 62px; margin-top: 32px; }
      .left h3 { font-size: 20px; }
      .line { margin: 22px auto 0; }
      .features { display: none; }

      .right {
        border-top-left-radius: 0;
        padding: 38px 24px 32px;
      }
      .language, .shield { display: none; }

      .form-area { margin-top: 8px; }
      .form-area h2 { font-size: 32px; }
      .caption { font-size: 16px; }
      .blue-line { margin: 24px 0 32px; }

      .input {
        height: 64px;
        padding: 0 20px;
        gap: 16px;
        border-radius: 18px;
      }
      .input > span svg { width: 20px; height: 20px; }
      .input input { font-size: 16px; /* prevents iOS focus-zoom */ }

      .row { font-size: 15px; margin: 8px 4px 22px; }
      .login {
        height: 60px;
        font-size: 18px;
        border-radius: 18px;
      }
      .login .arrow { right: 18px; }
      .login .arrow svg { width: 20px; height: 20px; }

      .or { margin: 26px 0 22px; }

      .bio {
        height: 56px;
        font-size: 16px;
        border-radius: 16px;
      }
      .bio span svg { width: 22px; height: 22px; }

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
