const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcryptjs'); // murni JS: aman untuk serverless & memverifikasi hash bcrypt lama
const jwt      = require('jsonwebtoken');
const path     = require('path');
const crypto   = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

// Hash token perangkat (disimpan hanya hash-nya, bukan token asli)
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

const app  = express();

// Koneksi database:
//  - Produksi (Neon/Railway): set DATABASE_URL (connection string) → pakai SSL.
//  - Lokal: pakai DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD.
// DATABASE_URL (Neon/Railway) atau POSTGRES_URL (Vercel Postgres) → pakai SSL.
const CONNECTION_STRING = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const pool = CONNECTION_STRING
  ? new Pool({
      connectionString: CONNECTION_STRING,
      ssl: { rejectUnauthorized: false }, // diperlukan Neon/Vercel Postgres & Postgres cloud lainnya
      max: 3, // batasi koneksi (ramah untuk lingkungan serverless)
    })
  : new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     process.env.DB_PORT     || 5432,
      database: process.env.DB_NAME     || 'antijudol',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

const JWT_SECRET = process.env.JWT_SECRET || 'antijudol-secret-key-ganti-ini';
const PORT       = process.env.PORT || 3001;

// CORS: izinkan domain frontend. Set CORS_ORIGIN (mis. URL Vercel) untuk membatasi,
// atau biarkan kosong untuk mengizinkan semua origin (cukup untuk uji coba).
app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
      : true,
  })
);
app.use(express.json());

// ─── Serve frontend (hasil npm run build) ────────────────────────
app.use(express.static(path.join(__dirname, 'dist')));

// Inisialisasi database sekali saat modul dimuat (lokal & cold start serverless).
const dbReady = initDatabase()
  .then(() => console.log('Database siap.'))
  .catch((e) => console.error('Gagal init database:', e.message));

// Tahan request /api sampai skema database siap (mencegah balapan saat cold start).
app.use('/api', async (req, res, next) => {
  try {
    await dbReady;
  } catch (e) {
    /* biarkan handler yang menangani error koneksi */
  }
  next();
});

// ─── Middleware: cek token ────────────────────────────────────────
function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token tidak ditemukan.' });
  }
  try {
    req.admin = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Token tidak valid atau sudah expired.' });
  }
}

// ─── Middleware: verifikasi token PERANGKAT (anti-spoof laporan ekstensi) ──────
// Jika perangkat sudah punya token_hash → wajib menyertakan Bearer token yang cocok.
// Jika belum (perangkat lama / belum enroll) → diizinkan (grace) agar tidak putus.
async function verifyDevice(req, res, next) {
  const b = req.body || {};
  const deviceId =
    b.deviceId || (Array.isArray(b.logs) && b.logs[0] && b.logs[0].deviceId) || null;
  if (!deviceId) return res.status(400).json({ message: 'deviceId wajib diisi.' });
  try {
    const r = await pool.query('SELECT token_hash FROM devices WHERE device_id = $1', [deviceId]);
    const stored = r.rows[0] && r.rows[0].token_hash;
    if (!stored) return next(); // belum enroll token → izinkan
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token && sha256(token) === stored) return next();
    return res.status(401).json({ message: 'Token perangkat tidak valid.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
}

// ═══════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: 'Username dan password wajib diisi.' });

  try {
    const result = await pool.query(
      'SELECT * FROM admins WHERE username = $1 AND is_active = TRUE',
      [username]
    );
    const admin = result.rows[0];
    if (!admin) return res.status(401).json({ message: 'Username atau password salah.' });

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ message: 'Username atau password salah.' });

    await pool.query('UPDATE admins SET last_login = NOW() WHERE id = $1', [admin.id]);

    const token = jwt.sign(
      { sub: admin.id, username: admin.username, role: admin.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/api/auth/logout', verifyToken, (req, res) => {
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════
// DEVICES
// ═══════════════════════════════════════════════════════════════════

app.get('/api/devices', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, device_id AS "deviceId",
        device_name AS "alias",
        COALESCE(device_name, device_id) AS "deviceName",
        location,
        os, os_version AS "osVersion",
        extension_version AS "extensionVersion", browser,
        CASE
          WHEN last_seen > NOW() - INTERVAL '90 seconds' THEN 'online'
          ELSE 'offline'
        END AS status,
        last_seen AS "lastSeen", blocked_today AS "blockedToday",
        registered_at AS "registeredAt"
      FROM devices
      ORDER BY location NULLS LAST, device_name NULLS LAST, last_seen DESC NULLS LAST
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/api/devices/register', async (req, res) => {
  const { deviceId, extensionVersion, browser, os, osVersion, registeredAt } = req.body;
  if (!deviceId) return res.status(400).json({ message: 'deviceId wajib diisi.' });

  try {
    await pool.query(`
      INSERT INTO devices (device_id, extension_version, browser, os, os_version, last_seen, registered_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      ON CONFLICT (device_id) DO UPDATE
        SET extension_version = EXCLUDED.extension_version,
            browser           = EXCLUDED.browser,
            os                = EXCLUDED.os,
            os_version        = EXCLUDED.os_version,
            last_seen         = NOW()
    `, [deviceId, extensionVersion, browser, os || null, osVersion || null, registeredAt || new Date()]);

    // Terbitkan token perangkat HANYA saat pertama kali enroll (token_hash masih kosong).
    // Ini mencegah pihak lain "mencuri" slot token perangkat yang sudah terdaftar.
    let deviceToken;
    const cur = await pool.query('SELECT token_hash FROM devices WHERE device_id = $1', [deviceId]);
    if (!cur.rows[0] || !cur.rows[0].token_hash) {
      deviceToken = crypto.randomBytes(24).toString('hex');
      await pool.query('UPDATE devices SET token_hash = $1 WHERE device_id = $2', [
        sha256(deviceToken),
        deviceId,
      ]);
    }

    res.json({ success: true, deviceId, deviceToken, message: 'Device registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Admin mereset token perangkat (izinkan enroll ulang bila token hilang / re-provisioning)
app.post('/api/devices/:id/reset-token', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE devices SET token_hash = NULL WHERE device_id = $1',
      [req.params.id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ message: 'Perangkat tidak ditemukan.' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Admin menambah perangkat secara manual (inventaris / pra-registrasi)
app.post('/api/devices', verifyToken, async (req, res) => {
  const { alias, location } = req.body;
  const deviceId = 'manual_' + crypto.randomUUID();
  try {
    await pool.query(
      `INSERT INTO devices (device_id, device_name, location, status, registered_at)
       VALUES ($1, $2, $3, 'offline', NOW())`,
      [
        deviceId,
        alias ? String(alias).trim() || null : null,
        location ? String(location).trim() || null : null,
      ]
    );
    res.json({ success: true, deviceId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Admin menghapus perangkat (log terkait ikut terhapus via ON DELETE CASCADE)
app.delete('/api/devices/:id', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM devices WHERE device_id = $1', [req.params.id]);
    if (result.rowCount === 0)
      return res.status(404).json({ message: 'Perangkat tidak ditemukan.' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Admin mengubah alias (nama) & lokasi perangkat
app.patch('/api/devices/:id', verifyToken, async (req, res) => {
  const { alias, location } = req.body;
  try {
    const result = await pool.query(
      `UPDATE devices SET device_name = $1, location = $2 WHERE device_id = $3`,
      [alias ? String(alias).trim() || null : null, location ? String(location).trim() || null : null, req.params.id]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ message: 'Perangkat tidak ditemukan.' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// HEARTBEAT
// ═══════════════════════════════════════════════════════════════════

app.post('/api/heartbeat', verifyDevice, async (req, res) => {
  const { deviceId, stats } = req.body;
  if (!deviceId) return res.status(400).json({ message: 'deviceId wajib diisi.' });

  try {
    const blockedToday = (stats?.sitesBlocked || 0) + (stats?.adsBlocked || 0);
    await pool.query(`
      UPDATE devices
      SET last_seen = NOW(), status = 'online', blocked_today = $2
      WHERE device_id = $1
    `, [deviceId, blockedToday]);

    res.json({ success: true, serverTime: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// LOGS
// ═══════════════════════════════════════════════════════════════════

app.get('/api/logs', verifyToken, async (req, res) => {
  const { deviceId, type, limit = 50, offset = 0 } = req.query;
  try {
    const params = [parseInt(limit), parseInt(offset)];
    const conditions = [];
    if (deviceId) {
      params.push(deviceId);
      conditions.push(`l.device_id = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`l.type = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT
        l.id, l.device_id AS "deviceId",
        COALESCE(d.device_name, l.device_id) AS "deviceName",
        l.timestamp, l.type, l.url, l.category, l.reason, l.selector
      FROM logs l
      LEFT JOIN devices d ON d.device_id = l.device_id
      ${where}
      ORDER BY l.timestamp DESC
      LIMIT $1 OFFSET $2
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/api/logs', verifyDevice, async (req, res) => {
  const { logs } = req.body;
  if (!Array.isArray(logs) || logs.length === 0)
    return res.status(400).json({ message: 'logs harus array dan tidak boleh kosong.' });

  try {
    for (const log of logs) {
      await pool.query(`
        INSERT INTO logs (device_id, timestamp, type, url, selector, reason, tab_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [log.deviceId, log.timestamp, log.type, log.url, log.selector, log.reason, log.tabId]);
    }
    res.json({ success: true, logsReceived: logs.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════

app.get('/api/statistics', verifyToken, async (req, res) => {
  try {
    const [blockedRes, devicesRes, violationsRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM logs WHERE timestamp >= CURRENT_DATE`),
      pool.query(`SELECT COUNT(*) FROM devices WHERE last_seen > NOW() - INTERVAL '90 seconds'`),
      pool.query(`SELECT COUNT(*) FROM logs WHERE type = 'site' AND timestamp >= CURRENT_DATE`),
    ]);

    res.json({
      totalBlocked:  parseInt(blockedRes.rows[0].count),
      activeDevices: parseInt(devicesRes.rows[0].count),
      violations:    parseInt(violationsRes.rows[0].count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// BLOCKLIST
// ═══════════════════════════════════════════════════════════════════

app.get('/api/blocklist', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pattern FROM blocklist WHERE is_active = TRUE ORDER BY added_at`
    );
    res.json(result.rows.map(r => r.pattern));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/api/blocklist', verifyToken, async (req, res) => {
  const { domains, action } = req.body;
  if (!Array.isArray(domains) || !action)
    return res.status(400).json({ message: 'domains dan action wajib diisi.' });

  try {
    if (action === 'add') {
      for (const pattern of domains) {
        await pool.query(
          `INSERT INTO blocklist (pattern, added_by) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [pattern, req.admin.sub]
        );
      }
    } else if (action === 'remove') {
      for (const pattern of domains) {
        await pool.query(`DELETE FROM blocklist WHERE pattern = $1`, [pattern]);
      }
    }
    const count = await pool.query(`SELECT COUNT(*) FROM blocklist WHERE is_active = TRUE`);
    res.json({ success: true, totalDomains: parseInt(count.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ══════════════════════�