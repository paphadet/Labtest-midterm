const pool = require('./db');

async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('ต่อติดแล้ว! เวลาปัจจุบันจาก Supabase:', res.rows[0].now);
  } catch (err) {
    console.error('เชื่อมต่อไม่สำเร็จ:', err.message);
  } finally {
    await pool.end();
  }
}

testConnection();
