//ตรวจสอบการเข้าสู่ระบบ
function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: 'error', text: 'กรุณาเข้าสู่ระบบก่อน' };
    return res.redirect('/login');
  }
  next();
}
//ตรวจสอบผู้ใช้ว่า Login ไว้หรือไม่ ถ้า Login แล้วให้ไปหน้า Home
function guestOnly(req, res, next) {
  if (req.session.user) return res.redirect('/home');
  next();
}

module.exports = { requireLogin, guestOnly };
