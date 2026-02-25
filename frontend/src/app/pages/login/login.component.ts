import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { AuthService } from '../../core/auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit, OnDestroy {
  email = '';
  password = '';
  showPassword = false;
  rememberMe = true;
  isLoading = false;
  error = '';
  emailFocused = false;
  passFocused = false;
  currentYear = new Date().getFullYear();
  private destroy$ = new Subject<void>();

  /** Listener reference so we can clean up on destroy */
  private popstateHandler = this.onPopState.bind(this);

  constructor(private auth: AuthService, private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // If user is already authenticated, redirect to their dashboard
    if (this.auth.isLoggedIn()) {
      const role = this.auth.getRoleCode();
      const redirects: Record<string, string> = {
        ADMIN: '/admin', CEO: '/ceo', CCO: '/cco', CRM: '/crm',
        AUDITOR: '/auditor', CLIENT: this.auth.isBranchUser() ? '/branch' : '/client',
        CONTRACTOR: '/contractor', PAYROLL: '/payroll', EMPLOYEE: '/ess',
      };
      this.router.navigateByUrl(redirects[role] || '/login');
      return;
    }

    // Push a fresh history entry so pressing "Back" stays on login.
    // If the user clicks Back, the popstate handler pushes them forward again.
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', this.popstateHandler);
  }

  submit(): void {
    this.error = '';

    if (!this.email.trim() || !this.password) {
      this.error = 'Please enter email and password';
      return;
    }

    this.isLoading = true;

    this.auth.login(this.email.trim(), this.password).pipe(
      takeUntil(this.destroy$),
      timeout(10000),
      finalize(() => { this.isLoading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
        this.isLoading = false;
        // Route based on role
          const role = this.auth.getRoleCode();
          const roleRedirects: Record<string, string> = {
            ADMIN: '/admin',
            CEO: '/ceo',
            CCO: '/cco',
            CRM: '/crm',
            AUDITOR: '/auditor',
            CLIENT: this.auth.isBranchUser() ? '/branch' : '/client',
            CONTRACTOR: '/contractor',
            PAYROLL: '/payroll',
            EMPLOYEE: '/ess',
          };

          this.router.navigateByUrl(roleRedirects[role] || '/login');
      },
      error: (e) => {
        this.isLoading = false;
        if (e?.status === 401 || e?.status === 403) {
          this.error = 'Invalid email or password';
        } else {
          this.error = e?.error?.message || 'Login failed. Please try again.';
        }
        this.cdr.detectChanges();
      },
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('popstate', this.popstateHandler);
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** If the user presses the browser Back button while on /login, push them forward again. */
  private onPopState(): void {
    if (!this.auth.isLoggedIn()) {
      window.history.pushState(null, '', window.location.href);
    }
  }
}
