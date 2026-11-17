require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool = require('./db');

const homeRoutes = require('./routes/home');
const authRoutes = require('./routes/auth');
const bookRoutes = require('./routes/books');
const loanRoutes = require('./routes/loans');
const userRoutes = require('./routes/user');

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));

if (isProduction) app.set('trust proxy', 1);

// ตั้งค่า session
app.use(session({
  store: new pgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 2,
  },
}));

// middleware สำหรับส่งข้อมูล user และ flash message ไปยัง view
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;

  res.locals.flash = req.session.flash || null;
  delete req.session.flash;

  next();
});

// ตั้งค่า routes
app.use(homeRoutes);
app.use(authRoutes);
app.use('/books', bookRoutes);
app.use('/loans', loanRoutes);
app.use('/user', userRoutes);

// middleware สำหรับจัดการ 404 และ 500
app.use((req, res) => {
  res.status(404).render('404', { title: 'ไม่พบหน้า' });
});

// middleware สำหรับจัดการ error
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'เกิดข้อผิดพลาด',
    message: isProduction ? 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง' : err.message,
  });
});

if (!process.env.VERCEL) {
  app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}

module.exports = app;