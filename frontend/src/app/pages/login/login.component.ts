import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, timeout } from 'rxjs/operators';
import { AuthService } from '../../core/auth.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  email = '';
  password = '';
  isLoading = false;
  error = '';

  constructor(private auth: AuthService, private router: Router, private cdr: ChangeDetectorRef) {}

  submit(): void {
    this.error = '';

    if (!this.email.trim() || !this.password) {
      this.error = 'Please enter email and password';
      return;
    }

    this.isLoading = true;

    this.auth.login(this.email.trim(), this.password).pipe(
      timeout(10000),
      finalize(() => { this.isLoading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: () => {
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
          };

          this.router.navigateByUrl(roleRedirects[role] || '/login');
      },
      error: (e) => {
        if (e?.status === 401 || e?.status === 403) {
          this.error = 'Invalid email or password';
        } else {
          this.error = e?.error?.message || 'Login failed. Please try again.';
        }
        this.cdr.detectChanges();
      },
    });
  }
}
