import { Component, Input } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ThreadMessage } from '../../models/thread.model';
import { ThreadAttachmentComponent } from '../../../components/thread/thread-attachment.component';

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule, DatePipe, ThreadAttachmentComponent],
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
