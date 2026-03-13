const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'backend', 'src');

function findControllerFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findControllerFiles(full));
    else if (entry.name.endsWith('.controller.ts')) results.push(full);
  }
  return results.sort();
}

function extractControllerPath(arg) {
  arg = arg.trim();
  // { path: 'xxx', version: '1' }
  let m = arg.match(/path:\s*'([^']*)'/);
  if (m) return m[1];
  m = arg.match(/path:\s*"([^"]*)"/);
  if (m) return m[1];
  // 'xxx' simple string
  m = arg.match(/^'([^']*)'$/);
  if (m) return m[1];
  m = arg.match(/^"([^"]*)"$/);
  if (m) return m[1];
  // ['health', 'api/health'] - array of paths
  m = arg.match(/\[([^\]]+)\]/);
  if (m) {
    const paths = m[1].match(/'([^']*)'/g);
    if (paths) return paths.map(p => p.replace(/'/g, '')).join(' | ');
  }
  return arg;
}

function extractVersion(arg) {
  const m = arg.match(/version:\s*'([^']*)'/);
  return m ? m[1] : '1';
}

const files = findControllerFiles(root);
const allEndpoints = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(root, file).replace(/\\/g, '/');
  const module = relPath.split('/')[0];

  // Find all controller classes - handle decorators that may span multiple lines
  // We need to find @Controller(...) followed by export class ClassName
  const controllerRegex = /@Controller\(([\s\S]*?)\)\s*(?:\/\/[^\n]*\n\s*)*(?:export\s+)?class\s+(\w+)/g;
  let cm;
  const classes = [];
  while ((cm = controllerRegex.exec(content)) !== null) {
    classes.push({
      fullMatch: cm[0],
      arg: cm[1],
      className: cm[2],
      index: cm.index,
      endIndex: cm.index + cm[0].length,
    });
  }

  for (let ci = 0; ci < classes.length; ci++) {
    const cls = classes[ci];
    const controllerPath = extractControllerPath(cls.arg);
    const version = extractVersion(cls.arg);

    // Get class body: from class declaration to next class or end of file
    const startIdx = cls.endIndex;
    const endIdx = ci + 1 < classes.length ? classes[ci + 1].index : content.length;
    const classBody = content.substring(cls.index, endIdx);

    // Check for class-level @Roles (before the @Controller)
    const beforeController = content.substring(
      ci > 0 ? classes[ci - 1].endIndex : 0,
      cls.index
    );
    let classRoles = '';
    const classRolesMatch = beforeController.match(/@Roles\(([^)]+)\)\s*$/);
    if (classRolesMatch) classRoles = classRolesMatch[1].trim();

    // Also check for UseGuards at class level
    let classGuards = '';
    const classGuardsMatch = beforeController.match(/@UseGuards\(([^)]+)\)/);
    if (classGuardsMatch) classGuards = classGuardsMatch[1].trim();

    // Find HTTP method endpoints
    // Pattern: optional decorators, then @Get/@Post/etc, then method name
    const methodRegex = /@(Get|Post|Put|Patch|Delete|Head|Options|All)\(([^)]*)\)/g;
    let mm;
    const endpoints = [];
    while ((mm = methodRegex.exec(classBody)) !== null) {
      const httpVerb = mm[1].toUpperCase();
      let routePath = mm[2].trim().replace(/^['"]|['"]$/g, '');

      // Look backwards from this decorator to find @Roles
      const beforeMethod = classBody.substring(0, mm.index);
      const lines = beforeMethod.split('\n');
      // Check last 8 lines for @Roles decorator
      const nearbyLines = lines.slice(-8).join('\n');
      let methodRoles = '';
      const rolesMatches = nearbyLines.match(/@Roles\(([^)]+)\)/);
      if (rolesMatches) methodRoles = rolesMatches[1].trim();

      // Find the method name after the decorator
      const afterDecorator = classBody.substring(mm.index + mm[0].length);
      // Skip any additional decorators, then find method name
      const methodNameMatch = afterDecorator.match(/(?:@\w+\([^)]*\)\s*)*(?:async\s+)?(\w+)\s*\(/);
      const methodName = methodNameMatch ? methodNameMatch[1] : '(unknown)';

      const effectiveRoles = methodRoles || classRoles || '(none/JWT only)';

      // Build full URL
      let fullUrl = `/api/v${version}`;
      if (controllerPath) fullUrl += `/${controllerPath}`;
      if (routePath) fullUrl += `/${routePath}`;
      fullUrl = fullUrl.replace(/\/+/g, '/');

      endpoints.push({
        module,
        file: relPath,
        className: cls.className,
        controllerPath,
        httpMethod: httpVerb,
        routePath,
        fullUrl,
        methodName,
        roles: effectiveRoles,
      });
    }

    if (endpoints.length === 0) {
      endpoints.push({
        module,
        file: relPath,
        className: cls.className,
        controllerPath,
        httpMethod: '(none)',
        routePath: '',
        fullUrl: `/api/v${version}/${controllerPath}`,
        methodName: '(no endpoints)',
        roles: classRoles || '(none)',
      });
    }

    allEndpoints.push(...endpoints);
  }
}

// Clean up roles for display
function cleanRoles(roles) {
  return roles
    .replace(/Role\./g, '')
    .replace(/['"`]/g, '')
    .trim();
}

function testUser(roles) {
  const r = roles.toLowerCase();
  if (r.includes('admin')) return 'admin@statcosol.com';
  if (r.includes('client')) return 'testclient@test.com';
  if (r.includes('crm') || r.includes('auditor') || r.includes('ceo') || r.includes('cco'))
    return 'admin@statcosol.com (need role-specific user)';
  if (r.includes('branch') || r.includes('contractor'))
    return 'admin@statcosol.com (need role-specific user)';
  if (r.includes('paydek') || r.includes('pf_team') || r.includes('pf-team'))
    return 'admin@statcosol.com (need role-specific user)';
  if (r.includes('none') || r.includes('jwt'))
    return 'any authenticated user';
  return 'admin@statcosol.com (likely)';
}

// Group by module
const byModule = {};
for (const ep of allEndpoints) {
  if (!byModule[ep.module]) byModule[ep.module] = [];
  byModule[ep.module].push(ep);
}

let output = `# Backend Controller Inventory\n`;
output += `Generated: ${new Date().toISOString()}\n`;
output += `Total endpoints: ${allEndpoints.length}\n`;
output += `Total controller classes: ${new Set(allEndpoints.map(e => e.className)).size}\n`;
output += `Total files: ${new Set(allEndpoints.map(e => e.file)).size}\n`;
output += `Total modules: ${Object.keys(byModule).length}\n\n`;

// Test users reference
output += `## Test Users\n`;
output += `| Email | Password | Role | ClientId |\n`;
output += `|-------|----------|------|----------|\n`;
output += `| admin@statcosol.com | Admin@123 | ADMIN | - |\n`;
output += `| testclient@test.com | Test@123 | CLIENT | 512cf437-ef2a-4b87-81ab-905a3f4813fe |\n\n`;

output += `## Global Prefix: \`api\`, URI Versioning default: \`v1\`\n`;
output += `Base URL: \`http://localhost:3000/api/v1/...\`\n\n`;
output += `---\n\n`;

const sortedModules = Object.keys(byModule).sort();
for (const mod of sortedModules) {
  const endpoints = byModule[mod];
  output += `## Module: \`${mod}\`\n\n`;

  // Group by file
  const byFile = {};
  for (const ep of endpoints) {
    if (!byFile[ep.file]) byFile[ep.file] = [];
    byFile[ep.file].push(ep);
  }

  for (const file of Object.keys(byFile).sort()) {
    const eps = byFile[file];
    output += `### ${file}\n\n`;

    // Group by class
    const byClass = {};
    for (const ep of eps) {
      if (!byClass[ep.className]) byClass[ep.className] = [];
      byClass[ep.className].push(ep);
    }

    for (const cls of Object.keys(byClass)) {
      const classEps = byClass[cls];
      output += `**${cls}** — Controller path: \`${classEps[0].controllerPath}\`\n\n`;
      output += `| Method | Full URL | Handler | Roles | Test User |\n`;
      output += `|--------|----------|---------|-------|-----------|\n`;
      for (const ep of classEps) {
        const roles = cleanRoles(ep.roles);
        const user = testUser(roles);
        output += `| ${ep.httpMethod} | \`${ep.fullUrl}\` | ${ep.methodName} | ${roles} | ${user} |\n`;
      }
      output += `\n`;
    }
  }
  output += `---\n\n`;
}

fs.writeFileSync(
  path.join(__dirname, 'CONTROLLER_INVENTORY.md'),
  output,
  'utf8'
);

console.log(`Done!`);
console.log(`Total endpoints: ${allEndpoints.length}`);
console.log(`Total controller classes: ${new Set(allEndpoints.map(e => e.className)).size}`);
console.log(`Total files: ${new Set(allEndpoints.map(e => e.file)).size}`);
console.log(`Total modules: ${Object.keys(byModule).length}`);
console.log(`Output: CONTROLLER_INVENTORY.md`);
