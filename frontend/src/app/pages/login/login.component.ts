import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { AuthService } from '../../core/auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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

  constructor(private auth: AuthService, private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // If user is already authenticated, redirect to their dashboard
    if (this.auth.isLoggedIn()) {
      this.redirectByRole();
      return;
    }

    // Replace current history entry so Back doesn't return to a pre-login page.
    // Using replaceState (not pushState) avoids adding a session history item
    // without user interaction, which browsers now flag and skip.
    window.history.replaceState(null, '', window.location.href);
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

        this.auth.fetchMe().subscribe({
          next: () => {
            this.redirectByRole();
          },
          error: () => {
            this.redirectByRole();
          }
        });
      },
      error: (e) => {
        this.isLoading = false;
        const msg = e?.error?.message || '';
        if (msg.toLowerCase().includes('ess portal')) {
          this.error = msg;
        } else if (e?.status === 401 || e?.status === 403) {
          this.error = 'Invalid email or password';
        } else {
          this.error = msg || 'Login failed. Please try again.';
        }
        this.cdr.detectChanges();
      },
    });
  }

  /**
   * Single redirect method used by both ngOnInit (already logged in)
   * and submit success. Uses the centralized getRoleRedirectPath() from AuthService.
   */
  private redirectByRole(): void {
    const role = this.auth.getRoleCode();
    const redirectPath = this.auth.getRoleRedirectPath(role);

    if (!redirectPath) {
      // Unknown / invalid role — show error and logout
      this.error = `Unrecognized role "${role}". Please contact your administrator.`;
      this.auth.logoutOnce('invalid role');
      this.cdr.detectChanges();
      return;
    }

    this.router.navigateByUrl(redirectPath);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
