/** Legal identities take precedence over legacy register labels and form numbers. */
const LEGAL_ACT_GROUPS: Readonly<Record<string, string>> = {
  WAGES_2019: 'CODE_ON_WAGES',
  OSH_2020: 'OSH_CODE',
  SOCIAL_SECURITY_2020: 'SOCIAL_SECURITY',
  TS_SHOPS_1988: 'SHOPS_ESTABLISHMENTS',
  SHOPS_2017: 'SHOPS_ESTABLISHMENTS',
  FACTORIES_1948: 'FACTORIES_ACT',
  CLRA_1970: 'CLRA',
};

export function matchesRegisterAct(
  row: { registerType?: string | null; legalIdentity?: { actCode?: string } | null },
  selectedAct: string,
  legacyTypes: ReadonlySet<string>,
): boolean {
  if (!selectedAct) return true;
  if (row.legalIdentity?.actCode) {
    return LEGAL_ACT_GROUPS[row.legalIdentity.actCode] === selectedAct;
  }
  return legacyTypes.has(row.registerType || '');
}
