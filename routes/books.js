const express = require('express');
const pool = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

const LOAN_DAYS = 7;
const MAX_ACTIVE_LOANS = 3;

router.use(requireLogin);

function parseId(value) {
  return /^\d+$/.test(value) ? Number(value) : null;
}

router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  const category = (req.query.category || '').trim();

  const conditions = [];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(book_name ILIKE $${params.length} OR book_author ILIKE $${params.length})`);
  }
  if (category) {
    params.push(category);
    conditions.push(`book_category = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows: books } = await pool.query(
    `SELECT book_id, book_name, book_author, book_category, book_total, book_available
     FROM book ${where}
     ORDER BY book_name`,
    params
  );

  const { rows: cats } = await pool.query(
    `SELECT DISTINCT book_category FROM book
     WHERE book_category IS NOT NULL ORDER BY book_category`
  );

  res.render('books/index', {
    title: 'รายการหนังสือ',
    books,
    q,
    category,
    categories: cats.map((c) => c.book_category),
  });
});

router.get('/:id', async (req, res, next) => {
  const bookId = parseId(req.params.id);
  if (!bookId) return next();

  const { rows } = await pool.query('SELECT * FROM book WHERE book_id = $1', [bookId]);
  const book = rows[0];
  if (!book) return next();

  const { rows: mine } = await pool.query(
    `SELECT to_char(due_date, 'DD/MM/YYYY') AS due_text
     FROM loans WHERE user_id = $1 AND book_id = $2 AND return_at IS NULL`,
    [req.session.user.id, bookId]
  );

  res.render('books/show', {
    title: book.book_name,
    book,
    myLoan: mine[0] || null,
    loanDays: LOAN_DAYS,
  });
});

class BorrowError extends Error {}

router.post('/:id/borrow', async (req, res, next) => {
  const bookId = parseId(req.params.id);
  if (!bookId) return next();
  const userId = req.session.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT book_name, book_available FROM book WHERE book_id = $1 FOR UPDATE',
      [bookId]
    );
    const book = rows[0];

    if (!book) throw new BorrowError('ไม่พบหนังสือเล่มนี้');
    if (book.book_available <= 0) throw new BorrowError('หนังสือเล่มนี้ถูกยืมหมดแล้ว');

    const { rows: dup } = await client.query(
      'SELECT 1 FROM loans WHERE user_id = $1 AND book_id = $2 AND return_at IS NULL',
      [userId, bookId]
    );
    if (dup.length > 0) throw new BorrowError('คุณยืมหนังสือเล่มนี้อยู่แล้ว');

    const { rows: [{ n }] } = await client.query(
      'SELECT COUNT(*)::int AS n FROM loans WHERE user_id = $1 AND return_at IS NULL',
      [userId]
    );
    if (n >= MAX_ACTIVE_LOANS) {
      throw new BorrowError(`ยืมได้สูงสุด ${MAX_ACTIVE_LOANS} เล่ม กรุณาคืนก่อนยืมเพิ่ม`);
    }

    await client.query(
      `INSERT INTO loans (user_id, book_id, due_date)
       VALUES ($1, $2, CURRENT_DATE + $3::int)`,
      [userId, bookId, LOAN_DAYS]
    );

    await client.query(
      `UPDATE book
       SET book_available = book_available - 1,
           book_status    = (book_available - 1) > 0
       WHERE book_id = $1`,
      [bookId]
    );

    await client.query('COMMIT');

    req.session.flash = {
      type: 'success',
      text: `ยืม "${book.book_name}" สำเร็จ กำหนดคืนภายใน ${LOAN_DAYS} วัน`,
    };
    res.redirect('/loans');
  } catch (err) {
    await client.query('ROLLBACK');

    if (err instanceof BorrowError) {
      req.session.flash = { type: 'error', text: err.message };
      return res.redirect(`/books/${bookId}`);
    }
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
