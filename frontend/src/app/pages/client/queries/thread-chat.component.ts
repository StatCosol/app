import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { finalize, timeout } from 'rxjs/operators';
import { ClientQueriesService } from '../../../core/client-queries.service';

@Component({
  standalone: true,
  selector: 'app-thread-chat',
  imports: [CommonModule, FormsModule],
  templateUrl: './thread-chat.component.html',
  styleUrls: ['./thread-chat.component.scss'],
})
export class ThreadChatComponent {
  id!: string;
  loading = false;
  sending = false;
  resolving = false;

  thread: any;
  messages: any[] = [];
  reply = '';

  constructor(private route: ActivatedRoute, private api: ClientQueriesService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id')!;
    this.load();
  }

  load() {
    this.loading = true;
    this.api.getThread(this.id).pipe(
      timeout(10000),
      finalize(() => { this.loading = false; this.cdr.detectChanges(); }),
    ).subscribe({
      next: (res:any) => {
        this.thread = res?.thread || res;
        this.messages = res?.messages || this.thread?.messages || [];
        this.cdr.detectChanges();
      },
      error: () => { this.cdr.detectChanges(); }
    });
  }

  send() {
    if (this.sending) return;
    if (!this.reply.trim()) return;
    this.sending = true;
    const msg = this.reply;
    this.reply = '';
    this.api.reply(this.id, { message: msg }).subscribe({
      next: () => { this.sending = false; this.cdr.detectChanges(); this.load(); },
      error: () => { this.sending = false; this.cdr.detectChanges(); }
    });
  }

  resolve() {
    if (this.resolving) return;
    this.resolving = true;
    this.api.resolveThread(this.id).subscribe({
      next: () => { this.resolving = false; this.cdr.detectChanges(); this.load(); },
      error: () => { this.resolving = false; this.cdr.detectChanges(); }
    });
  }

  escalationLabel(){
    if (this.thread?.resolvedAt) return 'Resolved';
    if (this.thread?.escalatedLevel === 'CEO') return 'Escalated to CEO';
    if (this.thread?.escalatedLevel === 'CCO') return 'Escalated to CCO';
    return 'Assigned to CRM/Admin';
  }
}
