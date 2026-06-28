-- ============================================================
-- ANTI-JUDOL Database Schema
-- Compatible: PostgreSQL 14+
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. ADMINS (login dashboard)
-- ============================================================
CREATE TABLE admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,        -- bcrypt hash, cost 12
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(100) UNIQUE,
  role          VARCHAR(20) NOT NULL DEFAULT 'admin',  -- 'superadmin' | 'admin'
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. DEVICES (komputer yang terinstall extension)
-- ============================================================
CREATE TABLE devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id         VARCHAR(255) UNIQUE NOT NULL,   -- dari extension
  device_name       VARCHAR(255),
  location          VARCHAR(255),
  extension_version VARCHAR(50),
  browser           VARCHAR(50),
  ip_address        INET,
  status            VARCHAR(20) NOT NULL DEFAULT 'online', -- 'online' | 'offline'
  last_seen         TIMESTAMPTZ,
  blocked_today     INTEGER NOT NULL DEFAULT 0,
  registered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. LOGS (setiap konten yang diblokir)
-- ============================================================
CREATE TABLE logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   VARCHAR(255) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  timestamp   TIMESTAMPTZ NOT NULL,
  type        VARCHAR(20) NOT NULL,   -- 'site' | 'ad'
  url         TEXT NOT NULL,
  selector    VARCHAR(255),           -- CSS selector (untuk type 'ad')
  reason      VARCHAR(255),
  tab_id      INTEGER,
  category    VARCHAR(50) DEFAULT 'gambling',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. BLOCKLIST (domain/pattern yang diblokir)
-- ============================================================
CREATE TABLE blocklist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern     VARCHAR(255) UNIQUE NOT NULL,   -- e.g. "*://bet*.com/*"
  category    VARCHAR(50) DEFAULT 'gambling',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  added_by    UUID REFERENCES admins(id) ON DELETE SET NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. SESSIONS (JWT revocation jika perlu)
-- ============================================================
CREATE TABLE admin_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_jti   VARCHAR(255) UNIQUE NOT NULL,   -- JWT "jti" claim
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_logs_device_id   ON logs(device_id);
CREATE INDEX idx_logs_timestamp   ON logs(timestamp DESC);
CREATE INDEX idx_logs_type        ON logs(type);
CREATE INDEX idx_devices_status   ON devices(status);
CREATE INDEX idx_devices_last_seen ON devices(last_seen DESC);
CREATE INDEX idx_sessions_token   ON admin_sessions(token_jti);

-- ============================================================
-- TRIGGER: auto-update updated_at on admins
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_admins_updated_at
  BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default blocklist patterns
INSERT INTO blocklist (pattern, category) VALUES
  ('*://bet*.com/*',      'gambling'),
  ('*://casino*.com/*',   'gambling'),
  ('*://poker*.com/*',    'gambling'),
  ('*://judi*.com/*',     'gambling'),
  ('*://taruhan*.com/*',  'gambling'),
  ('*://togel*.com/*',    'gambling'),
  ('*://slot*.com/*',     'gambling'),
  ('*://pragmatic*.com/*','gambling'),
  ('*://maxwin*.com/*',   'gambling'),
  ('*://gacor*.com/*',    'gambling');

-- Default superadmin account
-- Password: Admin@1234  (GANTI sebelum production!)
-- Hash ini adalah bcrypt cost-12 dari "Admin@1234"
INSERT INTO admins (username, password_hash, name, email, role)
VALUES (
  'superadmin',
  '$2b$12$zVWnKs7Kq3UsTXOcCQVbweFfGYqsoZ41bZbC7q3Rkvlw8i5xdlI9S',
  'Super Administrator',
  'admin@kampus.ac.id',
  'superadmin'
);