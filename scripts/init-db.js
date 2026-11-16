const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database.sql'), 'utf8');

  await pool.query(sql);

  const { rows: [count] } = await pool.query('SELECT COUNT(*)::int AS n FROM book');
  console.log(`✔ ตาราง book, loans พร้อมใช้ — ตอนนี้มีหนังสือ ${count.n} รายการ`);
}

main()
  .catch((err) => {
    console.error('✘ ไม่สำเร็จ:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
