// Exercise changed dependency APIs without sending mail or contacting external services.
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');
const sanitizeHtml = require('sanitize-html');
(async () => {
  const mail = await nodemailer.createTransport({streamTransport:true,buffer:true}).sendMail({
    from:'Payroll <payroll@example.test>',to:'employee@example.test',subject:'Payroll preview',
    html:'<p>Preview only</p>',attachments:[{filename:'report.txt',content:'synthetic payroll'}],
  });
  assert.match(mail.message.toString(), /Payroll preview/);
  assert.match(mail.message.toString(), /report\.txt/);
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Workers');
  sheet.addRow(['Code','Salary']);sheet.addRow(['00063',18000]);
  // Data bars generate an extension ID through ExcelJS's UUID dependency.
  sheet.addConditionalFormatting({ref:'B2:B2',rules:[{type:'dataBar',cfvo:[{type:'min'},{type:'max'}],color:{argb:'FF116653'}}]});
  const bytes = await workbook.xlsx.writeBuffer(); const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(bytes);assert.equal(restored.getWorksheet('Workers').getCell('A2').value,'00063');
  assert.equal(restored.getWorksheet('Workers').getCell('B2').value,18000);
  const html = sanitizeHtml('<p>Safe</p><script>alert(1)</script><a href="javascript:alert(1)">Link</a>');
  assert.match(html, /Safe/);assert.ok(!html.includes('script') && !html.includes('javascript:'));
  console.log('PASS: mail generation without delivery, Excel data-bar/UUID round trip, and real sanitizer in Node.');
})().catch(error=>{console.error(error);process.exitCode=1;});
