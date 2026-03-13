import { Component, ChangeDetectorRef, HostListener, ViewEncapsulation, OnInit, OnDestroy } from '@angular/core';
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
      <!-- ── Floating decorative orbs ── -->
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>

      <div class="layout">
        <!-- ═══════ LEFT: LOGIN CARD ═══════ -->
        <div class="card-col">
          <div class="card" [class.card-shake]="errorMsg">
            <!-- Logo + Heading -->
            <div class="logo-row">
              <img class="logo-img" src="assets/images/statco-logo.svg" alt="StatCo Solutions" />
              <div class="logo-text">
                <h1 class="heading">Sign in</h1>
                <p class="sub-heading">Your one-stop employee self-service portal.</p>
              </div>
            </div>

            <form (ngSubmit)="submit()" autocomplete="on" class="frm">
              <!-- Company Code -->
              <div class="field" *ngIf="!companyCodeLocked">
                <label class="lbl">Company Code</label>
                <div class="input-wrap" [class.input-err]="submitted && !companyCode.trim()">
                  <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/></svg>
                  <input type="text" [(ngModel)]="companyCode" name="companyCode"
                         placeholder="VEDHA" autocomplete="organization" />
                </div>
                <span class="field-hint">Provided by your HR / Company.</span>
                <span class="field-err" *ngIf="submitted && !companyCode.trim()">Company code is required.</span>
              </div>

              <!-- Locked company code chip -->
              <div class="locked-chip" *ngIf="companyCodeLocked">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/></svg>
                {{ companyCode }}
              </div>

              <!-- Email -->
              <div class="field">
                <label class="lbl">Email Address</label>
                <div class="input-wrap" [class.input-err]="submitted && !email.trim()">
                  <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>
                  <input type="email" [(ngModel)]="email" name="email"
                         placeholder="you&#64;company.com" autocomplete="username" />
                </div>
                <span class="field-err" *ngIf="submitted && !email.trim()">Enter a valid email.</span>
              </div>

              <!-- Password -->
              <div class="field">
                <div class="lbl-row">
                  <label class="lbl">Password</label>
                  <a class="accent-link" href="javascript:void(0)">Forgot Password?</a>
                </div>
                <div class="input-wrap" [class.input-err]="submitted && !password">
                  <svg class="field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  <input [type]="showPassword ? 'text' : 'password'"
                         [(ngModel)]="password" name="password"
                         placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;" autocomplete="current-password"
                         (keydown)="checkCapsLock($event)" />
                  <button type="button" class="pw-toggle" (click)="showPassword=!showPassword" tabindex="-1">
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

              <!-- Error banner -->
              <div class="err-banner" *ngIf="errorMsg">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                {{ errorMsg }}
              </div>

              <!-- Submit -->
              <button class="btn-sign-in" type="submit" [disabled]="isLoading">
                <ng-container *ngIf="!isLoading">Sign In</ng-container>
                <span *ngIf="isLoading" class="ld-row"><span class="spinner"></span> Signing in&hellip;</span>
              </button>
            </form>

            <div class="card-footer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <span>Your session is encrypted and secured.</span>
            </div>
          </div>

          <div class="below-card">
            <a href="javascript:void(0)">Privacy</a>
            <span class="sep">&bull;</span>
            <a href="javascript:void(0)">Terms</a>
            <span class="sep">&bull;</span>
            <span>&copy; {{ currentYear }} StatCo Solutions</span>
          </div>
        </div>

        <!-- ═══════ RIGHT: ILLUSTRATION PANEL ═══════ -->
        <div class="illust-col">
          <div class="illust-inner">
            <!-- Brand name -->
            <div class="illust-brand">
              <h2 class="illust-brand-name">StatCo Solutions</h2>
              <p class="illust-brand-tag">Ensuring Compliance, Empowering Success.</p>
            </div>

            <!-- abstract dashboard mockup -->
            <div class="mock-browser">
              <div class="mock-bar">
                <span class="mock-dot d1"></span>
                <span class="mock-dot d2"></span>
                <span class="mock-dot d3"></span>
                <span class="mock-search"></span>
              </div>
              <div class="mock-body">
                <div class="mock-sidebar">
                  <div class="sb-item sb-active"></div>
                  <div class="sb-item"></div>
                  <div class="sb-item"></div>
                  <div class="sb-item"></div>
                  <div class="sb-item"></div>
                </div>
                <div class="mock-content">
                  <div class="mc-top-bar"></div>
                  <div class="mc-cards">
                    <div class="mc-card mc-c1">
                      <div class="mc-card-bar"></div>
                      <div class="mc-card-val"></div>
                    </div>
                    <div class="mc-card mc-c2">
                      <div class="mc-card-bar"></div>
                      <div class="mc-card-val"></div>
                    </div>
                    <div class="mc-card mc-c3">
                      <div class="mc-card-bar"></div>
                      <div class="mc-card-val"></div>
                    </div>
                  </div>
                  <div class="mc-chart">
                    <div class="mc-bar b1"></div>
                    <div class="mc-bar b2"></div>
                    <div class="mc-bar b3"></div>
                    <div class="mc-bar b4"></div>
                    <div class="mc-bar b5"></div>
                    <div class="mc-bar b6"></div>
                  </div>
                  <div class="mc-table">
                    <div class="mc-row"></div>
                    <div class="mc-row"></div>
                    <div class="mc-row"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- floating widgets -->
            <div class="float-widget fw-pay">
              <div class="fw-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </div>
              <div><div class="fw-label">Requests</div><div class="fw-val">Apply &amp; Track</div></div>
            </div>

            <div class="float-widget fw-leave">
              <div class="fw-icon leaf">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <div><div class="fw-label">Documents</div><div class="fw-val">View &amp; Download</div></div>
            </div>

            <div class="float-widget fw-pf">
              <div class="fw-donut">
                <svg viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#d0e8f7" stroke-width="3.5"/>
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#0e3a6e" stroke-width="3.5"
                          stroke-dasharray="66 34" stroke-dashoffset="25"
                          stroke-linecap="round"/>
                </svg>
                <span class="donut-label">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </span>
              </div>
              <div><div class="fw-label">Insights</div><div class="fw-val">Real-time Data</div></div>
            </div>

            <div class="float-widget fw-profile">
              <div class="fw-icon prof">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div><div class="fw-label">Profile</div><div class="fw-val">View &amp; Update</div></div>
            </div>

            <div class="float-widget fw-approvals">
              <div class="fw-icon appr">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              </div>
              <div><div class="fw-label">Approvals</div><div class="fw-val">Check Status</div></div>
            </div>
          </div>
        </div>
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
      color: #2d2d2d;
      box-sizing: border-box;
    }
    *, *::before, *::after { box-sizing: inherit; margin: 0; padding: 0; }

    /* ═══ PAGE ═══════════════════════════════ */
    .page {
      min-height: 100vh;
      background: linear-gradient(145deg, #e8f4fd 0%, #d0e6f8 40%, #b8d8f0 100%);
      position: relative;
      overflow: hidden;
    }

    /* ── Decorative orbs ── */
    .orb {
      position: absolute; border-radius: 50%; pointer-events: none;
      background: radial-gradient(circle, rgba(56,189,248,.20), transparent 70%);
    }
    .orb-1 { width: 360px; height: 360px; top: -80px; right: 10%; animation: float 7s ease-in-out infinite; }
    .orb-2 { width: 200px; height: 200px; bottom: 8%; left: 5%; background: radial-gradient(circle, rgba(255,255,255,.40), transparent 70%); animation: float 9s ease-in-out infinite reverse; }
    .orb-3 { width: 120px; height: 120px; top: 55%; right: 4%; background: radial-gradient(circle, rgba(14,58,110,.12), transparent 70%); animation: float 6s ease-in-out infinite 1s; }

    .layout {
      position: relative; z-index: 1;
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(380px, 480px) 1fr;
      max-width: 1340px;
      margin: 0 auto;
      align-items: center;
      padding: 32px 40px;
      gap: 40px;
    }

    /* ═══ LEFT COLUMN — CARD ═════════════════ */
    .card-col {
      display: flex; flex-direction: column; align-items: flex-start;
    }

    .card {
      width: 100%;
      background: rgba(255,255,255,.82);
      backdrop-filter: blur(20px) saturate(1.4);
      -webkit-backdrop-filter: blur(20px) saturate(1.4);
      border-radius: 28px;
      padding: 40px 36px 32px;
      box-shadow:
        0 20px 60px rgba(14,58,110,.10),
        0 1px 3px rgba(0,0,0,.06);
      border: 1px solid rgba(255,255,255,.6);
      animation: slideUp .5s cubic-bezier(.22,1,.36,1);
    }

    .logo-row {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 28px;
    }
    .logo-img {
      height: 48px; width: auto; flex-shrink: 0;
    }
    .logo-text {
      display: flex; flex-direction: column;
    }

    .heading {
      font-size: 26px; font-weight: 900; color: #1a1a1a;
      margin: 0; line-height: 1.2;
    }
    .sub-heading {
      margin: 3px 0 0; font-size: 13px; color: #777; font-weight: 400;
    }

    .frm { margin-top: 28px; }

    /* ── Fields ── */
    .field { margin-bottom: 18px; }
    .lbl {
      display: block;
      font-size: 13px; font-weight: 600; color: #555;
      margin: 0 0 7px;
    }
    .lbl-row {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 7px;
    }
    .lbl-row .lbl { margin: 0; }

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
    .input-wrap.input-err {
      border-color: #e53e3e;
      box-shadow: 0 0 0 4px rgba(229,62,62,.08);
    }

    .field-icon {
      width: 18px; height: 18px; flex-shrink: 0;
      color: #8ba8c4; margin-right: 10px;
    }

    .input-wrap input {
      flex: 1; border: 0; outline: 0; background: none;
      font: inherit; font-size: 14px; color: #1a1a1a;
      height: 100%; padding: 0;
      -webkit-appearance: none; appearance: none;
    }
    .input-wrap input::placeholder { color: #bbb; }

    .pw-toggle {
      border: 0; background: transparent; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      padding: 4px; border-radius: 6px; color: #999;
      transition: color .15s, background .15s;
    }
    .pw-toggle svg { width: 18px; height: 18px; }
    .pw-toggle:hover { color: #0e3a6e; background: rgba(14,58,110,.08); }

    .field-hint { display: block; margin-top: 5px; font-size: 11.5px; color: #999; }
    .field-err { display: block; margin-top: 5px; font-size: 12px; color: #c53030; font-weight: 500; }
    .caps-note {
      display: flex; align-items: center; gap: 4px;
      margin-top: 5px; font-size: 12px; color: #d69e2e; font-weight: 500;
    }
    .caps-note svg { width: 14px; height: 14px; }

    .locked-chip {
      display: inline-flex; align-items: center; gap: 8px;
      background: #e8f4fd; border: 1px solid #a8d4f0;
      padding: 9px 16px; border-radius: 12px;
      font-size: 14px; font-weight: 800; color: #0e3a6e;
      text-transform: uppercase; letter-spacing: .6px;
      margin-bottom: 16px;
    }
    .locked-chip svg { width: 16px; height: 16px; }

    .accent-link {
      font-size: 13px; font-weight: 600; color: #0e3a6e;
      text-decoration: none; transition: color .15s;
    }
    .accent-link:hover { color: #0a1628; text-decoration: underline; }

    /* ── Error banner ── */
    .err-banner {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 14px; border-radius: 12px;
      background: #fff5f5; border: 1px solid #fed7d7;
      color: #9b2c2c; font-size: 13px; font-weight: 500;
      margin-bottom: 16px;
    }
    .err-banner svg { width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px; color: #e53e3e; }

    /* ── Submit button ── */
    .btn-sign-in {
      width: 100%; border: 0;
      background: linear-gradient(135deg, #0a1628, #0e3a6e);
      color: #fff;
      font: inherit; font-weight: 800; font-size: 15px;
      padding: 14px 16px; border-radius: 14px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 6px 20px rgba(14,58,110,.30);
      transition: transform .15s, box-shadow .15s, opacity .15s;
    }
    .btn-sign-in:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 28px rgba(14,58,110,.40);
    }
    .btn-sign-in:active:not(:disabled) { transform: translateY(0); }
    .btn-sign-in:disabled { opacity: .55; cursor: not-allowed; transform: none; box-shadow: none; }
    .btn-sign-in:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }

    .ld-row { display: inline-flex; align-items: center; gap: 8px; }
    .spinner {
      width: 16px; height: 16px; display: inline-block;
      border: 2px solid rgba(255,255,255,.35);
      border-top-color: #fff; border-radius: 50%;
      animation: spin .6s linear infinite;
    }

    /* ── Card footer ── */
    .card-footer {
      display: flex; align-items: center; gap: 6px;
      margin-top: 22px; padding-top: 16px;
      border-top: 1px solid rgba(0,0,0,.06);
      font-size: 12px; color: #999;
    }
    .card-footer svg { width: 14px; height: 14px; color: #bbb; }

    .below-card {
      display: flex; align-items: center; gap: 8px;
      margin-top: 16px; padding-left: 4px;
      font-size: 12px; color: #7a93a8;
    }
    .below-card a { color: #7a93a8; text-decoration: none; font-weight: 600; }
    .below-card a:hover { color: #0e3a6e; }
    .sep { opacity: .5; }

    /* card shake on error */
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      20% { transform: translateX(-6px); }
      40% { transform: translateX(6px); }
      60% { transform: translateX(-4px); }
      80% { transform: translateX(4px); }
    }
    .card-shake { animation: shake .4s ease-in-out; }

    /* ═══ RIGHT COLUMN — ILLUSTRATION ════════ */
    .illust-col {
      display: flex; align-items: center; justify-content: center;
      position: relative; min-height: 520px;
    }
    .illust-inner {
      position: relative;
      width: 100%; max-width: 560px;
      animation: fadeIn .6s ease-out .15s both;
    }

    .illust-brand {
      text-align: left;
      margin-bottom: 24px;
    }
    .illust-brand-name {
      margin: 0;
      font-size: 26px; font-weight: 800;
      letter-spacing: -.3px;
      color: #0a1628;
      text-shadow:
        1px 1px 0 rgba(14, 58, 110, .25),
        2px 2px 4px rgba(0, 0, 0, .15),
        0 0 12px rgba(14, 58, 110, .10);
    }
    .illust-brand-tag {
      margin: 6px 0 0;
      font-size: 14px; font-weight: 400;
      color: #5a7a94;
      font-style: italic;
    }

    /* ── Mock browser ── */
    .mock-browser {
      background: #233044;
      border-radius: 20px;
      overflow: hidden;
      box-shadow:
        0 30px 80px rgba(0,0,0,.18),
        0 0 0 1px rgba(255,255,255,.06) inset;
      transform: perspective(1200px) rotateY(-4deg) rotateX(2deg);
      transition: transform .4s ease;
    }
    .mock-browser:hover { transform: perspective(1200px) rotateY(0) rotateX(0); }

    .mock-bar {
      display: flex; align-items: center; gap: 7px;
      padding: 14px 16px;
      background: #1a2536;
    }
    .mock-dot { width: 10px; height: 10px; border-radius: 50%; }
    .d1 { background: #38bdf8; }
    .d2 { background: #0e3a6e; }
    .d3 { background: #58d68d; }
    .mock-search {
      flex: 1; height: 24px; border-radius: 8px;
      background: rgba(255,255,255,.08); margin-left: 10px;
    }

    .mock-body {
      display: flex; min-height: 320px;
    }
    .mock-sidebar {
      width: 52px; background: #1e2d40;
      padding: 16px 0;
      display: flex; flex-direction: column; align-items: center; gap: 14px;
    }
    .sb-item {
      width: 28px; height: 28px; border-radius: 8px;
      background: rgba(255,255,255,.06);
    }
    .sb-active { background: rgba(56,189,248,.40); }

    .mock-content {
      flex: 1; padding: 18px;
      display: flex; flex-direction: column; gap: 14px;
    }
    .mc-top-bar {
      height: 16px; width: 55%; border-radius: 6px;
      background: rgba(255,255,255,.10);
    }
    .mc-cards { display: flex; gap: 10px; }
    .mc-card {
      flex: 1; border-radius: 12px; padding: 14px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .mc-c1 { background: rgba(56,189,248,.18); }
    .mc-c2 { background: rgba(14,58,110,.18); }
    .mc-c3 { background: rgba(10,22,40,.14); }
    .mc-card-bar { height: 6px; width: 60%; border-radius: 3px; background: rgba(255,255,255,.20); }
    .mc-card-val { height: 18px; width: 45%; border-radius: 4px; background: rgba(255,255,255,.15); }

    .mc-chart {
      display: flex; align-items: flex-end; gap: 8px; height: 80px;
      padding: 0 4px;
    }
    .mc-bar {
      flex: 1; border-radius: 6px 6px 0 0;
      animation: barGrow .6s ease-out both;
    }
    .b1 { height: 55%; background: rgba(56,189,248,.50); animation-delay: .1s; }
    .b2 { height: 80%; background: rgba(14,58,110,.65); animation-delay: .2s; }
    .b3 { height: 45%; background: rgba(56,189,248,.40); animation-delay: .3s; }
    .b4 { height: 90%; background: rgba(14,58,110,.75); animation-delay: .4s; }
    .b5 { height: 60%; background: rgba(56,189,248,.55); animation-delay: .5s; }
    .b6 { height: 70%; background: rgba(14,58,110,.60); animation-delay: .6s; }

    .mc-table { display: flex; flex-direction: column; gap: 6px; }
    .mc-row {
      height: 12px; border-radius: 4px;
      background: rgba(255,255,255,.07);
    }
    .mc-row:nth-child(2) { width: 85%; }
    .mc-row:nth-child(3) { width: 70%; }

    /* ── floating widgets ── */
    .float-widget {
      position: absolute;
      background: rgba(255,255,255,.92);
      backdrop-filter: blur(12px);
      border-radius: 16px;
      padding: 14px 18px;
      display: flex; align-items: center; gap: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,.10);
      border: 1px solid rgba(255,255,255,.7);
      animation: floatIn .5s ease-out both;
      transition: transform .2s;
    }
    .float-widget:hover { transform: translateY(-3px); }
    .fw-icon {
      width: 36px; height: 36px; border-radius: 10px;
      display: grid; place-items: center;
      background: linear-gradient(135deg, #d0e8f7, #a3cde8);
    }
    .fw-icon svg { width: 18px; height: 18px; color: #0e3a6e; }
    .fw-icon.leaf { background: linear-gradient(135deg, #d5f5e3, #a9dfbf); }
    .fw-icon.leaf svg { color: #1e8449; }
    .fw-label { font-size: 11px; color: #888; font-weight: 500; }
    .fw-val { font-size: 15px; font-weight: 800; color: #1a1a1a; margin-top: 2px; }

    .fw-pay { top: 2%; right: -8%; animation-delay: .3s; z-index: 2; }
    .fw-leave { bottom: 4%; left: -6%; animation-delay: .5s; z-index: 2; }
    .fw-pf { top: 28%; right: -12%; animation-delay: .7s; z-index: 2; }
    .fw-profile { bottom: 4%; right: -4%; animation-delay: .9s; z-index: 2; }
    .fw-approvals { top: 52%; left: -8%; animation-delay: 1.1s; z-index: 2; }

    .fw-icon.prof { background: linear-gradient(135deg, #c8e0f4, #9fc5e8); }
    .fw-icon.prof svg { color: #0a1628; }
    .fw-icon.appr { background: linear-gradient(135deg, #d0f0d6, #a3d9ab); }
    .fw-icon.appr svg { color: #1a6b2a; }

    .fw-donut {
      position: relative; width: 40px; height: 40px;
    }
    .fw-donut svg { width: 100%; height: 100%; }
    .donut-label {
      position: absolute; inset: 0;
      display: grid; place-items: center;
      font-size: 9px; font-weight: 900; color: #0e3a6e;
    }

    /* ═══ ANIMATIONS ═════════════════════════ */
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes float {
      0%,100% { transform: translateY(0); }
      50% { transform: translateY(-14px); }
    }
    @keyframes floatIn {
      from { opacity: 0; transform: translateY(18px) scale(.95); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes barGrow {
      from { transform: scaleY(0); }
      to   { transform: scaleY(1); }
    }

    /* ═══ RESPONSIVE ═════════════════════════ */
    @media (max-width: 960px) {
      .layout {
        grid-template-columns: 1fr;
        padding: 28px 20px;
        gap: 32px;
      }
      .card-col { align-items: center; }
      .card { max-width: 460px; }
      .illust-col { min-height: 360px; }
      .float-widget { display: none; }
      .mock-browser { transform: none; }
    }
    @media (max-width: 540px) {
      .layout { padding: 20px 14px; }
      .card { padding: 28px 22px 24px; border-radius: 22px; }
      .heading { font-size: 26px; }
      .illust-col { display: none; }
    }
  `],
})
export class EssLoginComponent implements OnInit, OnDestroy {
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

  private popstateHandler = this.onPopState.bind(this);

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
  }

  ngOnInit(): void {
    // Prevent browser back-button from returning to the previous authenticated page
    if (!this.auth.isLoggedIn()) {
      window.history.pushState(null, '', window.location.href);
      window.addEventListener('popstate', this.popstateHandler);
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('popstate', this.popstateHandler);
  }

  private onPopState(): void {
    if (!this.auth.isLoggedIn()) {
      window.history.pushState(null, '', window.location.href);
    }
  }

  checkCapsLock(e: KeyboardEvent): void {
    this.capsLockOn = e.getModifierState?.('CapsLock') ?? false;
  }

  @HostListener('window:keyup', ['$event'])
  clearCaps(e: KeyboardEvent): void {
    this.capsLockOn = e.getModifierState?.('CapsLock') ?? false;
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
