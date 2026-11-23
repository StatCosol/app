// Real PDF generation and parsing with synthetic data only; no database or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFParse } = require('pdf-parse');
const dist = fs.existsSync(path.join(__dirname, '../dist/src')) ? '../dist/src' : '../dist';
const { generateObservationsPdfBuffer } = require(`${dist}/audits/utils/observations-pdf`);
async function main() {
  const scopes = [
    'TEST ONLY — Synthetic findings. Not an actual compliance report.',
    'Selected audit history includes labelled TEST ONLY findings; these are not actual compliance findings.',
    'Actual findings only. Synthetic test findings are excluded.',
  ];
  for (const [index, scopeNotice] of scopes.entries()) {
    for (const count of [0, 1, 12]) {
      const rows = Array.from({length:count}, (_, i) => ({
        sequenceNumber:i+1, observation:`TEST ONLY synthetic layout finding ${i+1}`,
        consequences:'Synthetic impact for layout testing.', complianceRequirements:'Synthetic requirement.',
        clause:'TEST', elaboration:'Isolated fixture only.', recommendation:'Review synthetic evidence.',
        risk:'LOW', status:'CLOSED', categoryName:'TEST ONLY', evidenceFilePaths:['test-only/evidence.pdf'],
      }));
      const buffer = await generateObservationsPdfBuffer({auditId:'synthetic-audit',auditCode:'TEST-ONLY-PDF',
        clientName:'Synthetic fixture company',branchName:'Synthetic unit',auditType:'OTHER',periodCode:'2099-12',scopeNotice,rows});
      const parser = new PDFParse({data:new Uint8Array(buffer)});
      try {
        const result = await parser.getText();
        const text = result.text.replace(/\s+/g,' ');
        assert.ok(text.includes(scopeNotice), `Missing scope warning for scope ${index}, ${count} rows`);
        assert.ok(text.includes('not a CRM-approved published final report'));
        if(count===0)assert.ok(text.includes('No observations were included'));
        else assert.ok(text.includes(`synthetic layout finding ${count}`));
        if(count===12)assert.ok(result.total>1);
      } finally { await parser.destroy(); }
      if(process.env.AUDITOR_PDF_OUTPUT_DIR){
        fs.mkdirSync(process.env.AUDITOR_PDF_OUTPUT_DIR,{recursive:true});
        fs.writeFileSync(path.join(process.env.AUDITOR_PDF_OUTPUT_DIR,`scope-${index}-${count}.pdf`),buffer);
      }
    }
  }
  console.log('PASS: 9 generated observation PDFs preserve scope warnings, empty-state text and multi-page findings');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
