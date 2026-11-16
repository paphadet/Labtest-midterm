function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: 'error', text: 'กรุณาเข้าสู่ระบบก่อน' };
    return res.redirect('/login');
  }
  next();
}

function guestOnly(req, res, next) {
  if (req.session.user) return res.redirect('/home');
  next();
}

module.exports = { requireLogin, guestOnly };
