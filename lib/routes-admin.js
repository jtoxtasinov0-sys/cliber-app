import { sql, one, tx } from './db.js';
import { ORDER_STATUSES, PAYMENT_STATUSES, REGIONS, DEFAULT_SETTINGS } from './config.js';
import { fail, int, str, parseDataUrl } from './http.js';
import { checkPassword, signAdminToken } from './auth.js';
import { getSettings, PRODUCT_SELECT, cancelOrder, expireOrders, moveStock } from './store.js';
import { tg, botEnabled, money } from './telegram.js';
import { webhookSecret } from './routes-public.js';

const slugify = (s) =>
  s.toLowerCase().replace(/[`'ʻʼ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'kategoriya';

async function notifyCustomer(o, text) {
  if (!o.tg_user_id || !botEnabled()) return;
  await tg('sendMessage', { chat_id: o.tg_user_id, text });
}

function productFields(b) {
  const name = str(b.name, 160);
  if (name.length < 2) fail(400, 'Mahsulot nomini kiriting');
  const images = (Array.isArray(b.images) ? b.images : []).map((u) => str(u, 300)).filter(Boolean).slice(0, 10);
  const price = int(b.price);
  const old_price = int(b.old_price);
  if (price !== null && price < 0) fail(400, "Narx noto'g'ri");
  return [
    name, int(b.category_id), str(b.brand, 60) || null, price,
    old_price && price && old_price > price ? old_price : null,
    str(b.description, 3000) || null, JSON.stringify(images),
    b.is_active !== false, Boolean(b.is_featured), Boolean(b.is_new), int(b.sort),
  ];
}

// Variantlar (o'lchamlar): mavjudlarini yangilash, yangilarini qo'shish, olib tashlanganlarini o'chirish.
// Qoldiq bu yerda emas — faqat ombor harakatlari orqali o'zgaradi (yangi variant uchun boshlang'ich qoldiq bundan mustasno).
async function saveVariants(q, productId, variants) {
  const list = (Array.isArray(variants) ? variants : []).filter((v) => str(v.size, 30));
  if (!list.length) fail(400, "Kamida bitta o'lcham qo'shing");
  const keep = list.map((v) => int(v.id)).filter(Boolean);
  const removed = await q(
    `SELECT id, stock FROM variants WHERE product_id = $1 AND NOT (id = ANY($2::int[]))`, [productId, keep]
  );
  for (const r of removed) {
    const used = await q(`SELECT 1 FROM order_items WHERE variant_id = $1 LIMIT 1`, [r.id]);
    if (used.length) await q(`UPDATE variants SET stock = 0, sort = 999 WHERE id = $1`, [r.id]);
    else await q(`DELETE FROM variants WHERE id = $1`, [r.id]);
  }
  for (const [i, v] of list.entries()) {
    const fields = [str(v.size, 30), str(v.color, 40) || null, str(v.sku, 60) || null, int(v.cost_price), Math.max(int(v.low_stock, 2), 0), i];
    if (int(v.id)) {
      await q(
        `UPDATE variants SET size=$2, color=$3, sku=$4, cost_price=$5, low_stock=$6, sort=$7 WHERE id=$1 AND product_id=$8`,
        [int(v.id), ...fields, productId]
      );
    } else {
      const [nv] = await q(
        `INSERT INTO variants(product_id, size, color, sku, cost_price, low_stock, sort) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [productId, ...fields]
      );
      const initial = int(v.stock, 0);
      if (initial > 0) await moveStock(q, { variant_id: nv.id, type: 'in', qty: initial, cost_price: v.cost_price, note: "Yangi o'lcham — boshlang'ich qoldiq" });
    }
  }
}

const ORDER_TRANSITIONS = ['new', 'confirmed', 'packing', 'shipped', 'delivered'];

export const adminRoutes = [
  ['POST', 'admin/login', async (req, _, body) => {
    if (!process.env.ADMIN_PASSWORD) fail(500, 'ADMIN_PASSWORD sozlanmagan');
    if (!checkPassword(body.password)) fail(401, "Parol noto'g'ri");
    return { token: signAdminToken() };
  }, { public: true }],

  ['GET', 'admin/dashboard', async () => {
    await expireOrders();
    const [totals, daily, statuses, low, top, stock, recent] = await Promise.all([
      one(`SELECT
        COALESCE(sum(total) FILTER (WHERE payment_status = 'paid'), 0)::bigint AS revenue,
        COALESCE(sum(total) FILTER (WHERE payment_status = 'paid' AND created_at > now() - interval '30 days'), 0)::bigint AS revenue_30,
        count(*) FILTER (WHERE status <> 'cancelled')::int AS orders,
        count(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Tashkent')::date = (now() AT TIME ZONE 'Asia/Tashkent')::date)::int AS today,
        count(*) FILTER (WHERE payment_status = 'review' AND status <> 'cancelled')::int AS to_review,
        count(*) FILTER (WHERE status IN ('confirmed','packing'))::int AS to_ship,
        count(DISTINCT phone)::int AS customers,
        COALESCE(avg(total) FILTER (WHERE payment_status = 'paid'), 0)::int AS avg_check
        FROM orders`),
      sql(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
             COALESCE(sum(o.total) FILTER (WHERE o.payment_status = 'paid'), 0)::bigint AS revenue,
             count(o.id) FILTER (WHERE o.status <> 'cancelled')::int AS orders
           FROM generate_series((now() AT TIME ZONE 'Asia/Tashkent')::date - 13, (now() AT TIME ZONE 'Asia/Tashkent')::date, '1 day') d
           LEFT JOIN orders o ON (o.created_at AT TIME ZONE 'Asia/Tashkent')::date = d
           GROUP BY d ORDER BY d`),
      sql(`SELECT status, count(*)::int AS n FROM orders GROUP BY status`),
      sql(`SELECT v.id, v.size, v.stock, v.low_stock, p.id AS product_id, p.name, p.images->>0 AS image
           FROM variants v JOIN products p ON p.id = v.product_id
           WHERE p.is_active AND v.sort < 999 AND v.stock <= v.low_stock ORDER BY v.stock, p.name LIMIT 12`),
      sql(`SELECT oi.product_id, oi.name, max(oi.image) AS image, sum(oi.qty)::int AS qty, sum(oi.qty * oi.price)::bigint AS sum
           FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status <> 'cancelled'
           GROUP BY oi.product_id, oi.name ORDER BY qty DESC LIMIT 5`),
      one(`SELECT COALESCE(sum(v.stock), 0)::int AS units,
             COALESCE(sum(v.stock * p.price), 0)::bigint AS retail_value,
             COALESCE(sum(v.stock * v.cost_price), 0)::bigint AS cost_value
           FROM variants v JOIN products p ON p.id = v.product_id WHERE p.is_active`),
      sql(`SELECT id, code, customer_name, total, status, payment_status, created_at FROM orders ORDER BY created_at DESC LIMIT 6`),
    ]);
    return { totals, daily, statuses, low, top, stock, recent };
  }],

  // ---------- Buyurtmalar ----------
  ['GET', 'admin/orders', async (req, _, __, ___, query) => {
    await expireOrders();
    const status = str(query.status, 20);
    const pay = str(query.payment, 20);
    const s = str(query.q, 60);
    return sql(
      `SELECT o.*, (SELECT count(*)::int FROM order_items WHERE order_id = o.id) AS items_count
       FROM orders o
       WHERE ($1 = '' OR o.status = $1) AND ($2 = '' OR o.payment_status = $2)
         AND ($3 = '' OR o.code ILIKE '%' || $3 || '%' OR o.customer_name ILIKE '%' || $3 || '%' OR o.phone LIKE '%' || $3 || '%')
       ORDER BY o.created_at DESC LIMIT 300`,
      [status, pay, s]
    );
  }],

  ['GET', 'admin/orders/:id', async (req, { id }) => {
    const o = await one(`SELECT * FROM orders WHERE id = $1`, [int(id)]);
    if (!o) fail(404, 'Buyurtma topilmadi');
    o.items = await sql(
      `SELECT oi.*, v.sku FROM order_items oi LEFT JOIN variants v ON v.id = oi.variant_id WHERE oi.order_id = $1 ORDER BY oi.id`, [o.id]
    );
    return o;
  }],

  ['PATCH', 'admin/orders/:id', async (req, { id }, body) => {
    const oid = int(id);
    const o = await one(`SELECT * FROM orders WHERE id = $1`, [oid]);
    if (!o) fail(404, 'Buyurtma topilmadi');

    if (body.action === 'cancel') {
      const upd = await cancelOrder(oid, str(body.reason, 200));
      await notifyCustomer(upd, `❌ Buyurtma ${upd.code} bekor qilindi.${body.reason ? '\nSabab: ' + body.reason : ''}`);
      return upd;
    }
    if (o.status === 'cancelled') fail(400, 'Bekor qilingan buyurtmani o\'zgartirib bo\'lmaydi');

    if (body.action === 'approve_payment') {
      const upd = await one(
        `UPDATE orders SET payment_status = 'paid', paid_at = now(), status = CASE WHEN status = 'new' THEN 'confirmed' ELSE status END,
           updated_at = now() WHERE id = $1 RETURNING *`, [oid]
      );
      await notifyCustomer(upd, `✅ To'lov tasdiqlandi! Buyurtma ${upd.code} (${money(upd.total)}) tayyorlanmoqda.`);
      return upd;
    }
    if (body.action === 'reject_payment') {
      const upd = await one(
        `UPDATE orders SET payment_status = 'rejected', admin_note = COALESCE(NULLIF($2,''), admin_note), updated_at = now() WHERE id = $1 RETURNING *`,
        [oid, str(body.reason, 200)]
      );
      await notifyCustomer(upd, `⚠️ ${upd.code}: to'lov cheki tasdiqlanmadi.${body.reason ? '\nSabab: ' + body.reason : ''}\nIltimos, ilovada chekni qayta yuklang.`);
      return upd;
    }

    const status = body.status && ORDER_TRANSITIONS.includes(body.status) ? body.status : o.status;
    if (status !== o.status && ['packing', 'shipped', 'delivered'].includes(status) && o.payment_status !== 'paid') {
      fail(400, "Avval to'lovni tasdiqlang — do'kon faqat karta orqali oldindan to'lov bilan ishlaydi");
    }
    const upd = await one(
      `UPDATE orders SET status = $2, tracking = $3, admin_note = $4, updated_at = now() WHERE id = $1 RETURNING *`,
      [oid, status, body.tracking !== undefined ? str(body.tracking, 120) || null : o.tracking,
        body.admin_note !== undefined ? str(body.admin_note, 500) || null : o.admin_note]
    );
    if (status !== o.status) {
      const msgs = {
        confirmed: `✅ Buyurtma ${upd.code} tasdiqlandi.`,
        packing: `📦 Buyurtma ${upd.code} yig'ilmoqda.`,
        shipped: `🚚 Buyurtma ${upd.code} yo'lga chiqdi.${upd.tracking ? '\nTrek raqam: ' + upd.tracking : ''}`,
        delivered: `🎉 Buyurtma ${upd.code} yetkazildi. Xaridingiz uchun rahmat! — CLIMBER`,
      };
      if (msgs[status]) await notifyCustomer(upd, msgs[status]);
    }
    return upd;
  }],

  ['GET', 'admin/receipt/:id', async (req, { id }) => {
    const img = await one(`SELECT i.mime, i.data FROM orders o JOIN images i ON i.id = o.receipt_image_id WHERE o.id = $1`, [int(id)]);
    if (!img) fail(404, 'Chek topilmadi');
    return { __raw: Buffer.from(img.data), headers: { 'content-type': img.mime, 'cache-control': 'private, max-age=3600' } };
  }],

  ['GET', 'admin/customers', async () => sql(
    `SELECT phone, max(customer_name) AS name, max(tg_username) AS tg_username, max(region) AS region,
       count(*) FILTER (WHERE status <> 'cancelled')::int AS orders,
       COALESCE(sum(total) FILTER (WHERE payment_status = 'paid'), 0)::bigint AS spent,
       max(created_at) AS last_order
     FROM orders GROUP BY phone ORDER BY spent DESC, last_order DESC LIMIT 500`
  )],

  // ---------- Mahsulotlar ----------
  ['GET', 'admin/products', async () => sql(`${PRODUCT_SELECT} ORDER BY p.sort, p.id`)],

  // Tartib raqamini tez o'zgartirish (ro'yxatdan)
  ['PATCH', 'admin/products/:id/sort', async (req, { id }, b) => {
    const p = await one(`UPDATE products SET sort = $2, updated_at = now() WHERE id = $1 RETURNING id, sort`, [int(id), Math.max(int(b.sort, 0), 0)]);
    if (!p) fail(404, 'Mahsulot topilmadi');
    return p;
  }],

  ['POST', 'admin/products', async (req, _, body) => {
    const f = productFields(body);
    return tx(async (q) => {
      const [p] = await q(
        `INSERT INTO products(name, category_id, brand, price, old_price, description, images, is_active, is_featured, is_new, sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11, (SELECT COALESCE(max(sort), 0) + 10 FROM products))) RETURNING id`, f
      );
      await saveVariants(q, p.id, body.variants);
      return p;
    });
  }],

  ['PUT', 'admin/products/:id', async (req, { id }, body) => {
    const f = productFields(body);
    return tx(async (q) => {
      const [p] = await q(
        `UPDATE products SET name=$2, category_id=$3, brand=$4, price=$5, old_price=$6, description=$7, images=$8,
           is_active=$9, is_featured=$10, is_new=$11, sort=COALESCE($12, sort), updated_at=now() WHERE id=$1 RETURNING id`, [int(id), ...f]
      );
      if (!p) fail(404, 'Mahsulot topilmadi');
      await saveVariants(q, p.id, body.variants);
      return p;
    });
  }],

  ['DELETE', 'admin/products/:id', async (req, { id }) => {
    const used = await one(`SELECT 1 FROM order_items WHERE product_id = $1 LIMIT 1`, [int(id)]);
    if (used) {
      await sql(`UPDATE products SET is_active = false WHERE id = $1`, [int(id)]);
      return { archived: true };
    }
    await sql(`DELETE FROM products WHERE id = $1`, [int(id)]);
    return { deleted: true };
  }],

  ['POST', 'admin/upload', async (req, _, body) => {
    const { mime, buffer } = parseDataUrl(body.image);
    const img = await one(`INSERT INTO images(mime, data) VALUES ($1, $2) RETURNING id`, [mime, buffer]);
    return { url: `/api/img/${img.id}` };
  }],

  // ---------- Kategoriyalar ----------
  ['GET', 'admin/categories', async () => sql(
    `SELECT c.*, (SELECT count(*)::int FROM products p WHERE p.category_id = c.id) AS count FROM categories c ORDER BY c.sort, c.id`
  )],
  ['POST', 'admin/categories', async (req, _, b) => {
    const name = str(b.name, 60);
    if (name.length < 2) fail(400, 'Nomini kiriting');
    return one(
      `INSERT INTO categories(name, slug, sort, is_active) VALUES ($1, $2 || '-' || substr(md5(random()::text), 1, 4), $3, $4) RETURNING *`,
      [name, slugify(name), int(b.sort, 0), b.is_active !== false]
    );
  }],
  ['PUT', 'admin/categories/:id', async (req, { id }, b) => {
    const name = str(b.name, 60);
    if (name.length < 2) fail(400, 'Nomini kiriting');
    return one(`UPDATE categories SET name=$2, sort=$3, is_active=$4 WHERE id=$1 RETURNING *`, [int(id), name, int(b.sort, 0), b.is_active !== false]);
  }],
  ['DELETE', 'admin/categories/:id', async (req, { id }) => {
    await sql(`DELETE FROM categories WHERE id = $1`, [int(id)]);
    return { ok: true };
  }],

  // ---------- Bannerlar ----------
  ['GET', 'admin/banners', async () => sql(`SELECT * FROM banners ORDER BY sort, id`)],
  ['POST', 'admin/banners', async (req, _, b) => one(
    `INSERT INTO banners(badge, title, subtitle, image, link_type, link_value, sort, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    bannerFields(b)
  )],
  ['PUT', 'admin/banners/:id', async (req, { id }, b) => one(
    `UPDATE banners SET badge=$2, title=$3, subtitle=$4, image=$5, link_type=$6, link_value=$7, sort=$8, is_active=$9 WHERE id=$1 RETURNING *`,
    [int(id), ...bannerFields(b)]
  )],
  ['DELETE', 'admin/banners/:id', async (req, { id }) => {
    await sql(`DELETE FROM banners WHERE id = $1`, [int(id)]);
    return { ok: true };
  }],

  // ---------- Ombor ----------
  ['GET', 'admin/stock', async () => sql(
    `SELECT v.*, p.name, p.price, p.brand, p.is_active, p.images->>0 AS image, c.name AS category_name,
       (SELECT max(created_at) FROM stock_movements m WHERE m.variant_id = v.id) AS last_move,
       (SELECT COALESCE(sum(-m.qty), 0)::int FROM stock_movements m WHERE m.variant_id = v.id AND m.type = 'sale' AND m.created_at > now() - interval '30 days') AS sold_30
     FROM variants v JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id
     WHERE v.sort < 999
     ORDER BY p.name, v.sort, v.id`
  )],

  // Bir nechta qatorli kirim/chiqim/inventarizatsiya hujjati
  ['POST', 'admin/stock/movements', async (req, _, b) => {
    const type = str(b.type, 10);
    const rows = Array.isArray(b.items) ? b.items : [];
    if (!rows.length) fail(400, "Kamida bitta qator qo'shing");
    return tx(async (q) => {
      const out = [];
      for (const r of rows) {
        out.push({
          variant_id: int(r.variant_id),
          stock: await moveStock(q, { ...r, type, supplier: b.supplier, note: r.note || b.note }),
        });
      }
      return out;
    });
  }],

  ['GET', 'admin/stock/movements', async (req, _, __, ___, query) => sql(
    `SELECT m.*, v.size, v.sku, p.name, p.id AS product_id, o.code AS order_code
     FROM stock_movements m JOIN variants v ON v.id = m.variant_id JOIN products p ON p.id = v.product_id
     LEFT JOIN orders o ON o.id = m.order_id
     WHERE ($1::int IS NULL OR m.variant_id = $1) AND ($2 = '' OR m.type = $2)
     ORDER BY m.created_at DESC, m.id DESC LIMIT 400`,
    [int(query.variant_id), str(query.type, 10)]
  )],

  // ---------- Sozlamalar ----------
  ['GET', 'admin/settings', async () => ({
    settings: await getSettings(),
    regions: REGIONS,
    env: {
      bot: botEnabled(),
      admin_chat: Boolean(process.env.ADMIN_CHAT_ID),
      telegram_pay: Boolean(process.env.PAYMENT_PROVIDER_TOKEN),
    },
    statuses: ORDER_STATUSES,
    payment_statuses: PAYMENT_STATUSES,
  })],

  ['PUT', 'admin/settings', async (req, _, b) => {
    const s = await getSettings();
    if (b.shop) {
      s.shop = {
        ...s.shop,
        ...Object.fromEntries(['name', 'tagline', 'admin_telegram', 'channel', 'instagram', 'address', 'hours'].map((k) => [k, str(b.shop[k] ?? s.shop[k], 300)])),
        phones: (Array.isArray(b.shop.phones) ? b.shop.phones : s.shop.phones).map((p) => str(p, 30)).filter(Boolean).slice(0, 4),
      };
    }
    if (b.payment) {
      const cards = (Array.isArray(b.payment.cards) ? b.payment.cards : []).slice(0, 5).map((c) => ({
        type: ['Uzcard', 'Humo', 'Visa', 'Mastercard'].includes(c.type) ? c.type : 'Uzcard',
        number: str(c.number, 25).replace(/[^\d]/g, '').replace(/(\d{4})(?=\d)/g, '$1 '),
        holder: str(c.holder, 80),
      })).filter((c) => c.number.replace(/\s/g, '').length >= 16);
      s.payment = { cards, reserve_hours: Math.max(int(b.payment.reserve_hours, 24), 0), note: str(b.payment.note, 400) };
    }
    if (b.delivery) {
      s.delivery = {
        pickup_enabled: b.delivery.pickup_enabled !== false,
        free_from: int(b.delivery.free_from) || null,
        days: str(b.delivery.days, 40) || DEFAULT_SETTINGS.delivery.days,
        prices: Object.fromEntries(REGIONS.map((r) => [r, Math.max(int(b.delivery.prices?.[r], 0), 0)])),
      };
    }
    for (const key of ['shop', 'payment', 'delivery']) {
      await sql(`INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`, [key, JSON.stringify(s[key])]);
    }
    return s;
  }],

  ['POST', 'admin/telegram/webhook', async (req) => {
    if (!botEnabled()) fail(400, 'BOT_TOKEN sozlanmagan (Vercel → Settings → Environment Variables)');
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (/localhost|127\.0\.0\.1/.test(host)) fail(400, 'Webhook faqat Vercel domenida o\'rnatiladi');
    const r = await tg('setWebhook', {
      url: `https://${host}/api/bot/webhook`,
      secret_token: webhookSecret(),
      allowed_updates: ['message', 'pre_checkout_query'],
    });
    await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: "Do'kon", web_app: { url: `https://${host}/` } } });
    if (!r?.ok) fail(502, r?.description || 'Telegram xatosi');
    return { ok: true, url: `https://${host}/api/bot/webhook` };
  }],
];

function bannerFields(b) {
  const title = str(b.title, 80);
  if (!title) fail(400, 'Sarlavhani kiriting');
  const link_type = ['none', 'category', 'product'].includes(b.link_type) ? b.link_type : 'none';
  return [str(b.badge, 40) || null, title, str(b.subtitle, 120) || null, str(b.image, 300) || null, link_type, str(b.link_value, 40) || null, int(b.sort, 0), b.is_active !== false];
}
