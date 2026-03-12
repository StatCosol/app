export type ThreadType = 'TECHNICAL' | 'COMPLIANCE' | 'AUDIT' | 'GENERAL';
export type ThreadStatus = 'OPEN' | 'IN_PROGRESS' | 'RESPONDED' | 'RESOLVED' | 'CLOSED';
export type ThreadRole = 'ADMIN' | 'CRM' | 'CLIENT' | 'BRANCH' | 'CONTRACTOR' | 'AUDITOR' | 'PAYDEK' | 'CCO' | 'CEO';

export interface ThreadListItem {
  id: string;
  type: ThreadType;
  status: ThreadStatus;
  fromRole: ThreadRole;
  fromName?: string;
  subject: string;
  lastMessageAt: string;
  unread: boolean;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  clientName?: string;
  branchName?: string;
}

export interface ThreadAttachment {
  name: string;
  url: string;
}

export interface ThreadMessage {
  id: string;
  senderRole: ThreadRole;
  senderName?: string;
  message: string;
  createdAt: string;
  attachments?: ThreadAttachment[];
}

export interface ThreadDetail {
  id: string;
  type: ThreadType;
  status: ThreadStatus;
  subject: string;
  messages: ThreadMessage[];
}

export interface ThreadFilters {
  type?: ThreadType;
  status?: ThreadStatus;
  unread?: boolean;
  fromRole?: ThreadRole;
  q?: string;
  page?: number;
  limit?: number;
}
