const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const path     = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app  = express();
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'antijudol',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

const JWT_SECRET = process.env.JWT_SECRET || 'antijudol-secret-key-ganti-ini';
const PORT       = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Serve frontend (hasil npm run build) ────────────────────────
app.use(express.static(path.join(__dirname, 'dist')));

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
        COALESCE(device_name, device_id) AS "deviceName",
        COALESCE(location, '-') AS location,
        extension_version AS "extensionVersion", browser,
        CASE
          WHEN last_seen > NOW() - INTERVAL '5 minutes' THEN 'online'
          ELSE 'offline'
        END AS status,
        last_seen AS "lastSeen", blocked_today AS "blockedToday",
        registered_at AS "registeredAt"
      FROM devices
      ORDER BY last_seen DESC NULLS LAST
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

app.post('/api/devices/register', async (req, res) => {
  const { deviceId, extensionVersion, browser, registeredAt } = req.body;
  if (!deviceId) return res.status(400).json({ message: 'deviceId wajib diisi.' });

  try {
    await pool.query(`
      INSERT INTO devices (device_id, extension_version, browser, last_seen, registered_at)
      VALUES ($1, $2, $3, NOW(), $4)
      ON CONFLICT (device_id) DO UPDATE
        SET extension_version = EXCLUDED.extension_version,
            browser           = EXCLUDED.browser,
            last_seen         = NOW()
    `, [deviceId, extensionVersion, browser, registeredAt || new Date()]);

    res.json({ success: true, deviceId, message: 'Device registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// HEARTBEAT
// ═══════════════════════════════════════════════════════════════════

app.post('/api/heartbeat', async (req, res) => {
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

app.post('/api/logs', async (req, res) => {
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
      pool.query(`SELECT COUNT(*) FROM devices WHERE last_seen > NOW() - INTERVAL '5 minutes'`),
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

// ═══════════════════════════════════════════════════════════════════
// MALICIOUS REDIRECT PROTECTION
// ═══════════════════════════════════════════════════════════════════

// Buat tabel bila belum ada (tanpa perlu migrasi manual)
async function initRedirectTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS redirect_settings (
      id          INT PRIMARY KEY DEFAULT 1,
      enabled     BOOLEAN NOT NULL DEFAULT TRUE,
      sensitivity VARCHAR(10) NOT NULL DEFAULT 'medium',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT redirect_settings_singleton CHECK (id = 1)
    );
  `);
  await pool.query(`INSERT INTO redirect_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS redirect_whitelist (
      id       BIGSERIAL PRIMARY KEY,
      pattern  VARCHAR(255) UNIQUE NOT NULL,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS redirect_logs (
      id         BIGSERIAL PRIMARY KEY,
      device_id  VARCHAR(255),
      target_url TEXT,
      from_url   TEXT,
      reason     VARCHAR(255),
      method     VARCHAR(50),
      timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_redirect_logs_ts ON redirect_logs(timestamp DESC);`);
}

// GET config (publik — dipakai extension)
app.get('/api/redirect/config', async (req, res) => {
  try {
    const [s, w] = await Promise.all([
      pool.query(`SELECT enabled, sensitivity FROM redirect_settings WHERE id = 1`),
      pool.query(`SELECT pattern FROM redirect_whitelist ORDER BY added_at`),
    ]);
    const row = s.rows[0] || { enabled: true, sensitivity: 'medium' };
    res.json({
      enabled: row.enabled,
      sensitivity: row.sensitivity,
      whitelist: w.rows.map((r) => r.pattern),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// POST config (admin)
app.post('/api/redirect/config', verifyToken, async (req, res) => {
  const { enabled, sensitivity } = req.body;
  const sens = ['low', 'medium', 'high'].includes(sensitivity) ? sensitivity : 'medium';
  try {
    await pool.query(
      `UPDATE redirect_settings SET enabled = $1, sensitivity = $2, updated_at = NOW() WHERE id = 1`,
      [enabled !== false, sens]
    );
    res.json({ success: true, enabled: enabled !== false, sensitivity: sens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// POST whitelist add/remove (admin)
app.post('/api/redirect/whitelist', verifyToken, async (req, res) => {
  const { domains, action } = req.body;
  if (!Array.isArray(domains) || !action)
    return res.status(400).json({ message: 'domains dan action wajib diisi.' });
  try {
    if (action === 'add') {
      for (const p of domains) {
        await pool.query(
          `INSERT INTO redirect_whitelist (pattern) VALUES ($1) ON CONFLICT DO NOTHING`,
          [p]
        );
      }
    } else if (action === 'remove') {
      for (const p of domains) {
        await pool.query(`DELETE FROM redirect_whitelist WHERE pattern = $1`, [p]);
      }
    }
    const w = await pool.query(`SELECT pattern FROM redirect_whitelist ORDER BY added_at`);
    res.json({ success: true, whitelist: w.rows.map((r) => r.pattern) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// POST log redirect diblokir (publik — dari extension)
app.post('/api/redirect/logs', async (req, res) => {
  const { deviceId, target, from, reason, method, timestamp } = req.body;
  try {
    await pool.query(
      `INSERT INTO redirect_logs (device_id, target_url, from_url, reason, method, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [deviceId || null, target || '', from || '', reason || '', method || '', timestamp || new Date()]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// GET daftar log redirect (admin — untuk dashboard)
app.get('/api/redirect/logs', verifyToken, async (req, res) => {
  const { limit = 100 } = req.query;
  try {
    const result = await pool.query(
      `
      SELECT
        l.id, l.device_id AS "deviceId",
        COALESCE(d.device_name, l.device_id) AS "deviceName",
        l.target_url AS "target", l.from_url AS "from",
        l.reason, l.method, l.timestamp
      FROM redirect_logs l
      LEFT JOIN devices d ON d.device_id = l.device_id
      ORDER BY l.timestamp DESC
      LIMIT $1
    `,
      [parseInt(limit)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ─── Semua route lain → kirim index.html (React Router) ──────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ ANTI-JUDOL berjalan di http://localhost:${PORT}`);
  console.log(`   Frontend : http://localhost:${PORT}`);
  console.log(`   API      : http://localhost:${PORT}/api`);
  console.log(`   Database : ${process.env.DB_NAME || 'antijudol'} @ ${process.env.DB_HOST || 'localhost'}\n`);

  // Pastikan tabel proteksi redirect tersedia
  initRedirectTables()
    .then(() => console.log('   Redirect protection tables siap.'))
    .catch((e) => console.error('   Gagal init tabel redirect:', e.message));
});
