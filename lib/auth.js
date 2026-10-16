import crypto from 'node:crypto';

const secret = () => process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || 'dev-secret';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function signAdminToken(days = 7) {
  const payload = b64url(JSON.stringify({ role: 'admin', exp: Date.now() + days * 864e5 }));
  const sig = b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token) {
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', secret()).update(payload).digest());
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.role === 'admin' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function checkPassword(input) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real || typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

// Telegram WebApp initData imzosini tekshiradi. BOT_TOKEN bo'lmasa — null.
export function verifyInitData(initData, maxAgeSec = 7 * 86400) {
  const token = process.env.BOT_TOKEN;
  if (!token || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const key = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calc = crypto.createHmac('sha256', key).update(check).digest('hex');
  if (calc !== hash) return null;
  if (Date.now() / 1000 - Number(params.get('auth_date') || 0) > maxAgeSec) return null;
  try {
    return JSON.parse(params.get('user') || 'null');
  } catch {
    return null;
  }
}
