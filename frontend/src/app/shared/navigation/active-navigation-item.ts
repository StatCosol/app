import { activeNavigationRoute } from './active-route';
export interface NavigationTarget { route: string; queryParams?: Record<string, string>; }
/** Select one most-specific destination, including links distinguished by query filters. */
export function activeNavigationItem<T extends NavigationTarget>(url: string, items: readonly T[]): T | undefined {
  const route = activeNavigationRoute(url, items.map(item => item.route));
  const params = new URLSearchParams((url.split('?')[1] || '').split('#')[0]);
  const matches = items.filter(item => item.route === route && Object.entries(item.queryParams || {}).every(([key,value]) =>
    params.get(key) === value || (key === 'type' && value === 'TASK' && !params.has(key))));
  return matches.sort((a,b) => Object.keys(b.queryParams || {}).length - Object.keys(a.queryParams || {}).length)[0];
}
/** Keep shortcuts, but also expose the current destination when it has no shortcut. */
export function collapsedNavigationItems<T extends NavigationTarget>(url: string, shortcuts: readonly T[], expanded: readonly T[]): T[] {
  const active = activeNavigationItem(url, expanded);
  const queryKey = (item: NavigationTarget) => JSON.stringify(Object.entries(item.queryParams || {}).filter(([key,value]) => !(key === 'type' && value === 'TASK')).sort());
  if (!active || shortcuts.some(item => item.route === active.route && queryKey(item) === queryKey(active))) return [...shortcuts];
  return [...shortcuts, active];
}
