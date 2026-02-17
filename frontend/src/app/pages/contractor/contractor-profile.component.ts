import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/auth.service';
import { PageHeaderComponent } from '../../shared/ui';

@Component({
  selector: 'app-contractor-profile',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent],
  templateUrl: './contractor-profile.component.html',
  styleUrls: ['./contractor-profile.component.scss'],
})
export class ContractorProfileComponent implements OnInit {
  user: any = null;

  constructor(private auth: AuthService) {}

  ngOnInit(): void {
    this.user = this.auth.getUser();
  }
}
