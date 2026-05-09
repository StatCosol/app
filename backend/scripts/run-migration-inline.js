const{Client}=require('pg');
(async()=>{
const c=new Client({host:process.env.DB_HOST,port:5432,user:process.env.DB_USER,password:process.env.DB_PASS,database:process.env.DB_NAME,ssl:{rejectUnauthorized:false}});
await c.connect();
console.log('connected');
var r;
r=await c.query('ALTER TABLE payroll_client_setup ADD COLUMN IF NOT EXISTS pf_gross_threshold numeric(14,2) DEFAULT 0');
console.log('alter:'+r.command);
r=await c.query("INSERT INTO payroll_statutory_slabs (id,client_id,state_code,component_code,from_amount,to_amount,value_amount,created_at) SELECT gen_random_uuid(),cs.client_id,'TS','PT',0,15000,0,NOW() FROM payroll_client_setup cs WHERE cs.pt_enabled=true AND NOT EXISTS(SELECT 1 FROM payroll_statutory_slabs s WHERE s.client_id=cs.client_id AND s.state_code='TS' AND s.component_code='PT' AND s.from_amount=0)");
console.log('slab1:'+r.rowCount);
r=await c.query("INSERT INTO payroll_statutory_slabs (id,client_id,state_code,component_code,from_amount,to_amount,value_amount,created_at) SELECT gen_random_uuid(),cs.client_id,'TS','PT',15001,20000,150,NOW() FROM payroll_client_setup cs WHERE cs.pt_enabled=true AND NOT EXISTS(SELECT 1 FROM payroll_statutory_slabs s WHERE s.client_id=cs.client_id AND s.state_code='TS' AND s.component_code='PT' AND s.from_amount=15001)");
console.log('slab2:'+r.rowCount);
r=await c.query("INSERT INTO payroll_statutory_slabs (id,client_id,state_code,component_code,from_amount,to_amount,value_amount,created_at) SELECT gen_random_uuid(),cs.client_id,'TS','PT',20001,NULL,200,NOW() FROM payroll_client_setup cs WHERE cs.pt_enabled=true AND NOT EXISTS(SELECT 1 FROM payroll_statutory_slabs s WHERE s.client_id=cs.client_id AND s.state_code='TS' AND s.component_code='PT' AND s.from_amount=20001)");
console.log('slab3:'+r.rowCount);
console.log('DONE');
await c.end();
})();
