// Lokal ishga tushirish (npm run dev) va Render.com uchun server (npm start)
import './env.mjs';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { root } from './env.mjs';
import handler from '../api/main.js';

const PORT = Number(process.env.PORT || 3000);
const pub = path.join(root, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return handler(req, res);
  let file = path.join(pub, decodeURIComponent(url.pathname));
  if (!file.startsWith(pub)) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    if (!path.extname(file)) file += '.html';
  }
  try {
    const data = await readFile(file);
    const cache = url.pathname.startsWith('/img/') ? 'public, max-age=604800' : 'no-cache';
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': cache }).end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, () => console.log(`CLIMBER: http://localhost:${PORT}  |  admin: http://localhost:${PORT}/admin`));
