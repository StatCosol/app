const {Client} = require('pg');
const c = new Client({host:process.env.DB_HOST,port:5432,user:process.env.DB_USER,password:process.env.DB_PASS,database:'statcompy',ssl:{rejectUnauthorized:false}});
c.connect()
  .then(() => c.query("SELECT a.id,a.employee_id,a.date::text,a.status,a.check_in::text,a.check_out::text,a.worked_hours::text,a.short_work_reason FROM attendance_records a ORDER BY a.date DESC LIMIT 10"))
  .then(r => { r.rows.forEach(x => console.log(JSON.stringify(x))); return c.end(); })
  .catch(e => console.error(e.message));
