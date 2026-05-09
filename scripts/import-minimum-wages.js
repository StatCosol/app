// Bulk-import minimum-wage rows from a CSV file via the live API.
//
// Usage (PowerShell):
//   $env:STATCOMPY_API='https://statcompy-backend.<host>/api/v1'
//   $env:STATCOMPY_TOKEN='<jwt>'
//   node scripts/import-minimum-wages.js backend/seeds/minimum-wages-template.csv [--dry-run]
//
// CSV columns (header row required):
//   stateCode,skillCategory,scheduledEmployment,monthlyWage,dailyWage,
//   effectiveFrom,effectiveTo,source,notes
//
// Empty cells become null. Lines starting with '#' are ignored.

const fs = require('fs');
const path = require('path');

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (!lines.length) return [];
  const header = splitCsv(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsv(line);
    const row = {};
    header.forEach((h, i) => {
      const v = (cells[i] ?? '').trim();
      row[h.trim()] = v === '' ? null : v;
    });
    if (row.monthlyWage != null) row.monthlyWage = Number(row.monthlyWage);
    if (row.dailyWage != null) row.dailyWage = Number(row.dailyWage);
    return row;
  });
}

function splitCsv(line) {
  // Minimal CSV splitter (no embedded quotes/commas in values for our use).
  const out = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

(async () => {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  if (!file) {
    console.error('Usage: node import-minimum-wages.js <csv> [--dry-run]');
    process.exit(2);
  }
  const api = process.env.STATCOMPY_API;
  const tok = process.env.STATCOMPY_TOKEN;
  if (!api || !tok) {
    console.error('Set STATCOMPY_API and STATCOMPY_TOKEN env vars');
    process.exit(2);
  }
  const csv = fs.readFileSync(path.resolve(file), 'utf8');
  const rows = parseCsv(csv);
  console.log(`Parsed ${rows.length} rows from ${file}${dryRun ? ' (dry-run)' : ''}`);

  const res = await fetch(`${api}/minimum-wages/bulk-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ rows, dryRun }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text}`);
    process.exit(1);
  }
  const json = JSON.parse(text);
  console.log(JSON.stringify({ total: json.total, inserted: json.inserted, updated: json.updated, skipped: json.skipped, errors: json.errors }, null, 2));
  if (json.errors > 0) {
    console.error('Errors:');
    for (const r of json.results) if (r.outcome === 'error') console.error(`  [${r.index}] ${r.stateCode}/${r.skillCategory}/${r.effectiveFrom}: ${r.message}`);
    process.exit(1);
  }
})().catch((e) => { console.error(e); process.exit(1); });
