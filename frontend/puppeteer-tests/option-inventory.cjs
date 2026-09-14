// Source inventory, not an assertion that every discovered option has been exercised.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const relative = (f) => path.relative(root, f).replaceAll('\\', '/');
const files = (d) =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]));
const cache = new Map();
function declarations(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(
    code,
    {
      exports,
      require: (name) => {
        const resolved = path.resolve(path.dirname(file), name + '.ts');
        if (name.startsWith('.') && resolved.endsWith('.routes.ts')) return declarations(resolved);
        // Read route declarations only. Never execute guards, page imports or application services.
        return new Proxy(
          {},
          {
            get:
              (_, guard) =>
              (...args) => ({ guard, args }),
          },
        );
      },
    },
    { filename: file, timeout: 5000 },
  );
  return exports;
}
async function main() {
  const { parseTemplate } = await import(pathToFileURL(require.resolve('@angular/compiler')).href);
  const routes = [];
  function flatten(rows, prefix = '', guards = []) {
    for (const r of rows) {
      const url = (prefix + '/' + (r.path || '')).replace(/\/+/g, '/');
      const inherited = [...guards, ...(r.canActivate || []), ...(r.canMatch || [])];
      routes.push({
        path: url,
        redirectTo: r.redirectTo,
        component: r.loadComponent?.name || r.component?.name,
        guards: inherited,
        parameterized: url.includes(':'),
        wildcard: url.includes('*'),
        status: 'UNVERIFIED',
      });
      if (r.children) flatten(r.children, url, [...inherited, ...(r.canActivateChild || [])]);
    }
  }
  flatten(declarations(path.join(root, 'frontend/src/app/app.routes.ts')).routes);
  const menu = declarations(path.join(root, 'frontend/src/app/core/menu/menu.config.ts')).APP_MENUS;
  const menuChecks = menu.map((m) => ({
    ...m,
    status: routes.some((r) => r.path === m.route) ? 'PASS' : 'FAIL',
    check: 'Declared route exists (navigation and action behavior not tested)',
  }));
  const options = [],
    templates = [],
    parseErrors = [];
  function template(text, file, owner, offset = 0) {
    const parsed = parseTemplate(text, file, { preserveWhitespaces: false });
    templates.push({ file: relative(file), owner });
    for (const e of parsed.errors || [])
      parseErrors.push({ file: relative(file), error: String(e) });
    const seen = new WeakSet();
    function walk(n) {
      if (!n || typeof n !== 'object' || seen.has(n)) return;
      seen.add(n);
      if (n.sourceSpan && n.outputs) {
        const attrs = Object.fromEntries((n.attributes || []).map((a) => [a.name, a.value]));
        const loc = {
          file: relative(file),
          owner,
          line: offset + n.sourceSpan.start.line + 1,
          element: n.name || n.tagName,
          label: attrs['aria-label'] || attrs.title || attrs.placeholder || attrs.name || '',
        };
        for (const o of n.outputs)
          options.push({
            ...loc,
            kind: 'event',
            event: o.name,
            expression: o.handler?.source || '',
            status: 'UNVERIFIED',
          });
        for (const i of n.inputs || [])
          if (['routerLink', 'ngModel', 'formControl', 'formControlName'].includes(i.name))
            options.push({
              ...loc,
              kind: i.name,
              expression: i.value?.source || '',
              status: 'UNVERIFIED',
            });
        for (const name of ['routerLink', 'href', 'formControlName'])
          if (attrs[name])
            options.push({ ...loc, kind: name, expression: attrs[name], status: 'UNVERIFIED' });
        if (['input', 'select', 'textarea', 'button', 'option'].includes(n.name))
          options.push({
            ...loc,
            kind: 'control',
            type: attrs.type || n.name,
            value: attrs.value,
            status: 'UNVERIFIED',
          });
      }
      // Only traverse template structure, not expression ASTs or source-file objects.
      for (const key of [
        'children',
        'branches',
        'cases',
        'empty',
        'placeholder',
        'loading',
        'error',
      ]) {
        const v = n[key];
        if (Array.isArray(v)) v.forEach(walk);
        else walk(v);
      }
    }
    parsed.nodes.forEach(walk);
  }
  for (const file of files(path.join(root, 'frontend/src/app')).filter((f) =>
    f.endsWith('.component.ts'),
  )) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function walk(n) {
      if (ts.isClassDeclaration(n)) {
        for (const d of (ts.canHaveDecorators(n) && ts.getDecorators(n)) || []) {
          if (
            !ts.isCallExpression(d.expression) ||
            d.expression.expression.getText(source) !== 'Component'
          )
            continue;
          const obj = d.expression.arguments[0];
          for (const p of obj?.properties || []) {
            const name = p.name?.getText(source),
              value = p.initializer;
            if (
              !value ||
              !(ts.isStringLiteralLike(value) || ts.isNoSubstitutionTemplateLiteral(value))
            )
              continue;
            if (name === 'template')
              template(
                value.text,
                file,
                n.name?.text,
                source.getLineAndCharacterOfPosition(value.getStart(source)).line,
              );
            if (name === 'templateUrl') {
              const html = path.resolve(path.dirname(file), value.text);
              template(fs.readFileSync(html, 'utf8'), html, n.name?.text);
            }
          }
        }
      }
      ts.forEachChild(n, walk);
    }
    walk(source);
  }
  options.forEach((o, i) => (o.id = 'UI-' + String(i + 1).padStart(5, '0')));
  const result = {
    scope:
      'Declaration inventory only. Controls/events may describe the same option; runtime-generated options and server policy require scenario tests.',
    routes,
    menuChecks,
    templates,
    options,
    parseErrors,
  };
  const output = path.join(root, 'tmp-art/option-audit');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'inventory.json'), JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        routes: routes.length,
        menu: menu.length,
        brokenMenuRoutes: menuChecks.filter((m) => m.status === 'FAIL'),
        templates: templates.length,
        optionDeclarations: options.length,
        parseErrors,
      },
      null,
      2,
    ),
  );
  if (parseErrors.length || menuChecks.some((m) => m.status === 'FAIL')) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
