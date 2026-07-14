/**
 * ANTI-JUDOL - Backend Auth Endpoint
 * Stack: Node.js + Express + pg (PostgreSQL) + bcrypt + jsonwebtoken
 *
 * Install dependencies:
 *   npm install express pg bcrypt jsonwebtoken
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { Pool } = require('pg');

const router = express.Router();
const pool   = new Pool({ connectionString: process.env.DATABASE_URL });

const JWT_SECRET  = process.env.JWT_SECRET;   // wajib set di .env
const JWT_EXPIRES = '8h';

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username dan password wajib diisi.' });
  }

  try {
    // Cari admin
    const result = await pool.query(
      'SELECT * FROM admins WHERE username = $1 AND is_active = TRUE',
      [username]
    );

    const admin = result.rows[0];
    if (!admin) {
      return res.status(401).json({ message: 'Username atau password salah.' });
    }

    // Cek password
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Username atau password salah.' });
    }

    // Update last_login
    await pool.query('UPDATE admins SET last_login = NOW() WHERE id = $1', [admin.id]);

    // Generate JWT
    const token = jwt.sign(
      { sub: admin.id, username: admin.username, role: admin.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      token,
      admin: {
        id:       admin.id,
        username: admin.username,
        name:     admin.name,
        role:     admin.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

/**
 * POST /api/auth/logout
 * Header: Authorization: Bearer <token>
 * (Opsional: revoke token di tabel admin_sessions)
 */
router.post('/logout', (req, res) => {
  // Client-side: hapus token dari localStorage
  // Server-side: tambahkan token ke blacklist jika pakai admin_sessions
  res.json({ success: true });
});

module.exports = router;

// ============================================================
// Middleware: verifyToken (pakai di endpoint lain)
// ============================================================
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token tidak ditemukan.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Token tidak valid atau sudah expired.' });
  }
}

module.exports.verifyToken = verifyToken;
