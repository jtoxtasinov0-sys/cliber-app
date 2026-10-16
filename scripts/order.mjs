// Boshlang'ich tartib: avval polo/futbolkalar, keyin kostyumlar, krossovkalar, sumkalar, oxirida shlyopkalar
export const PRODUCT_ORDER = [14, 15, 16, 25, 26, 27, 17, 18, 24, 19, 20, 21, 22, 23, 1, 2, 3, 4, 6, 5, 7, 8, 9, 10, 11, 12, 13, 28, 29, 30, 31, 32, 33, 34, 35, 36];
export const CATEGORY_ORDER = ['Polo', 'Futbolkalar', 'Dvoykalar', 'Krossovka va kedlar', 'Shlyopkalar', 'Aksessuarlar', 'Jinsi va trikotajlar', 'Paltolar', 'Kepkalar'];
export const FEATURED = [14, 15, 25, 26, 16, 17, 1];

// Kategoriyalarni mayda bo'limlarga ajratish (takroriy ishga tushirsa ham xavfsiz)
const RENAME = { 'Polo va futbolkalar': 'Polo', 'Oyoq kiyimlar': 'Krossovka va kedlar' };
const MOVE = {
  Futbolkalar: [17, 18, 19, 20, 21, 22, 23, 24],
  Shlyopkalar: [10, 11, 12, 13, 28, 29, 30, 31, 32, 33, 34, 35, 36],
};

export async function applyCatalogLayout(sql) {
  await sql(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS image TEXT`);
  for (const [from, to] of Object.entries(RENAME)) {
    await sql(`UPDATE categories SET name = $2 WHERE name = $1 AND NOT EXISTS (SELECT 1 FROM categories WHERE name = $2)`, [from, to]);
  }
  for (const [name, ids] of Object.entries(MOVE)) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await sql(`INSERT INTO categories(name, slug) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = $1)`, [name, slug]);
    await sql(`UPDATE products SET category_id = (SELECT id FROM categories WHERE name = $1) WHERE id = ANY($2::int[])`, [name, ids]);
  }
  for (const [i, name] of CATEGORY_ORDER.entries()) await sql(`UPDATE categories SET sort = $2 WHERE name = $1`, [name, i]);
}
