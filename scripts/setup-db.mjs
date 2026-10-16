// Bazani yaratish va boshlang'ich ma'lumotlarni yuklash:
//   npm run db:setup            — jadvallarni yaratadi, bo'sh bo'lsa seed qiladi
//   npm run db:setup -- --reset — HAMMA jadvallarni o'chirib, qaytadan yaratadi
import { root } from './env.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql, SCHEMA } from '../lib/db.js';
import { DEFAULT_SETTINGS } from '../lib/config.js';
import { PRODUCT_ORDER, CATEGORY_ORDER, FEATURED, applyCatalogLayout } from './order.mjs';

const seed = JSON.parse(readFileSync(path.join(root, 'data/seed.json'), 'utf8'));
const reset = process.argv.includes('--reset');

const slugify = (s) =>
  s.toLowerCase().replace(/[`'ʻʼ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const SIZES = {
  'Dvoykalar': ['S', 'M', 'L', 'XL', 'XXL'],
  'Polo va futbolkalar': ['M', 'L', 'XL', 'XXL'],
  'Oyoq kiyimlar': ['40', '41', '42', '43', '44'],
  'Paltolar': ['M', 'L', 'XL', 'XXL'],
  'Jinsi va trikotajlar': ['30', '31', '32', '33', '34'],
};
const NEW = [1, 2, 3, 4, 5, 6, 7, 8, 9];

async function run() {
  if (reset) {
    console.log('Jadvallar o\'chirilmoqda...');
    await sql(`DROP TABLE IF EXISTS stock_movements, order_items, orders, variants, products, categories, images, banners, stories, settings CASCADE`);
  }
  for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await sql(stmt);
  console.log('Sxema tayyor.');

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await sql(`INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`, [key, JSON.stringify(value)]);
  }

  const [{ count }] = await sql(`SELECT count(*)::int AS count FROM categories`);
  if (count > 0) {
    console.log('Ma\'lumotlar allaqachon bor — seed o\'tkazib yuborildi.');
    return;
  }

  const catIds = {};
  for (const [i, name] of seed.kategoriyalar.entries()) {
    const [row] = await sql(`INSERT INTO categories(name, slug, sort) VALUES ($1, $2, $3) RETURNING id`, [name, slugify(name), CATEGORY_ORDER.includes(name) ? CATEGORY_ORDER.indexOf(name) : i]);
    catIds[name] = row.id;
  }

  for (const p of seed.mahsulotlar) {
    const brand = /masculino/i.test(p.nomi) ? 'Masculino' : /gratude/i.test(p.nomi) ? 'Gratude' : null;
    const desc = p.izoh?.startsWith('Kanaldagi izoh:') ? p.izoh.replace('Kanaldagi izoh:', '').trim() : null;
    const images = p.rasmlar.map((r) => '/img/products/' + path.basename(r));
    const [prod] = await sql(
      `INSERT INTO products(id, name, category_id, brand, price, description, images, is_featured, is_new, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [p.id, p.nomi, catIds[p.kategoriya], brand, p.narx, desc, JSON.stringify(images), FEATURED.includes(p.id), NEW.includes(p.id),
        (PRODUCT_ORDER.indexOf(p.id) + 1) * 10 || 1000]
    );
    const sizes = SIZES[p.kategoriya] || ['Standart'];
    for (const [i, size] of sizes.entries()) {
      const stock = ((p.id * 7 + i * 3) % 5) + 1; // namuna qoldiq — omborda tuzatiladi
      const [v] = await sql(
        `INSERT INTO variants(product_id, size, sku, stock, sort) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [prod.id, size, `CL-${String(p.id).padStart(3, '0')}-${size}`, stock, i]
      );
      await sql(
        `INSERT INTO stock_movements(variant_id, type, qty, balance, note) VALUES ($1,'in',$2,$2,'Boshlang''ich qoldiq (namuna)')`,
        [v.id, stock]
      );
    }
  }
  await sql(`SELECT setval('products_id_seq', (SELECT max(id) FROM products))`);

  const banners = [
    ['Yangi kolleksiya', 'Kuz 2026', 'Dvoykalar va charm oyoq kiyimlar', '/img/products/01_1.jpg', 'category', String(catIds['Dvoykalar'])],
    ['Since 2009', 'Siz eng yaxshisiga loyiqsiz', 'Premium polo va futbolkalar', '/img/products/14_1.jpg', 'category', String(catIds['Polo va futbolkalar'])],
    ["O'zbekiston bo'ylab", 'Tez yetkazib berish', "Karta orqali xavfsiz to'lov", '/img/products/06_1.jpg', 'category', String(catIds['Oyoq kiyimlar'])],
  ];
  for (const [i, b] of banners.entries()) {
    await sql(`INSERT INTO banners(badge, title, subtitle, image, link_type, link_value, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [...b, i]);
  }
  await applyCatalogLayout(sql);
  console.log(`Seed tayyor: ${seed.mahsulotlar.length} mahsulot, ${seed.kategoriyalar.length} kategoriya.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
