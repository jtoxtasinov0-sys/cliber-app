// Yagona API kirish nuqtasi: /api/* so'rovlari vercel.json orqali shu yerga yo'naltiriladi.
import { HttpError, readBody, send } from '../lib/http.js';
import { verifyAdminToken } from '../lib/auth.js';
import { publicRoutes } from '../lib/routes-public.js';
import { adminRoutes } from '../lib/routes-admin.js';

const routes = [...publicRoutes, ...adminRoutes].map(([method, pattern, handler, opts = {}]) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  return { method, re, keys, handler, admin: pattern.startsWith('admin/') && !opts.public };
});

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  let path = url.searchParams.get('__route');
  if (path === null) path = url.pathname.replace(/^\/api\/?/, '');
  path = path.replace(/^\/+|\/+$/g, '');
  url.searchParams.delete('__route');
  const query = Object.fromEntries(url.searchParams);

  try {
    // Statik birinchi: "orders/my" kabi aniq yo'llar ":code" dan oldin tekshiriladi
    const candidates = routes.filter((r) => r.method === req.method && r.re.test(path));
    const route = candidates.find((r) => !r.keys.length) || candidates[0];
    if (!route) throw new HttpError(404, 'Topilmadi');

    if (route.admin) {
      // <img> so'rovlari sarlavha yubora olmaydi — chek rasmi uchun ?t= ham qabul qilinadi
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || (req.method === 'GET' ? query.t : '');
      if (!verifyAdminToken(token)) throw new HttpError(401, 'Avtorizatsiya talab qilinadi');
    }
    const m = route.re.exec(path);
    const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    const result = await route.handler(req, params, body, res, query);

    if (result && result.__raw) return send(res, 200, result.__raw, result.headers);
    send(res, 200, result ?? { ok: true }, { 'cache-control': 'no-store' });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    send(res, status, { error: status === 500 ? "Serverda xatolik. Keyinroq urinib ko'ring." : e.message });
  }
}
