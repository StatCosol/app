export interface ThreadInboxItem {
  id: string;
  title: string;
  subtitle?: string | null;
  unreadCount?: number;
  priority?: string | null;
  status?: string | null;
  updatedAt?: string | null;
}

export interface ThreadMessage {
  id: string;
  senderName: string;
  senderRole?: string | null;
  body: string;
  createdAt: string;
  isInternal?: boolean;
  attachments?: Array<{ name?: string | null; url?: string | null }>;
}
