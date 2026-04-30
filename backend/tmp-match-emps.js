const ExcelJS = require('exceljs');

// System employee data (from payroll run API)
const sysEmps = [
  { code: 'LMSBRM0001', name: 'MAMIDI JAYALAKSHMI' },
  { code: 'LMSBRM0002', name: 'BUDDA BALAMMA' },
  { code: 'LMSBRM0003', name: 'BILAL NAJIR PINJARI' },
  { code: 'LMSBRM0004', name: 'BATTULA VASANTI' },
  { code: 'LMSBRM0005', name: 'THOTA PRAMEELA DEVI' },
  { code: 'LMSBRM0006', name: 'LOTLA VANAJA' },
  { code: 'LMSBRM0007', name: 'KONDA ARUNA' },
  { code: 'LMSBRM0008', name: 'GODHA RAMKUMAR' },
  { code: 'LMSBRM0009', name: 'SINGIPURU ROIG' },
  { code: 'LMSBRM0010', name: 'NARENDRA SINGH' },
  { code: 'LMSBRM0011', name: 'ASHOK KUMAR R H' },
  { code: 'LMSBRM0012', name: 'DASARI VANAJAKSHI' },
  { code: 'LMSBRM0013', name: 'MISALA VENAMMA' },
  { code: 'LMSBRM0014', name: 'K LAXMAMMA' },
  { code: 'LMSBRM0015', name: 'MEDAPURAM NAGA SAI SARVANI' },
  { code: 'LMSBRM0016', name: 'CHINTHAKAYALA RAJYALAXMI' },
  { code: 'LMSBRM0017', name: 'SHEELAM SAI PRIYA' },
  { code: 'LMSBRM0018', name: 'PULLADAGURTU RAMYA' },
  { code: 'LMSBRM0019', name: 'KANOORI LAXMI' },
  { code: 'LMSBRM0020', name: 'RAKATI CHINNA' },
  { code: 'LMSBRM0021', name: 'CHINTHAKUNTLA SAI TEJA' },
  { code: 'LMSBRM0022', name: 'NALLA SHIVA SAI KUMAR' },
  { code: 'LMSBRM0023', name: 'MOHAMMED IMRAN PASHA' },
  { code: 'LMSBRM0024', name: 'SATTA MANEESHA' },
  { code: 'LMSBRM0025', name: 'KATTU PALLI BHARGAVI' },
  { code: 'LMSBRM0026', name: 'KETA UMA MAHESWARA RAO' },
  { code: 'LMSBRM0027', name: 'VEMULAPALLI SAI HARIKA NAIDU' },
  { code: 'LMSBRM0028', name: 'NAGIREDDY DEVI' },
  { code: 'LMSBRM0029', name: 'SAVITRI' },
  { code: 'LMSBRM0030', name: 'Shanthi' },
  { code: 'LMSBRM0031', name: 'Bhagyavathy' },
];

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

function nameWords(name) {
  return name.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(w => w.length > 2);
}

function matchScore(sysName, sheetName) {
  const sysWords = nameWords(sysName);
  const sheetWords = nameWords(sheetName);
  let matches = 0;
  for (const sw of sheetWords) {
    for (const syW of sysWords) {
      if (syW.includes(sw) || sw.includes(syW)) {
        matches++;
        break;
      }
    }
  }
  return matches;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('C:\\Users\\statc\\Desktop\\March 2026 paysheet updated_8th April.xlsx');
  const ws = wb.worksheets[0];

  const sheetData = [];
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const sheetCode = String(row.getCell(2).value || '').trim();
    if (!sheetCode) continue;
    const sheetName = String(row.getCell(3).value || '').trim();
    const workDays = Number(row.getCell(14).value) || 0;
    const paidLeave = row.getCell(15).value;
    const payableDays = Number(row.getCell(16).value) || 0;
    sheetData.push({ sheetCode, sheetName, workDays, paidLeave: paidLeave ? Number(paidLeave) : 0, payableDays });
  }

  const usedSys = new Set();
  const mapping = [];

  for (const sd of sheetData) {
    let bestMatch = null;
    let bestScore = 0;
    for (const se of sysEmps) {
      if (usedSys.has(se.code)) continue;
      const score = matchScore(se.name, sd.sheetName);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = se;
      }
    }
    if (bestMatch && bestScore > 0) {
      usedSys.add(bestMatch.code);
      mapping.push({ ...sd, sysCode: bestMatch.code, sysName: bestMatch.name, score: bestScore });
    } else {
      mapping.push({ ...sd, sysCode: '???', sysName: 'NO MATCH', score: 0 });
    }
  }

  console.log('=== MAPPING ===');
  for (const m of mapping) {
    const elEarned = Math.round((m.workDays / 20) * 100) / 100;
    console.log(`${m.sheetCode} "${m.sheetName}" => ${m.sysCode} "${m.sysName}" | score=${m.score} | workDays=${m.workDays} elEarned=${elEarned} paidLeave=${m.paidLeave}`);
  }

  const unmatched = sysEmps.filter(e => !usedSys.has(e.code));
  if (unmatched.length) {
    console.log('\n=== UNMATCHED SYSTEM EMPLOYEES ===');
    for (const u of unmatched) {
      console.log(`${u.code} "${u.name}"`);
    }
  }
}

main();
