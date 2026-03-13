/** Statuses for file decision workflow */
export type FileDecisionStatus =
  | 'PENDING'
  | 'UPLOADED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'REUPLOAD_REQUESTED'
  | 'LOCKED';

/** Metadata for a single uploaded file */
export interface FileMeta {
  id: string;
  name: string;
  url: string;
  sizeBytes?: number;
  mimeType?: string;
  uploadedAt: string;
  uploadedByRole?: string;
}

/** One row in the version-history timeline */
export interface FileHistoryItem {
  version: number;
  file: FileMeta;
  status: FileDecisionStatus;
  remark?: string;
  decidedAt?: string;
  decidedByRole?: string;
}

/** Config bag passed to UploadWidgetComponent */
export interface UploadConfig {
  label?: string;
  accept?: string;        // e.g. ".pdf,.jpg,.png"
  maxSizeMB?: number;     // e.g. 10
  multiple?: boolean;
  disabled?: boolean;
  showDropzone?: boolean;
}

/** Shape returned from send endpoints after upload */
export interface UploadResult {
  file: FileMeta;
  status: FileDecisionStatus;
}
