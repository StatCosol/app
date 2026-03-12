export interface TimelineEvent {
  id?: string;
  title: string;
  createdAt: string;
  actorName?: string | null;
  actorRole?: string | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  comment?: string | null;
  attachmentsCount?: number;
}
