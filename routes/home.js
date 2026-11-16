const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => res.redirect(req.session.user ? '/home' : '/login'));

router.get('/home', requireLogin, async (req, res) => {
  const { rows: [stats] } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE return_at IS NULL)::int                             AS active,
       COUNT(*) FILTER (WHERE return_at IS NULL AND due_date < CURRENT_DATE)::int AS overdue
     FROM loans WHERE user_id = $1`,
    [req.session.user.id]
  );
  res.render('home', { title: 'หน้าแรก', user: req.session.user, stats });
});

module.exports = router;
