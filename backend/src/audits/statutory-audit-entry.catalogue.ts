import { FACTORY_CATEGORIES } from './data/factory-checklist';

export interface EntryItem {
  id: string;
  serial: number;
  head: string;
  statute: string;
  legalProvision: string | null;
  auditParameter: string | null;
  description: string;
  relevantForm: string | null;
  dueDate: string | null;
  maxMarks: number;
  riskType: string;
  answerOptions: string[] | null;
}
export interface EntryCategory {
  name: string;
  items: EntryItem[];
}
export const CATALOGUE_VERSION = 'factory-exports-2026-11-04-v1';
export const ENTRY_CATEGORIES: EntryCategory[] = FACTORY_CATEGORIES;
export const MISSING_FACTORY_CATEGORIES = [
  'Telangana Factory_Part A_2018',
  'Arms Act 2018',
  'Dangerous Machine 2018',
  'Telengana_Fire Force_2018',
];
export const ENTRY_TYPES = [
  { value: 'FACTORY', label: 'Factory', available: true },
  { value: 'FACTORY_VENDOR', label: 'Factory Vendor', available: false },
  {
    value: 'SHOPS_ESTABLISHMENT',
    label: 'Shops & Establishments',
    available: false,
  },
  { value: 'SHOPS_VENDOR', label: 'Shops Vendor', available: false },
  { value: 'WAREHOUSE', label: 'Warehouse', available: false },
  { value: 'WAREHOUSE_VENDOR', label: 'Warehouse Vendor', available: false },
];

export function entryScore(
  items: EntryItem[],
  answers: { item_id: string; status: string }[],
) {
  const byId = new Map(answers.map((a) => [a.item_id, a]));
  let maximum = 0,
    obtained = 0;
  for (const item of items) {
    const answer = byId.get(item.id);
    if (!answer || answer.status === 'NOT_APPLICABLE') continue;
    maximum += item.maxMarks;
    if (answer.status === 'COMPLIED') obtained += item.maxMarks;
  }
  return {
    maximum,
    obtained,
    percentage: maximum ? Math.round((10000 * obtained) / maximum) / 100 : null,
  };
}
