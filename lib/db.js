import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

let _sql;
export function sql(text, params = []) {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL sozlanmagan');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql(text, params);
}

export async function one(text, params) {
  const rows = await sql(text, params);
  return rows[0] || null;
}

// Interaktiv tranzaksiya (ombor qoldig'ini xavfsiz kamaytirish uchun)
export async function tx(fn) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = async (text, params = []) => (await client.query(text, params)).rows;
    const result = await fn(q);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  image TEXT
);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS image TEXT;

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  brand TEXT,
  price INT,
  old_price INT,
  description TEXT,
  images JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_new BOOLEAN NOT NULL DEFAULT FALSE,
  sort INT NOT NULL DEFAULT 0,
  sold_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS sort INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS variants (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NOT NULL DEFAULT 'Standart',
  color TEXT,
  sku TEXT,
  stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  cost_price INT,
  low_stock INT NOT NULL DEFAULT 2,
  sort INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS variants_product_idx ON variants(product_id);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  tg_user_id BIGINT,
  tg_username TEXT,
  device_id TEXT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  region TEXT NOT NULL,
  district TEXT,
  address TEXT,
  delivery_method TEXT NOT NULL,
  delivery_price INT NOT NULL DEFAULT 0,
  subtotal INT NOT NULL,
  total INT NOT NULL,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  payment_method TEXT NOT NULL DEFAULT 'card_transfer',
  payment_status TEXT NOT NULL DEFAULT 'awaiting',
  receipt_image_id INT,
  admin_note TEXT,
  tracking TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_tg_idx ON orders(tg_user_id);
CREATE INDEX IF NOT EXISTS orders_device_idx ON orders(device_id);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  variant_id INT REFERENCES variants(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  size TEXT,
  image TEXT,
  price INT NOT NULL,
  qty INT NOT NULL CHECK (qty > 0)
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  variant_id INT REFERENCES variants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  qty INT NOT NULL,
  balance INT,
  cost_price INT,
  supplier TEXT,
  note TEXT,
  order_id INT REFERENCES orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_variant_idx ON stock_movements(variant_id);
CREATE INDEX IF NOT EXISTS stock_movements_created_idx ON stock_movements(created_at DESC);

CREATE TABLE IF NOT EXISTS images (
  id SERIAL PRIMARY KEY,
  mime TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS banners (
  id SERIAL PRIMARY KEY,
  badge TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  image TEXT,
  link_type TEXT NOT NULL DEFAULT 'none',
  link_value TEXT,
  sort INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
`;
