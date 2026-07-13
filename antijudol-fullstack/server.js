const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcryptjs'); // murni JS: aman untuk serverless & memverifikasi hash bcrypt lama
const jwt      = require('jsonwebtoken');
const path     = require('path');
const { Pool } = require('pg');
require('dotenv').config();

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

    res.json({ success: true, deviceId, message: 'Device registered successfully' });
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

// Buat tabel inti + akun superadmin default (idempoten; tanpa perlu jalankan schema.sql).
// Dijalankan satu perintah per query agar aman di editor/driver yang tak mendukung multi-statement.
async function initCoreSchema() {
  // pgcrypto opsional (butuh izin); gen_random_uuid sudah bawaan PostgreSQL 13+.
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
  } catch (e) {
    console.warn('pgcrypto tidak dibuat (mungkin tak berizin), lanjut:', e.message);
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS admins (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       username VARCHAR(50) UNIQUE NOT NULL,
       password_hash VARCHAR(255) NOT NULL,
       name VARCHAR(100) NOT NULL,
       email VARCHAR(100) UNIQUE,
       role VARCHAR(20) NOT NULL DEFAULT 'admin',
       is_active BOOLEAN NOT NULL DEFAULT TRUE,
       last_login TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    `CREATE TABLE IF NOT EXISTS devices (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       device_id VARCHAR(255) UNIQUE NOT NULL,
       device_name VARCHAR(255),
       location VARCHAR(255),
       extension_version VARCHAR(50),
       browser VARCHAR(50),
       ip_address INET,
       status VARCHAR(20) NOT NULL DEFAULT 'online',
       last_seen TIMESTAMPTZ,
       blocked_today INTEGER NOT NULL DEFAULT 0,
       registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    // Kolom identifikasi tambahan (aman bila sudah ada)
    `ALTER TABLE devices ADD COLUMN IF NOT EXISTS os VARCHAR(30);`,
    `ALTER TABLE devices ADD COLUMN IF NOT EXISTS os_version VARCHAR(50);`,
    `CREATE INDEX IF NOT EXISTS idx_devices_location ON devices(location);`,
    `CREATE TABLE IF NOT EXISTS logs (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       device_id VARCHAR(255) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
       timestamp TIMESTAMPTZ NOT NULL,
       type VARCHAR(20) NOT NULL,
       url TEXT NOT NULL,
       selector VARCHAR(255),
       reason VARCHAR(255),
       tab_id INTEGER,
       category VARCHAR(50) DEFAULT 'gambling',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    `CREATE TABLE IF NOT EXISTS blocklist (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       pattern VARCHAR(255) UNIQUE NOT NULL,
       category VARCHAR(50) DEFAULT 'gambling',
       is_active BOOLEAN NOT NULL DEFAULT TRUE,
       added_by UUID REFERENCES admins(id) ON DELETE SET NULL,
       added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    `CREATE TABLE IF NOT EXISTS admin_sessions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
       token_jti VARCHAR(255) UNIQUE NOT NULL,
       expires_at TIMESTAMPTZ NOT NULL,
       revoked BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
    `CREATE INDEX IF NOT EXISTS idx_logs_device_id ON logs(device_id);`,
    `CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(type);`,
    `CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);`,
    `CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_token ON admin_sessions(token_jti);`,
    `CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $func$
       BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
     $func$ LANGUAGE plpgsql;`,
    `DROP TRIGGER IF EXISTS trg_admins_updated_at ON admins;`,
    `CREATE TRIGGER trg_admins_updated_at BEFORE UPDATE ON admins
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();`,
    `INSERT INTO blocklist (pattern, category) VALUES
       ('*://bet*.com/*','gambling'), ('*://casino*.com/*','gambling'),
       ('*://poker*.com/*','gambling'), ('*://judi*.com/*','gambling'),
       ('*://taruhan*.com/*','gambling'), ('*://togel*.com/*','gambling'),
       ('*://slot*.com/*','gambling'), ('*://pragmatic*.com/*','gambling'),
       ('*://maxwin*.com/*','gambling'), ('*://gacor*.com/*','gambling')
       ON CONFLICT (pattern) DO NOTHING;`,
    `INSERT INTO admins (username, password_hash, name, email, role)
       VALUES ('superadmin',
               '$2b$12$zVWnKs7Kq3UsTXOcCQVbweFfGYqsoZ41bZbC7q3Rkvlw8i5xdlI9S',
               'Super Administrator', 'admin@kampus.ac.id', 'superadmin')
       ON CONFLICT (username) DO NOTHING;`,
  ];
  for (const sql of statements) {
    await pool.query(sql);
  }
}

// Inisialisasi seluruh database (inti + proteksi redirect)
async function initDatabase() {
  await initCoreSchema();
  await initRedirectTables();
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

// ─── Endpoint /api yang tidak dikenal → 404 JSON (bukan HTML) ─────
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Endpoint tidak ditemukan.' });
});

// ─── Route lain → index.html (hanya relevan saat dijalankan lokal via Express) ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'), (err) => {
    if (err) res.status(404).end();
  });
});

// (Inisialisasi database sudah dijalankan di atas via dbReady.)

// Hanya panggil listen saat dijalankan langsung (node server.js), bukan di serverless
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n✅ ANTI-JUDOL berjalan di http://localhost:${PORT}`);
    console.log(`   Frontend : http://localhost:${PORT}`);
    console.log(`   API      : http://localhost:${PORT}/api\n`);
  });
}

// Ekspor app agar bisa dipakai sebagai serverless function (Vercel: api/index.js)
module.exports = app;
