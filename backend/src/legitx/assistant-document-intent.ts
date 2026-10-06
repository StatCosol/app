export interface DocumentIntent {
  kind:
    | 'APPOINTMENT'
    | 'PAYSLIP'
    | 'FNF'
    | 'LIBRARY'
    | 'CONTRACTOR'
    | 'AUDIT_EVIDENCE';
  category?: string;
  subCategory?: string;
  employeeName?: string;
  branchName?: string;
  month?: number;
  year?: number;
  latest?: boolean;
  contractorName?: string;
  pending?: boolean;
  nonComplianceId?: string;
  variant?: 'CERTIFICATE' | 'RENEWAL' | 'CHALLAN' | 'ACKNOWLEDGEMENT';
}

// Deterministic read vocabulary: document requests never go to the language model.
export function documentIntent(request: string): DocumentIntent | null {
  const text = request.trim().replace(/[’]/g, "'");
  const years = text.match(/\b20\d{2}\b/g) || [];
  const monthNames =
    text.match(
      /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
    ) || [];
  if (
    years.length > 1 ||
    monthNames.length > 1 ||
    (/\blast month\b/i.test(text) && (years.length || monthNames.length))
  )
    return null;
  if (
    !/^(show|open|view|find)\b/i.test(text) ||
    /\b(upload|replace|delete|approve|reject|close|publish|share|send|post|change|update|edit)\b/i.test(
      text,
    )
  )
    return null;
  const employee =
    /^(?:show|open|view|find)\s+(.+?)(?:'s)?\s+(?:last\s+|latest\s+)?(appointment letter|payslip|f&f(?: settlement)?(?: statement)?)\.?$/i.exec(
      text,
    );
  if (employee)
    return {
      kind: /appointment/i.test(employee[2])
        ? 'APPOINTMENT'
        : /payslip/i.test(employee[2])
          ? 'PAYSLIP'
          : 'FNF',
      employeeName: employee[1].replace(/'s$/i, '').trim(),
      latest: /\b(last|latest)\b/i.test(text),
    };
  const contractor =
    /^(?:show|open|view|find)\s+(?:the\s+)?contractor\s+(.+?)(?:'s)?\s+(pending\s+)?documents\.?$/i.exec(
      text,
    );
  if (contractor)
    return {
      kind: 'CONTRACTOR',
      contractorName: contractor[1].replace(/'s$/i, '').trim(),
      pending: !!contractor[2],
    };
  const evidence =
    /^(?:show|open|view|find)\s+(?:the\s+)?(?:audit\s+)?evidence\s+(?:uploaded\s+)?for\s+(?:this\s+)?(?:non-compliance|non compliance|NC)(?:\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?\.?$/i.exec(
      text,
    );
  if (evidence)
    return {
      kind: 'AUDIT_EVIDENCE',
      nonComplianceId: evidence[1]?.toLowerCase(),
    };
  let intent: DocumentIntent | null = null;
  if (/\bPF (challan|acknowledgement|acknowledgment)\b/i.test(text))
    intent = {
      kind: 'LIBRARY',
      category: 'RETURN',
      subCategory: 'PF',
      variant: /\bchallan\b/i.test(text) ? 'CHALLAN' : 'ACKNOWLEDGEMENT',
    };
  else if (/\bESI (challan|acknowledgement|acknowledgment)\b/i.test(text))
    intent = {
      kind: 'LIBRARY',
      category: 'RETURN',
      subCategory: 'ESI',
      variant: /\bchallan\b/i.test(text) ? 'CHALLAN' : 'ACKNOWLEDGEMENT',
    };
  else if (/\bbonus register\b/i.test(text))
    intent = { kind: 'LIBRARY', category: 'REGISTER', subCategory: 'BONUS' };
  else if (/\baudit report\b/i.test(text))
    intent = { kind: 'LIBRARY', category: 'AUDIT_REPORT' };
  else if (
    /\b(shops|establishment)\b.*\b(registration|license|renewal)\b/i.test(text)
  )
    intent = {
      kind: 'LIBRARY',
      category: 'LICENSE',
      subCategory: 'SHOPS',
      variant: /\brenewal\b/i.test(text) ? 'RENEWAL' : 'CERTIFICATE',
    };
  if (!intent) return null;
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  intent.month =
    months.findIndex((month) => new RegExp(`\\b${month}\\b`, 'i').test(text)) +
      1 || undefined;
  const year = /\b(20\d{2})\b/.exec(text);
  intent.year = year ? Number(year[1]) : undefined;
  const branch = /\bfor\s+(.+?)\s+branch\b/i.exec(text);
  intent.branchName = branch?.[1].trim();
  // Reject context we cannot resolve rather than silently opening another entity's file.
  const remaining = text
    .replace(/^(show|open|view|find)\s+(?:the\s+)?/i, '')
    .replace(
      /(?:PF|ESI) (?:challan|acknowledgement|acknowledgment)|(?:Form A\s+)?bonus register|audit report|(?:shops(?:\s+and|\s+&)?)?\s*(?:and\s+)?establishment (?:registration|license|renewal)|shops (?:registration|license|renewal)/gi,
      '',
    )
    .replace(/\bfor\s+.+?\s+branch\b/i, '')
    .replace(/\b(?:for\s+)?last month\b/i, '')
    .replace(
      new RegExp(
        `\\b(?:for\\s+)?(${months.join('|')})(?:\\s+20\\d{2})?\\b`,
        'i',
      ),
      '',
    )
    .replace(/\b20\d{2}\b/g, '')
    .replace(/[.?,]/g, '')
    .trim();
  if (remaining) return null;
  return intent;
}
