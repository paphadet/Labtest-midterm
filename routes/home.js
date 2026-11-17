const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => res.redirect(req.session.user ? '/home' : '/login'));

router.get('/home', requireLogin, async (req, res) => {
  // บันทึกการเข้าชม
  await pool.query(
    `INSERT INTO visit (visit_ip) VALUES ($1)
     ON CONFLICT (visit_ip) DO UPDATE SET last_visit_at = now()`,
    [req.ip]
  );
  // จำนวนผู้เข้าชม
  const { rows: [{ total: visitCount }] } = await pool.query(
    'SELECT COUNT(*)::int AS total FROM visit'
  );

  // ดึงสถิติการยืมหนังสือของผู้ใช้ที่ล็อกอินอยู่
  const { rows: [stats] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE return_at IS NULL)::int                             AS active,
       COUNT(*) FILTER (WHERE return_at IS NULL AND due_date < CURRENT_DATE)::int AS overdue
     FROM loans WHERE user_id = $1`,
    [req.session.user.id]
  );
  res.render('home', { title: 'หน้าแรก', user: req.session.user, stats, visitCount });
});

module.exports = router;
