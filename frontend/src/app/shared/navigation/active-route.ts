/** Match whole path segments and prefer the most specific visible navigation item. */
export function activeNavigationRoute(url: string, routes: readonly string[]): string | undefined {
  const path = url.split(/[?#]/, 1)[0].replace(/^\/app(?=\/)/, '').replace(/\/+$/, '');
  return routes.filter(route => route && (path === route || path.startsWith(route + '/')))
    .sort((a, b) => b.length - a.length)[0];
}
