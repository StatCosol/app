const { Client } = require('pg');
const client = new Client({
  host: 'statcompy-db.postgres.database.azure.com',
  port: 5432,
  user: 'Statcocompy',
  password: 'Statco@123',
  database: 'statcompy',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();
  
  // List all tables
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  console.log('=== TABLES ===');
  tables.rows.forEach(r => console.log('  ' + r.table_name));
  
  // Get columns for each table
  console.log('\n=== TABLE SCHEMAS ===');
  for (const t of tables.rows) {
    const cols = await client.query(
      "SELECT column_name, data_type, is_nullable, column_default, character_maximum_length FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
      [t.table_name]
    );
    console.log('\n--- ' + t.table_name + ' ---');
    cols.rows.forEach(c => {
      let type = c.data_type;
      if (c.character_maximum_length) type += '(' + c.character_maximum_length + ')';
      console.log('  ' + c.column_name.padEnd(35) + type.padEnd(30) + (c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL') + (c.column_default ? '  DEFAULT ' + c.column_default : ''));
    });
  }

  // Also show indexes
  console.log('\n=== INDEXES ===');
  const indexes = await client.query(
    "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname"
  );
  indexes.rows.forEach(r => console.log('  ' + r.indexname + ' ON ' + r.tablename));

  // Show foreign keys
  console.log('\n=== FOREIGN KEYS ===');
  const fks = await client.query(`
    SELECT tc.constraint_name, tc.table_name, kcu.column_name, 
           ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name
  `);
  fks.rows.forEach(r => console.log('  ' + r.table_name + '.' + r.column_name + ' -> ' + r.foreign_table_name + '.' + r.foreign_column_name));

  // Show enums
  console.log('\n=== ENUM TYPES ===');
  const enums = await client.query(
    "SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid ORDER BY t.typname, e.enumsortorder"
  );
  let currentEnum = '';
  enums.rows.forEach(r => {
    if (r.typname !== currentEnum) {
      currentEnum = r.typname;
      process.stdout.write('\n  ' + r.typname + ': ');
    }
    process.stdout.write(r.enumlabel + ', ');
  });
  console.log('');

  // Also show enums
  console.log('\n=== ENUM TYPES ===');
  const enums2 = await client.query(
    "SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid ORDER BY t.typname, e.enumsortorder"
  );
  let currentEnum2 = '';
  enums2.rows.forEach(r => {
    if (r.typname !== currentEnum2) {
      currentEnum2 = r.typname;
      process.stdout.write('\n  ' + r.typname + ': ');
    }
    process.stdout.write(r.enumlabel + ', ');
  });
  console.log('');

  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
