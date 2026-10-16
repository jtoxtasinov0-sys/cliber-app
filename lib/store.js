import crypto from 'node:crypto';
import { sql, tx } from './db.js';
import { DEFAULT_SETTINGS, REGIONS } from './config.js';
import { fail, int, str } from './http.js';

export async function getSettings() {
  const rows = await sql(`SELECT key, value FROM settings`);
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) out[r.key] = { ...(out[r.key] || {}), ...r.value };
  return out;
}

export const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name,
    COALESCE((SELECT json_agg(json_build_object('id', v.id, 'size', v.size, 'color', v.color, 'sku', v.sku,
      'stock', v.stock, 'low_stock', v.low_stock, 'cost_price', v.cost_price) ORDER BY v.sort, v.id)
      FROM variants v WHERE v.product_id = p.id AND v.sort < 999), '[]') AS variants
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

export function publicProduct(p) {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category_id: p.category_id,
    category_name: p.category_name,
    price: p.price,
    old_price: p.old_price,
    description: p.description,
    images: p.images,
    is_featured: p.is_featured,
    is_new: p.is_new,
    sold_count: p.sold_count,
    created_at: p.created_at,
    variants: p.variants.map((v) => ({ id: v.id, size: v.size, color: v.color, stock: v.stock })),
    stock: p.variants.reduce((s, v) => s + v.stock, 0),
  };
}

export function deliveryPrice(settings, method, region, subtotal) {
  if (method === 'pickup') return 0;
  const d = settings.delivery;
  if (d.free_from && subtotal >= d.free_from) return 0;
  return int(d.prices?.[region], 0);
}

const newCode = () => 'CL-' + String(crypto.randomInt(100000, 999999));

export async function createOrder(body, who) {
  const settings = await getSettings();
  const merged = new Map();
  for (const it of Array.isArray(body.items) ? body.items : []) {
    const id = int(it?.variant_id);
    merged.set(id, (merged.get(id) || 0) + (int(it?.qty) || 0));
  }
  const items = [...merged].map(([variant_id, qty]) => ({ variant_id, qty }));
  if (!items.length) fail(400, "Savatcha bo'sh");
  if (items.length > 30) fail(400, "Juda ko'p mahsulot");

  const customer_name = str(body.customer_name, 80);
  const phone = str(body.phone, 30).replace(/[^\d+]/g, '');
  const region = str(body.region, 60);
  const district = str(body.district, 80);
  const address = str(body.address, 300);
  const comment = str(body.comment, 500);
  const delivery_method = body.delivery_method === 'pickup' ? 'pickup' : 'delivery';
  const payment_method = body.payment_method === 'telegram' ? 'telegram' : 'card_transfer';

  if (customer_name.length < 2) fail(400, 'Ismingizni kiriting');
  if (!/^\+998\d{9}$/.test(phone)) fail(400, "Telefon raqam +998 XX XXX XX XX ko'rinishida bo'lsin");
  if (delivery_method === 'pickup' && !settings.delivery.pickup_enabled) fail(400, "Do'kondan olib ketish hozir mavjud emas");
  if (delivery_method === 'delivery') {
    if (!REGIONS.includes(region)) fail(400, 'Viloyatni tanlang');
    if (address.length < 5) fail(400, "Manzilni to'liq yozing");
  }
  if (payment_method === 'telegram' && !process.env.PAYMENT_PROVIDER_TOKEN) fail(400, "Bu to'lov usuli hozir mavjud emas");

  return tx(async (q) => {
    let subtotal = 0;
    const lines = [];
    for (const it of items) {
      const variantId = int(it.variant_id);
      const qty = int(it.qty);
      if (!variantId || !qty || qty < 1 || qty > 20) fail(400, "Mahsulot miqdori noto'g'ri");
      const [v] = await q(
        `SELECT v.id, v.size, v.stock, p.id AS product_id, p.name, p.price, p.images, p.is_active
         FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = $1 FOR UPDATE OF v`,
        [variantId]
      );
      if (!v || !v.is_active) fail(400, 'Mahsulot topilmadi yoki sotuvda emas');
      if (!v.price) fail(400, `"${v.name}" narxini admin bilan aniqlang`);
      if (v.stock < qty) fail(409, `"${v.name}" (${v.size}) omborda ${v.stock} dona qolgan`);
      subtotal += v.price * qty;
      lines.push({ ...v, qty });
    }
    const delivery_price = deliveryPrice(settings, delivery_method, region, subtotal);
    const total = subtotal + delivery_price;

    let order;
    for (let i = 0; i < 5 && !order; i++) {
      const rows = await q(
        `INSERT INTO orders(code, tg_user_id, tg_username, device_id, customer_name, phone, region, district, address,
           delivery_method, delivery_price, subtotal, total, comment, payment_method)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (code) DO NOTHING RETURNING *`,
        [newCode(), who.tg_user_id, who.tg_username, who.device_id, customer_name, phone,
          delivery_method === 'pickup' ? 'Do\'kondan olib ketish' : region, district, address,
          delivery_method, delivery_price, subtotal, total, comment, payment_method]
      );
      order = rows[0];
    }

    for (const l of lines) {
      await q(
        `INSERT INTO order_items(order_id, product_id, variant_id, name, size, image, price, qty) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [order.id, l.product_id, l.id, l.name, l.size, l.images?.[0] || null, l.price, l.qty]
      );
      const [u] = await q(`UPDATE variants SET stock = stock - $2 WHERE id = $1 RETURNING stock`, [l.id, l.qty]);
      await q(
        `INSERT INTO stock_movements(variant_id, type, qty, balance, order_id, note) VALUES ($1,'sale',$2,$3,$4,$5)`,
        [l.id, -l.qty, u.stock, order.id, `Buyurtma ${order.code}`]
      );
      await q(`UPDATE products SET sold_count = sold_count + $2 WHERE id = $1`, [l.product_id, l.qty]);
    }
    return { order, lines };
  });
}

// Buyurtmani bekor qilish va mahsulotlarni omborga qaytarish
export async function cancelOrder(orderId, reason) {
  return tx(async (q) => {
    const [o] = await q(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (!o) fail(404, 'Buyurtma topilmadi');
    if (o.status === 'cancelled') return o;
    const items = await q(`SELECT * FROM order_items WHERE order_id = $1`, [orderId]);
    for (const it of items) {
      if (!it.variant_id) continue;
      const [u] = await q(`UPDATE variants SET stock = stock + $2 WHERE id = $1 RETURNING stock`, [it.variant_id, it.qty]);
      if (u) {
        await q(
          `INSERT INTO stock_movements(variant_id, type, qty, balance, order_id, note) VALUES ($1,'return',$2,$3,$4,$5)`,
          [it.variant_id, it.qty, u.stock, orderId, `${o.code} bekor qilindi${reason ? ': ' + reason : ''}`]
        );
      }
      if (it.product_id) await q(`UPDATE products SET sold_count = GREATEST(sold_count - $2, 0) WHERE id = $1`, [it.product_id, it.qty]);
    }
    const [upd] = await q(
      `UPDATE orders SET status = 'cancelled', payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END,
         admin_note = COALESCE(NULLIF($2, ''), admin_note), updated_at = now() WHERE id = $1 RETURNING *`,
      [orderId, reason || '']
    );
    return upd;
  });
}

// To'lanmagan buyurtmalar muddati o'tsa — bron bekor qilinadi
export async function expireOrders() {
  const settings = await getSettings();
  const hours = int(settings.payment.reserve_hours, 24);
  if (!hours) return 0;
  const rows = await sql(
    `SELECT id FROM orders WHERE status = 'new' AND payment_status IN ('awaiting','rejected')
     AND created_at < now() - ($1 || ' hours')::interval LIMIT 20`,
    [String(hours)]
  );
  for (const r of rows) await cancelOrder(r.id, "To'lov muddati o'tdi");
  return rows.length;
}

// Ombor harakati: in (kirim), out (chiqim/hisobdan chiqarish), adjust (inventarizatsiya — yangi qoldiq)
export async function moveStock(q, { variant_id, type, qty, cost_price, supplier, note }) {
  const id = int(variant_id);
  let n = int(qty);
  if (!id) fail(400, 'Variant tanlanmagan');
  if (!['in', 'out', 'adjust'].includes(type)) fail(400, "Harakat turi noto'g'ri");
  if (n === null || n < 0 || (type !== 'adjust' && n === 0)) fail(400, "Miqdor noto'g'ri");
  const [v] = await q(`SELECT id, stock FROM variants WHERE id = $1 FOR UPDATE`, [id]);
  if (!v) fail(404, 'Variant topilmadi');
  let delta = type === 'in' ? n : type === 'out' ? -n : n - v.stock;
  if (v.stock + delta < 0) fail(409, `Omborda faqat ${v.stock} dona bor`);
  const cp = int(cost_price);
  const [u] = await q(
    `UPDATE variants SET stock = stock + $2, cost_price = COALESCE($3, cost_price) WHERE id = $1 RETURNING stock`,
    [id, delta, type === 'in' ? cp : null]
  );
  await q(
    `INSERT INTO stock_movements(variant_id, type, qty, balance, cost_price, supplier, note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, type, delta, u.stock, cp, str(supplier, 120) || null, str(note, 300) || null]
  );
  return u.stock;
}
