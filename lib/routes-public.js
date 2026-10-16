import { sql, one } from './db.js';
import { REGIONS, ORDER_STATUSES, PAYMENT_STATUSES } from './config.js';
import { fail, int, str, parseDataUrl } from './http.js';
import { verifyInitData } from './auth.js';
import { getSettings, PRODUCT_SELECT, publicProduct, createOrder } from './store.js';
import { tg, notifyAdmins, sendPhotoToAdmins, esc, money, botEnabled } from './telegram.js';

function who(req, body = {}) {
  const initData = req.headers['x-telegram-init-data'] || body.initData || '';
  const user = verifyInitData(initData);
  const device_id = str(req.headers['x-device-id'] || body.device_id, 64) || null;
  return {
    verified: Boolean(user),
    tg_user_id: user?.id || null,
    tg_username: user?.username || null,
    device_id,
  };
}

async function findOwnOrder(req, code) {
  const w = who(req);
  const o = await one(`SELECT * FROM orders WHERE code = $1`, [str(code, 20)]);
  if (!o) fail(404, 'Buyurtma topilmadi');
  const owns = (w.device_id && o.device_id === w.device_id) || (w.tg_user_id && String(o.tg_user_id) === String(w.tg_user_id));
  if (!owns) fail(404, 'Buyurtma topilmadi');
  return o;
}

function paymentInfo(settings) {
  return {
    cards: settings.payment.cards || [],
    note: settings.payment.note,
    reserve_hours: settings.payment.reserve_hours,
    telegram_pay: Boolean(process.env.PAYMENT_PROVIDER_TOKEN && process.env.BOT_TOKEN),
  };
}

async function orderPayload(o) {
  const items = await sql(`SELECT name, size, image, price, qty, product_id FROM order_items WHERE order_id = $1 ORDER BY id`, [o.id]);
  return {
    code: o.code,
    status: o.status,
    status_text: ORDER_STATUSES[o.status],
    payment_status: o.payment_status,
    payment_text: PAYMENT_STATUSES[o.payment_status],
    payment_method: o.payment_method,
    customer_name: o.customer_name,
    phone: o.phone,
    region: o.region,
    district: o.district,
    address: o.address,
    delivery_method: o.delivery_method,
    delivery_price: o.delivery_price,
    subtotal: o.subtotal,
    total: o.total,
    tracking: o.tracking,
    has_receipt: Boolean(o.receipt_image_id),
    created_at: o.created_at,
    items,
  };
}

export const publicRoutes = [
  ['GET', 'bootstrap', async () => {
    const [settings, categories, banners, products] = await Promise.all([
      getSettings(),
      sql(`SELECT c.id, c.name, c.slug, c.image, (SELECT count(*)::int FROM products p WHERE p.category_id = c.id AND p.is_active) AS count
           FROM categories c WHERE c.is_active ORDER BY c.sort, c.id`),
      sql(`SELECT id, badge, title, subtitle, image, link_type, link_value FROM banners WHERE is_active ORDER BY sort, id`),
      sql(`${PRODUCT_SELECT} WHERE p.is_active ORDER BY p.sort, p.id`),
    ]);
    return {
      shop: settings.shop,
      delivery: settings.delivery,
      payment: paymentInfo(settings),
      regions: REGIONS,
      categories: categories.filter((c) => c.count > 0),
      banners,
      products: products.map(publicProduct),
    };
  }],

  ['GET', 'products/:id', async (req, { id }) => {
    const p = await one(`${PRODUCT_SELECT} WHERE p.id = $1 AND p.is_active`, [int(id)]);
    if (!p) fail(404, 'Mahsulot topilmadi');
    return publicProduct(p);
  }],

  ['POST', 'orders', async (req, _, body) => {
    const w = who(req, body);
    if (!w.device_id && !w.tg_user_id) fail(400, 'Qurilma aniqlanmadi');
    const { order, lines } = await createOrder(body, w);
    const settings = await getSettings();

    const list = lines.map((l) => `• ${esc(l.name)} (${esc(l.size)}) × ${l.qty} — ${money(l.price * l.qty)}`).join('\n');
    await notifyAdmins(
      `🛍 <b>Yangi buyurtma ${order.code}</b>\n\n${list}\n\n` +
      `Yetkazish: ${order.delivery_method === 'pickup' ? "Do'kondan olib ketish" : esc(`${order.region}, ${order.district || ''} ${order.address || ''}`)}\n` +
      `Yetkazish narxi: ${money(order.delivery_price)}\n<b>Jami: ${money(order.total)}</b>\n\n` +
      `👤 ${esc(order.customer_name)}\n📞 ${esc(order.phone)}${order.tg_username ? `\n✈️ @${esc(order.tg_username)}` : ''}` +
      `${order.comment ? `\n💬 ${esc(order.comment)}` : ''}\n\n⏳ To'lov kutilmoqda`
    );
    return { order: await orderPayload(order), payment: paymentInfo(settings) };
  }],

  ['GET', 'orders/my', async (req) => {
    const w = who(req);
    if (!w.device_id && !w.tg_user_id) return [];
    const rows = await sql(
      `SELECT * FROM orders WHERE ($1::text IS NOT NULL AND device_id = $1) OR ($2::bigint IS NOT NULL AND tg_user_id = $2)
       ORDER BY created_at DESC LIMIT 50`,
      [w.device_id, w.tg_user_id]
    );
    return Promise.all(rows.map(orderPayload));
  }],

  ['GET', 'orders/:code', async (req, { code }) => {
    const o = await findOwnOrder(req, code);
    return { order: await orderPayload(o), payment: paymentInfo(await getSettings()) };
  }],

  ['POST', 'orders/:code/receipt', async (req, { code }, body) => {
    const o = await findOwnOrder(req, code);
    if (o.status === 'cancelled') fail(400, 'Buyurtma bekor qilingan');
    if (o.payment_status === 'paid') fail(400, "Buyurtma allaqachon to'langan");
    const { mime, buffer } = parseDataUrl(body.image);
    const img = await one(`INSERT INTO images(mime, data) VALUES ($1, $2) RETURNING id`, [mime, buffer]);
    const upd = await one(
      `UPDATE orders SET receipt_image_id = $2, payment_status = 'review', updated_at = now() WHERE id = $1 RETURNING *`,
      [o.id, img.id]
    );
    await sendPhotoToAdmins(
      buffer, mime,
      `🧾 <b>${o.code}</b> — to'lov cheki yuklandi\nSumma: <b>${money(o.total)}</b>\n👤 ${esc(o.customer_name)}, ${esc(o.phone)}\n\nAdmin panelda tasdiqlang.`
    );
    return { order: await orderPayload(upd) };
  }],

  // Telegram Payments (Click / Payme provayderi BotFather orqali ulangan bo'lsa)
  ['POST', 'orders/:code/invoice', async (req, { code }) => {
    const o = await findOwnOrder(req, code);
    if (!process.env.PAYMENT_PROVIDER_TOKEN || !botEnabled()) fail(400, "Bu to'lov usuli sozlanmagan");
    if (o.payment_status === 'paid') fail(400, "Allaqachon to'langan");
    if (o.status === 'cancelled') fail(400, 'Buyurtma bekor qilingan');
    const items = await sql(`SELECT name, size, price, qty FROM order_items WHERE order_id = $1`, [o.id]);
    const prices = items.map((i) => ({ label: `${i.name} (${i.size}) ×${i.qty}`.slice(0, 60), amount: i.price * i.qty * 100 }));
    if (o.delivery_price) prices.push({ label: 'Yetkazib berish', amount: o.delivery_price * 100 });
    const r = await tg('createInvoiceLink', {
      title: `CLIMBER — ${o.code}`,
      description: `${items.length} ta mahsulot. Jami ${money(o.total)}`,
      payload: `order:${o.code}`,
      provider_token: process.env.PAYMENT_PROVIDER_TOKEN,
      currency: 'UZS',
      prices,
    });
    if (!r?.ok) fail(502, "To'lov havolasini yaratib bo'lmadi");
    return { url: r.result };
  }],

  ['GET', 'img/:id', async (req, { id }, _, res) => {
    const img = await one(`SELECT mime, data FROM images WHERE id = $1`, [int(id)]);
    if (!img) fail(404, 'Rasm topilmadi');
    return { __raw: Buffer.from(img.data), headers: { 'content-type': img.mime, 'cache-control': 'public, max-age=31536000, immutable' } };
  }],

  // Telegram bot webhook: /start, to'lovni tasdiqlash
  ['POST', 'bot/webhook', async (req, _, update) => {
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    if (!process.env.AUTH_SECRET || secret !== webhookSecret()) fail(403, 'forbidden');

    if (update.pre_checkout_query) {
      const q = update.pre_checkout_query;
      const code = String(q.invoice_payload || '').replace('order:', '');
      const o = await one(`SELECT * FROM orders WHERE code = $1`, [code]);
      const ok = o && o.status !== 'cancelled' && o.payment_status !== 'paid' && q.total_amount === o.total * 100;
      await tg('answerPreCheckoutQuery', ok
        ? { pre_checkout_query_id: q.id, ok: true }
        : { pre_checkout_query_id: q.id, ok: false, error_message: "Buyurtma topilmadi yoki muddati o'tgan" });
      return { ok: true };
    }

    const msg = update.message;
    if (msg?.successful_payment) {
      const code = String(msg.successful_payment.invoice_payload || '').replace('order:', '');
      const o = await one(
        `UPDATE orders SET payment_status = 'paid', status = CASE WHEN status = 'new' THEN 'confirmed' ELSE status END,
           paid_at = now(), payment_method = 'telegram', updated_at = now() WHERE code = $1 RETURNING *`,
        [code]
      );
      if (o) {
        await notifyAdmins(`✅ <b>${o.code}</b> to'landi (Telegram to'lov) — ${money(o.total)}`);
        await tg('sendMessage', { chat_id: msg.chat.id, text: `✅ To'lov qabul qilindi! Buyurtma ${o.code} tayyorlanmoqda.` });
      }
      return { ok: true };
    }

    if (msg?.text?.startsWith('/start')) {
      const url = `https://${req.headers['x-forwarded-host'] || req.headers.host}/`;
      await tg('sendMessage', {
        chat_id: msg.chat.id,
        text: "CLIMBER — Since 2009 🖤\n\nErkaklar uchun premium kiyimlar. O'zbekiston bo'ylab yetkazib berish.\nDo'konni ochish uchun quyidagi tugmani bosing 👇",
        reply_markup: { inline_keyboard: [[{ text: "🛍 Do'konni ochish", web_app: { url } }]] },
      });
    }
    return { ok: true };
  }],
];

export const webhookSecret = () =>
  (process.env.AUTH_SECRET || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
