export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const fail = (status, message) => {
  throw new HttpError(status, message);
};

export async function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body !== 'string' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString() : '';
  if (!raw && req.readable !== false) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    raw = Buffer.concat(chunks).toString();
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    fail(400, "Noto'g'ri JSON");
  }
}

export function send(res, status, data, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (Buffer.isBuffer(data)) return res.end(data);
  if (typeof data === 'string') return res.end(data);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

// data:image/jpeg;base64,... -> { mime, buffer }
export function parseDataUrl(dataUrl, maxBytes = 3 * 1024 * 1024) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) fail(400, 'Rasm formati noto\'g\'ri (JPG, PNG yoki WEBP)');
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length > maxBytes) fail(413, 'Rasm hajmi juda katta');
  return { mime: m[1], buffer };
}

export const int = (v, def = null) => {
  if (v === '' || v === null || v === undefined) return def;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : def;
};

export const str = (v, max = 500) => (v === null || v === undefined ? '' : String(v).trim().slice(0, max));
