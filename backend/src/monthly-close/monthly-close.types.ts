export type CloseArea = 'attendance' | 'payroll' | 'documents' | 'returns';
export type CloseState =
  | 'REVIEW'
  | 'RECORDED_CLEAR'
  | 'UNKNOWN'
  | 'UNAVAILABLE';

export interface CloseIssue {
  id: string;
  title: string;
  reason: string;
  owner: string;
  sourceId: string | null;
  dueDate: string | null;
}

export interface CloseStage {
  area: CloseArea;
  title: string;
  state: CloseState;
  total: number;
  outstanding: number;
  description: string;
  issues: CloseIssue[];
  truncated: boolean;
}

export function closeStage(
  area: CloseArea,
  title: string,
  total: number,
  outstanding: number,
  description: string,
  issues: CloseIssue[],
): CloseStage {
  return {
    area,
    title,
    total,
    outstanding,
    description,
    state:
      outstanding > 0 ? 'REVIEW' : total > 0 ? 'RECORDED_CLEAR' : 'UNKNOWN',
    issues: issues.slice(0, 100),
    truncated: outstanding > issues.length || issues.length > 100,
  };
}
