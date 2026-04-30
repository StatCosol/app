const{Client}=require('pg');
const c=new Client({host:process.env.DB_HOST,port:+process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASS,database:process.env.DB_NAME,ssl:{rejectUnauthorized:false}});
(async()=>{
await c.connect();
const q="INSERT INTO register_templates(state_code,establishment_type,register_type,title,description,law_family,register_mode,frequency,applies_when,column_definitions) VALUES($1,'FACTORY',$2,$3,$4,'FACTORIES_ACT','CENTRAL_COMBINED',$5,'{}'::jsonb,'[]'::jsonb) ON CONFLICT(state_code,establishment_type,register_type) DO NOTHING";
const t=[
["ALL","NOTICE_PERIODS_OF_WORK","Notice of Periods of Work","Sec 61-63 Factories Act","EVENT_BASED"],
["ALL","CHILD_WORKER_REGISTER","Register of Child Workers","Sec 68-69 Factories Act","EVENT_BASED"],
["ALL","COMPENSATORY_HOLIDAY_REGISTER","Compensatory Holiday Register","Factories Act","MONTHLY"],
["ALL","LEAVE_BOOK","Leave Book","Factories Act","ANNUAL"],
["ALL","INSPECTION_BOOK","Inspection Book","Factories Act","EVENT_BASED"],
["ALL","DANGEROUS_OCCURRENCE_REGISTER","Dangerous Occurrence Register","Factories Act","EVENT_BASED"],
["ALL","PRESSURE_VESSEL_REGISTER","Pressure Vessel Register","Sec 31 Factories Act","EVENT_BASED"],
["ALL","LIFTING_MACHINE_REGISTER","Lifting Machine Register","Sec 29 Factories Act","EVENT_BASED"],
["ALL","HOIST_LIFT_REGISTER","Hoist Lift Register","Sec 28 Factories Act","EVENT_BASED"],
["ALL","MEDICAL_EXAMINATION_REGISTER","Medical Examination Register","Sec 87 Factories Act","EVENT_BASED"],
["ALL","HUMIDITY_REGISTER","Humidity Register","Factories Act","MONTHLY"],
["ALL","WHITEWASHING_RECORD","Whitewashing Record","Factories Act","EVENT_BASED"],
["ALL","HAZARDOUS_PROCESS_REGISTER","Hazardous Process Records","Factories Act","EVENT_BASED"],
["ALL","DANGEROUS_OPERATION_REGISTER","Dangerous Operation Records","Sec 87 Factories Act","EVENT_BASED"]
];
let ok=0;
for(const r of t){try{await c.query(q,r);ok++;}catch(e){console.error(r[1],e.message);}}
await c.query("UPDATE register_templates SET law_family='FACTORIES_ACT' WHERE register_type IN('ADULT_WORKER_REGISTER','ACCIDENT_REGISTER') AND law_family IS NULL");
const res=await c.query("SELECT register_type,title FROM register_templates WHERE law_family='FACTORIES_ACT' ORDER BY register_type");
console.log('Inserted:',ok,'. Total FACTORIES_ACT:',res.rowCount);
res.rows.forEach(r=>console.log(' -',r.register_type,':',r.title));
await c.end();
})().catch(e=>{console.error(e);process.exit(1);});
