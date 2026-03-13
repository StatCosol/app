import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThreadDetail } from '../../models/thread.model';
import { MessageBubbleComponent } from '../message-bubble/message-bubble.component';

@Component({
  selector: 'app-thread-view',
  standalone: true,
  imports: [CommonModule, MessageBubbleComponent],
  templateUrl: './thread-view.component.html',
})
export class ThreadViewComponent implements AfterViewChecked {
  @Input() loading = false;
  @Input() thread?: ThreadDetail;
  @Input() canClose = true;
  @Input() canResolve = false;
  @Input() canReopen = true;

  @Output() closeThread = new EventEmitter<void>();
  @Output() resolveThread = new EventEmitter<void>();
  @Output() reopenThread = new EventEmitter<void>();

  @ViewChild('messagesContainer') messagesContainer?: ElementRef;

  private lastMessageCount = 0;

  ngAfterViewChecked(): void {
    const count = this.thread?.messages?.length ?? 0;
    if (count !== this.lastMessageCount) {
      this.lastMessageCount = count;
      this.scrollToBottom();
    }
  }

  private scrollToBottom(): void {
    if (this.messagesContainer?.nativeElement) {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  get isOpen(): boolean {
    return !!this.thread && this.thread.status !== 'CLOSED' && this.thread.status !== 'RESOLVED';
  }

  get isClosed(): boolean {
    return this.thread?.status === 'CLOSED' || this.thread?.status === 'RESOLVED';
  }

  statusColor(s: string): string {
    switch (s) {
      case 'OPEN': return 'bg-blue-100 text-blue-700';
      case 'IN_PROGRESS': return 'bg-amber-100 text-amber-700';
      case 'RESPONDED': return 'bg-purple-100 text-purple-700';
      case 'RESOLVED': return 'bg-green-100 text-green-700';
      case 'CLOSED': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  }
}
