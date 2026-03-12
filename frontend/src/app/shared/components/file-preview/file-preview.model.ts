export interface FileVersionItem {
  id: string;
  label: string;
  createdAt?: string | null;
  uploaderName?: string | null;
  url?: string | null;
}

export interface SharedFilePreviewData {
  id: string;
  name: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  uploaderName?: string | null;
  uploadedAt?: string | null;
  dueDate?: string | null;
  status?: string | null;
  rejectionReason?: string | null;
  queryType?: string | null;
  url?: string | null;
  versions?: FileVersionItem[];
}
