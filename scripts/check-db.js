const pool = require('../db');

(async () => {
  const { rows } = await pool.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`
  );
  console.table(rows);

  const fk = await pool.query(
    `SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
     FROM pg_constraint WHERE connamespace = 'public'::regnamespace`
  );
  console.table(fk.rows);

  for (const t of [...new Set(rows.map((r) => r.table_name))]) {
    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM "${t}"`);
    console.log(`${t}: ${c.rows[0].n} แถว`);
  }
})()
  .catch((err) => console.error('✘', err.message))
  .finally(() => pool.end());
