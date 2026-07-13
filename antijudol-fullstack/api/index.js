// Serverless entry untuk Vercel.
// Menjalankan aplikasi Express (server.js) sebagai satu fungsi.
// Semua request /api/* diarahkan ke sini lewat rewrite di vercel.json.
module.exports = require('../server.js');
