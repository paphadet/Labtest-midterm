const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { sendVerifyEmail } = require('../mailer');

const router = express.Router();
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// สร้าง token ใหม่ (อายุ 24 ชม.) เก็บลง DB แล้วส่งลิงก์ยืนยันไปที่อีเมล
async function sendNewVerifyLink(user) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `UPDATE "user" SET verify_token = $1, verify_token_expires = now() + interval '24 hours'
     WHERE user_id = $2`,
    [token, user.user_id]
  );
  await sendVerifyEmail(user.user_email, user.user_name, `${BASE_URL}/verify-email?token=${token}`);
}

// ---------- Register ----------

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/home');
  res.render('auth/register', { error: null, form: {} });
});

router.post('/register', async (req, res) => {
  const username = (req.body.username || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const confirmPassword = req.body.confirmPassword || '';
  const form = { username, email };
  const fail = (error) => res.status(400).render('auth/register', { error, form });

  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return fail('ชื่อผู้ใช้ต้องเป็น a-z, 0-9 หรือ _ ยาว 3-30 ตัว');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('รูปแบบอีเมลไม่ถูกต้อง');
  if (password.length < 8) return fail('รหัสผ่านต้องยาวอย่างน้อย 8 ตัว');
  if (password !== confirmPassword) return fail('รหัสผ่านทั้งสองช่องไม่ตรงกัน');

  // ตรวจสอบว่าชื่อผู้ใช้หรืออีเมลถูกใช้แล้วหรือไม่
  const existing = await pool.query(
    'SELECT user_name FROM "user" WHERE user_name = $1 OR user_email = $2',
    [username, email]
  );

  // ถ้าเจอ user ที่มีชื่อผู้ใช้หรืออีเมลซ้ำ → ส่ง error กลับไป
  if (existing.rows.length > 0) {
    const takenName = existing.rows.some((u) => u.user_name === username);
    return fail(takenName ? 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' : 'อีเมลนี้ถูกใช้แล้ว');
  }

  // ถ้าไม่ซ้ำ → บันทึก user ใหม่ลง DB
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO "user" (user_name, user_email, user_password)
     VALUES ($1, $2, $3)
     RETURNING user_id, user_name, user_email`,
    [username, email, hash]
  );

  // ส่งลิงก์ยืนยันอีเมล
  try {
    await sendNewVerifyLink(rows[0]);
  } catch (err) {
    // ส่งเมลไม่ได้ → ลบ user ทิ้ง จะได้สมัครใหม่ด้วยชื่อ/อีเมลเดิมได้
    console.error('ส่งอีเมลไม่สำเร็จ:', err.message);
    await pool.query('DELETE FROM "user" WHERE user_id = $1', [rows[0].user_id]);
    return res.status(500).render('auth/register', { error: 'ส่งอีเมลยืนยันไม่สำเร็จ ลองใหม่อีกครั้ง', form });
  }
  // สมัครสำเร็จ → ไปหน้า login พร้อมข้อความแจ้งให้ยืนยันอีเมล
  res.render('auth/login', {
    error: null,
    message: `สมัครสำเร็จ! ส่งลิงก์ยืนยันไปที่ ${email} แล้ว กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ`,
    form: { login: username },
  });
});

// ---------- Verify email ----------

router.get('/verify-email', async (req, res) => {
  const token = String(req.query.token || '');
  const { rows } = await pool.query(
    `UPDATE "user" SET is_verified = true, verify_token = NULL, verify_token_expires = NULL
     WHERE verify_token = $1 AND verify_token_expires > now()
     RETURNING user_name`,
    [token]
  );

  if (rows.length === 0) {
    return res.status(400).render('auth/login', {
      error: 'ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุแล้ว (ลอง login อีกครั้ง ระบบจะส่งลิงก์ใหม่ให้)',
      message: null,
      form: {},
    });
  }

  res.render('auth/login', {
    error: null,
    message: 'ยืนยันอีเมลสำเร็จ เข้าสู่ระบบได้เลย',
    form: { login: rows[0].user_name },
  });
});

// ---------- Login / Logout ----------

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/home');
  res.render('auth/login', { error: null, message: null, form: {} });
});

router.post('/login', async (req, res) => {
  const login = (req.body.login || '').trim(); // ชื่อผู้ใช้ หรือ อีเมล ก็ได้
  const password = req.body.password || '';
  const form = { login };
  const fail = (error) => res.status(400).render('auth/login', { error, message: null, form });

  if (!login || !password) return fail('กรุณากรอกชื่อผู้ใช้/อีเมล และรหัสผ่าน');

  // ดึง user จาก DB ตามชื่อผู้ใช้หรืออีเมล
  const { rows } = await pool.query(
    `SELECT user_id, user_name, user_email, user_password, is_verified
     FROM "user" WHERE user_name = $1 OR user_email = $2`,
    [login, login.toLowerCase()]
  );
  const user = rows[0];

  // ตรวจสอบรหัสผ่าน
  const ok = user && user.user_password && (await bcrypt.compare(password, user.user_password));
  if (!ok) return fail('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');

  if (!user.is_verified) {
    try {
      await sendNewVerifyLink(user);
    } catch (err) {
      console.error('ส่งอีเมลไม่สำเร็จ:', err.message);
      return fail('บัญชียังไม่ได้ยืนยันอีเมล และส่งลิงก์ยืนยันใหม่ไม่สำเร็จ');
    }
    return fail(`บัญชียังไม่ได้ยืนยันอีเมล ส่งลิงก์ยืนยันใหม่ไปที่ ${user.user_email} แล้ว`);
  }
  
  // เข้าสู่ระบบสำเร็จ → เก็บข้อมูล user ลง session แล้วไปหน้า home
  req.session.user = { id: user.user_id, username: user.user_name, email: user.user_email };
  res.redirect('/home');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;