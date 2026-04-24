import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { AuthService } from '../../core/auth.service';

type Step = 'reset' | 'done' | 'invalid';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
})
export class ResetPasswordComponent implements OnInit, OnDestroy {
  step: Step = 'reset';
  token = '';

  newPassword = '';
  confirmPassword = '';
  showNewPassword = false;
  showConfirmPassword = false;

  isLoading = false;
  error = '';

  currentYear = new Date().getFullYear();
  private destroy$ = new Subject<void>();

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.step = 'invalid';
    }
  }

  submitNewPassword(): void {
    this.error = '';

    if (!this.newPassword || !this.confirmPassword) {
      this.error = 'Please fill in both password fields';
      return;
    }
    if (this.newPassword.length < 8) {
      this.error = 'Password must be at least 8 characters';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Passwords do not match';
      return;
    }

    this.isLoading = true;
    this.auth
      .resetPassword(this.token, this.newPassword)
      .pipe(takeUntil(this.destroy$), timeout(15000), finalize(() => (this.isLoading = false)))
      .subscribe({
        next: () => {
          this.step = 'done';
        },
        error: (e) => {
          const msg = e?.error?.message || '';
          if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('invalid')) {
            this.step = 'invalid';
          } else {
            this.error = msg || 'Failed to reset password. Please try again.';
          }
        },
      });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  goToForgotPassword(): void {
    this.router.navigate(['/forgot-password']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
