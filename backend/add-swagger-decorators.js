/**
 * Script to add Swagger decorators to all NestJS controller files.
 * Adds @ApiTags, @ApiBearerAuth, and @ApiOperation decorators.
 */
const fs = require('fs');
const path = require('path');

// Map controller file paths (relative to backend/src) to their ApiTags
function getApiTag(filePath) {
  const rel = filePath.replace(/\\/g, '/');

  if (rel.includes('/auth/')) return 'Auth';
  if (rel.includes('/health/')) return 'Health';
  if (rel.includes('/users/')) return 'Users';
  if (rel.includes('/admin/')) return 'Admin';
  if (rel.includes('/clients/')) return 'Clients';
  if (rel.includes('/branches/')) return 'Branches';
  if (rel.includes('/employees/')) return 'Employees';
  if (rel.includes('/compliance-documents/')) return 'Compliance Documents';
  if (rel.includes('/branch-compliance/')) return 'Branch Compliance';
  if (rel.includes('/compliance/')) return 'Compliance';
  if (rel.includes('/compliances/')) return 'Compliance';
  if (rel.includes('/audits/')) return 'Audits';
  if (rel.includes('/auditor/')) return 'Auditor';
  if (rel.includes('/payroll/')) return 'Payroll';
  if (rel.includes('/ai/')) return 'AI';
  if (rel.includes('/notifications/')) return 'Notifications';
  if (rel.includes('/reports/')) return 'Reports';
  if (rel.includes('/ess/')) return 'ESS';
  if (rel.includes('/crm-documents/')) return 'CRM Documents';
  if (rel.includes('/crm/')) return 'CRM';
  if (rel.includes('/cco/')) return 'CCO';
  if (rel.includes('/ceo/')) return 'CEO';
  if (rel.includes('/dashboard/')) return 'Admin';
  if (rel.includes('/risk/')) return 'Risk';
  if (rel.includes('/sla/')) return 'SLA';
  if (rel.includes('/escalations/')) return 'Escalations';
  if (rel.includes('/helpdesk/')) return 'Helpdesk';
  if (rel.includes('/calendar/')) return 'Calendar';
  if (rel.includes('/files/')) return 'Files';
  if (rel.includes('/contractor/')) return 'Contractor';
  if (rel.includes('/safety-documents/')) return 'Safety Documents';
  if (rel.includes('/units/')) return 'Units';
  if (rel.includes('/applicability/')) return 'Applicability';
  if (rel.includes('/options/')) return 'Options';
  if (rel.includes('/masters/')) return 'Masters';
  if (rel.includes('/assignments/')) return 'Assignments';
  if (rel.includes('/checklists/')) return 'Checklists';
  if (rel.includes('/returns/')) return 'Returns';
  if (rel.includes('/nominations/')) return 'Nominations';
  if (rel.includes('/client-dashboard/')) return 'Clients';
  if (rel.includes('/legitx/')) return 'Compliance';
  if (rel.includes('/common/')) return 'Common';
  if (rel.includes('/list-queries/')) return 'List Queries';
  if (rel.includes('/access/')) return 'Access';
  if (rel.includes('/attendance/')) return 'Attendance';
  if (rel.includes('/cleanup/')) return 'Admin';
  if (rel.includes('/monthly-documents/')) return 'Compliance Documents';

  return 'General';
}

function isHealthController(filePath) {
  return filePath.replace(/\\/g, '/').includes('/health/');
}

// Generate a human-readable summary from method name and HTTP verb
function generateSummary(methodName, httpVerb) {
  // Convert camelCase to readable words
  const words = methodName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();

  return words;
}

function processController(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Skip if already has ApiTags (already processed)
  if (content.includes('@ApiTags(') || content.includes('ApiTags')) {
    console.log(`SKIP (already has swagger): ${filePath}`);
    return;
  }

  const tag = getApiTag(filePath);
  const isHealth = isHealthController(filePath);

  // Step 1: Add import statement
  // Find the last import line
  const importRegex = /^import\s+.*?(?:from\s+['"][^'"]+['"]|['"][^'"]+['"]);?\s*$/gm;
  let lastImportMatch = null;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    lastImportMatch = match;
  }

  // Handle multi-line imports - find the actual end
  const lines = content.split('\n');
  let lastImportLineIndex = -1;
  let inImport = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('import ') || line.trim().startsWith('import{')) {
      inImport = true;
    }
    if (inImport) {
      if (line.includes("from '") || line.includes('from "') || line.includes("from\t'")) {
        lastImportLineIndex = i;
        inImport = false;
      }
    }
  }

  if (lastImportLineIndex === -1) {
    console.log(`SKIP (no imports found): ${filePath}`);
    return;
  }

  // Insert swagger import after last import
  const swaggerImportParts = isHealth
    ? "{ ApiTags, ApiOperation }"
    : "{ ApiTags, ApiBearerAuth, ApiOperation }";
  const swaggerImport = `import ${swaggerImportParts} from '@nestjs/swagger';`;

  lines.splice(lastImportLineIndex + 1, 0, swaggerImport);

  // Step 2: Add class-level decorators before @Controller
  // Find @Controller decorator (could be preceded by other decorators)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('@Controller(')) {
      // Insert decorators before @Controller
      const indent = lines[i].match(/^(\s*)/)[1];
      if (isHealth) {
        lines.splice(i, 0, `${indent}@ApiTags('${tag}')`);
      } else {
        lines.splice(i, 0, `${indent}@ApiTags('${tag}')`, `${indent}@ApiBearerAuth('JWT')`);
      }
      break;
    }
  }

  // Step 3: Add @ApiOperation before each route handler decorator
  const httpVerbs = ['@Get(', '@Get()', '@Post(', '@Post()', '@Put(', '@Put()', '@Patch(', '@Patch()', '@Delete(', '@Delete()'];

  // Re-scan lines after modifications
  let finalLines = lines;
  let insertions = [];

  for (let i = 0; i < finalLines.length; i++) {
    const trimmed = finalLines[i].trim();

    // Check if this line starts with an HTTP method decorator
    let isHttpDecorator = false;
    let httpVerb = '';
    for (const verb of httpVerbs) {
      if (trimmed.startsWith(verb)) {
        isHttpDecorator = true;
        httpVerb = verb.replace(/[(@)]/g, '');
        break;
      }
    }

    if (!isHttpDecorator) continue;

    // Check that this is not already preceded by @ApiOperation
    let prevNonEmptyLine = '';
    for (let j = i - 1; j >= 0; j--) {
      if (finalLines[j].trim().length > 0) {
        prevNonEmptyLine = finalLines[j].trim();
        break;
      }
    }
    if (prevNonEmptyLine.includes('@ApiOperation')) continue;

    // Find the method name: scan forward to find the method declaration
    let methodName = 'Unknown';
    for (let j = i; j < Math.min(i + 10, finalLines.length); j++) {
      // Look for pattern: async? methodName( or methodName(
      const methodMatch = finalLines[j].match(/(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
      if (methodMatch && !finalLines[j].trim().startsWith('@') && !finalLines[j].trim().startsWith('//') && !finalLines[j].trim().startsWith('*')) {
        methodName = methodMatch[1];
        break;
      }
    }

    // Also extract the route path for better summaries
    let routePath = '';
    const routeMatch = trimmed.match(/@(?:Get|Post|Put|Patch|Delete)\(['"]([^'"]*)['"]\)/);
    if (routeMatch) {
      routePath = routeMatch[1];
    }

    const summary = generateSummary(methodName, httpVerb);
    const indent = finalLines[i].match(/^(\s*)/)[1];

    insertions.push({ index: i, line: `${indent}@ApiOperation({ summary: '${summary}' })` });
  }

  // Apply insertions in reverse order to maintain indices
  for (let k = insertions.length - 1; k >= 0; k--) {
    finalLines.splice(insertions[k].index, 0, insertions[k].line);
  }

  fs.writeFileSync(filePath, finalLines.join('\n'), 'utf8');
  console.log(`DONE: ${filePath}`);
}

// Find all controller files
function findControllers(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findControllers(fullPath));
    } else if (entry.name.endsWith('.controller.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

const srcDir = path.join(__dirname, 'src');
const controllers = findControllers(srcDir);

console.log(`Found ${controllers.length} controller files\n`);

for (const ctrl of controllers) {
  try {
    processController(ctrl);
  } catch (err) {
    console.error(`ERROR processing ${ctrl}: ${err.message}`);
  }
}

console.log('\nDone!');
