/** Search only the role/entitlement-filtered menu supplied by the layout. */
export function filterNavigation<T extends { label: string; expanded?: boolean; items: { label: string }[] }>(groups: T[], search: string): T[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return groups;
  return groups.map(group => ({ ...group, expanded: true, items: group.items.filter(item => group.label.toLocaleLowerCase().includes(query) || item.label.toLocaleLowerCase().includes(query)) })).filter(group => group.items.length > 0);
}
