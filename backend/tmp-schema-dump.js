const { Client } = require('pg');
const fs = require('fs');
(async () => {
  const c = new Client({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'statcompy',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  var lines = [];
  function log(s) { lines.push(s); }

  var tables = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  log('=== TABLES (' + tables.rows.length + ') ===');

  for (var i = 0; i < tables.rows.length; i++) {
    var t = tables.rows[i].table_name;
    var cols = await c.query("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [t]);
    log('\n-- ' + t + ' (' + cols.rows.length + ' cols)');
    cols.rows.forEach(function(col) {
      var def = col.column_default ? ' DEFAULT ' + col.column_default.substring(0, 50) : '';
      log('  ' + col.column_name.padEnd(35) + col.data_type.padEnd(25) + (col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL') + def);
    });
  }

  var enums = await c.query("SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid ORDER BY t.typname, e.enumsortorder");
  log('\n\n=== ENUMS ===');
  var currentEnum = '';
  enums.rows.forEach(function(r) {
    if (r.typname !== currentEnum) { currentEnum = r.typname; log('\n' + r.typname + ':'); }
    log('  ' + r.enumlabel);
  });

  var idxs = await c.query("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname");
  log('\n\n=== INDEXES (' + idxs.rows.length + ') ===');
  idxs.rows.forEach(function(r) {
    log(r.indexname + ' ON ' + r.tablename + ': ' + r.indexdef.substring(r.indexdef.indexOf('(')));
  });

  var fks = await c.query("SELECT tc.table_name, tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' ORDER BY tc.table_name, tc.constraint_name");
  log('\n\n=== FOREIGN KEYS (' + fks.rows.length + ') ===');
  fks.rows.forEach(function(r) {
    log(r.table_name + '.' + r.column_name + ' -> ' + r.foreign_table_name + '.' + r.foreign_column_name + '  (' + r.constraint_name + ')');
  });

  fs.writeFileSync('/app/uploads/schema-dump.txt', lines.join('\n'));
  console.log('Written ' + lines.length + ' lines to /app/uploads/schema-dump.txt');
  await c.end();
})().catch(function(e) { console.error(e); process.exit(1); });
