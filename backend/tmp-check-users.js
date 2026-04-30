const { Client } = require('pg');

(async () => {
  const client = new Client({
    host: 'statcompy-db.postgres.database.azure.com',
    port: 5432,
    user: 'Statcocompy',
    password: 'Statco@123',
    database: 'statcompy',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  const result = await client.query(`
    select id, email, name, is_active, deleted_at
    from users
    where lower(email) in (
      lower('it_admin@statcosol.com'),
      lower('admin@statcosol.com'),
      lower('compliance@statcosol.com')
    )
    order by created_at desc
    limit 20
  `);

  console.log(JSON.stringify(result.rows, null, 2));
  await client.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
