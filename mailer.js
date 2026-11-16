const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendVerifyEmail(to, username, link) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log(`[DEV] ยังไม่ได้ตั้งค่า Gmail — ลิงก์ยืนยันของ ${to}: ${link}`);
    return;
  }

  await transporter.sendMail({
    from: `"Library" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'ยืนยันอีเมลของคุณ',
    html: `
      <p>สวัสดี ${username}</p>
      <p>กดลิงก์ด้านล่างเพื่อยืนยันอีเมล (ลิงก์หมดอายุใน 24 ชั่วโมง)</p>
      <p><a href="${link}">${link}</a></p>
    `,
  });
}

module.exports = { sendVerifyEmail };
