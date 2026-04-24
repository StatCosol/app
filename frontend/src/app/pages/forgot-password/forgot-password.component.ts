import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { AuthService } from '../../core/auth.service';

type Step = 'email' | 'sent';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent implements OnDestroy {
  step: Step = 'email';

  email = '';
  isLoading = false;
  error = '';

  currentYear = new Date().getFullYear();
  private destroy$ = new Subject<void>();

  constructor(private auth: AuthService, private router: Router) {}

  /** Request a password reset email */
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
        next: () => {
          this.step = 'sent';
        },
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
    this.router.navigate(['/login']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
