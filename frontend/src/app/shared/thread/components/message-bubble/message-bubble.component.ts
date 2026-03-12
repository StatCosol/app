import { Component, Input } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ThreadMessage } from '../../models/thread.model';

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './message-bubble.component.html',
})
export class MessageBubbleComponent {
  @Input() msg!: ThreadMessage;

  /** Roles treated as "outgoing" (right-aligned) */
  get isOutgoing(): boolean {
    const outgoing = ['ADMIN', 'CRM', 'CCO', 'CEO', 'AUDITOR'];
    return outgoing.includes(this.msg?.senderRole);
  }
}
