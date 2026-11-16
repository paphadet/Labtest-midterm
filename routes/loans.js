const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.use(requireLogin);

router.get('/', async (req, res) => {
  const userId = req.session.user.id;

  const { rows: activeLoans } = await pool.query(
    `SELECT l.loan_id, b.book_id, b.book_name, b.book_author,
            to_char(l.borrowed_at AT TIME ZONE 'Asia/Bangkok', 'DD/MM/YYYY') AS borrowed_text,
            to_char(l.due_date, 'DD/MM/YYYY') AS due_text,
            (CURRENT_DATE - l.due_date) AS days_late
     FROM loans l
     JOIN book b ON b.book_id = l.book_id
     WHERE l.user_id = $1 AND l.return_at IS NULL
     ORDER BY l.due_date`,
    [userId]
  );

  const { rows: history } = await pool.query(
    `SELECT b.book_name, b.book_author,
            to_char(l.borrowed_at AT TIME ZONE 'Asia/Bangkok', 'DD/MM/YYYY') AS borrowed_text,
            to_char(l.return_at AT TIME ZONE 'Asia/Bangkok', 'DD/MM/YYYY') AS returned_text,
            (l.return_at::date > l.due_date) AS was_late
     FROM loans l
     JOIN book b ON b.book_id = l.book_id
     WHERE l.user_id = $1 AND l.return_at IS NOT NULL
     ORDER BY l.return_at DESC
     LIMIT 20`,
    [userId]
  );

  res.render('loans/index', { title: 'หนังสือที่ฉันยืม', activeLoans, history });
});

router.post('/:id/return', async (req, res) => {
  const loanId = /^\d+$/.test(req.params.id) ? Number(req.params.id) : null;
  const userId = req.session.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE loans SET return_at = now()
       WHERE loan_id = $1 AND user_id = $2 AND return_at IS NULL
       RETURNING book_id`,
      [loanId, userId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      req.session.flash = { type: 'error', text: 'ไม่พบรายการยืมนี้ หรือคืนไปแล้ว' };
      return res.redirect('/loans');
    }

    const { rows: [book] } = await client.query(
      `UPDATE book SET book_available = book_available + 1, book_status = true
       WHERE book_id = $1 RETURNING book_name`,
      [rows[0].book_id]
    );

    await client.query('COMMIT');
    req.session.flash = { type: 'success', text: `คืน "${book.book_name}" เรียบร้อย` };
    res.redirect('/loans');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
