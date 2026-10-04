// Synthetic fixtures only. No database, HTTP requests or payroll recalculation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFParse } = require('pdf-parse');
const { PayslipGeneratorService } = require('../dist/src/payroll/services/payslip-generator.service');
const { defaultPayslipLayout } = require('../dist/src/payroll/utils/payslip-layout');

async function main() {
  const service = Object.create(PayslipGeneratorService.prototype);
  const layout = defaultPayslipLayout();
  layout.settings.enabled = true;
  layout.sections[0].title = 'Custom Earnings';
  layout.sections[0].rows = [
    { type: 'COMPONENT', code: 'HRA', label: 'Housing allowance' },
    { type: 'COMPONENT', code: 'BASIC', label: 'Base salary' },
  ];
  const input = {
    run: { periodYear: 2026, periodMonth: 9 },
    runEmp: { employeeName: 'Sample Employee', employeeCode: 'TEST001', grossEarnings: '25000.25', totalDeductions: '1800.10', netPay: '23200.15' },
    client: { clientName: 'Sample Test Company' }, employee: null, components: [],
    valueMap: new Map([['BASIC', 15000], ['HRA', 10000.25], ['GROSS', 25000.25], ['PF_EMP', 1800.10], ['NET_PAY', 23200.15]]),
    layout: { isActive: true, layoutJson: layout },
  };
  const output = process.argv[2];
  if (output) fs.mkdirSync(output, { recursive: true });
  async function render(name, data) {
    const buffer = await service.renderPayslipPdf(data);
    assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      if (output) fs.writeFileSync(path.join(output, `${name}.pdf`), buffer);
      return parsed;
    } finally { await parser.destroy(); }
  }
  const custom = await render('custom-payslip', input);
  assert.ok(custom.text.indexOf('Housing allowance') < custom.text.indexOf('Base salary'));
  for (const expected of ['Custom Earnings', '25,000.25', '1,800.10', '23,200.15', 'Sample Employee', 'Net Pay']) assert.ok(custom.text.includes(expected), expected);
  const legacy = await render('legacy-payslip', { ...input, layout: null });
  assert.ok(!legacy.text.includes('Custom Earnings'));
  const disabled = structuredClone(layout); disabled.settings.enabled = false;
  const unchanged = await render('disabled-payslip', { ...input, layout: { isActive: true, layoutJson: disabled } });
  assert.equal(unchanged.text, legacy.text);
  const inactive = await render('inactive-payslip', { ...input, layout: { isActive: false, layoutJson: layout } });
  assert.equal(inactive.text, legacy.text);
  const intern = await render('intern-payslip', {
    ...input,
    run: { ...input.run, payrollCategory: 'INTERN' },
    runEmp: { ...input.runEmp, grossEarnings: '13000', totalDeductions: '0', netPay: '13000' },
    valueMap: new Map([['STIPEND', 13000], ['GROSS', 13000], ['NET_PAY', 13000]]),
  });
  assert.ok(intern.text.includes('Stipend'));
  assert.ok(intern.text.includes('13,000'));
  assert.ok(!intern.text.includes('Custom Earnings'), 'regular layouts must not hide the stipend');
  const long = structuredClone(layout);
  long.sections[0].rows = Array.from({ length: 45 }, (_, i) => ({ type: 'COMPONENT', code: `SAMPLE_${i}`, label: `Sample row ${i}: long descriptive earnings label to check wrapping and pagination` }));
  const many = await render('multipage-payslip', { ...input, layout: { isActive: true, layoutJson: long } });
  assert.ok(many.total >= 3);
  for (let i = 0; i < 45; i++) assert.ok(many.text.includes(`Sample row ${i}:`));
  assert.ok(many.text.includes('23,200.15'));
  console.log('PASS: custom labels/order, saved totals, disabled/inactive compatibility, and all 45 rows across pages');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
