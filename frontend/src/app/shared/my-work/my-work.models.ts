export interface WorkItem {
  id: string;
  title: string;
  description: string | null;
  module: string;
  status: string;
  priority: string;
  client_id: string | null;
  branch_id: string | null;
  company_name: string | null;
  branch_name: string | null;
  due_date: string | null;
  overdue: boolean;
  reference_id: string | null;
}
export interface WorkResult {
  items: WorkItem[];
  pagination: { total: number; page: number };
  limit: number;
  asOf: string;
  generatedAt: string;
  summary: Record<string, number>;
  companies: { id: string; name: string }[];
  branches: { id: string; name: string; clientId: string }[];
  modules: string[];
}
