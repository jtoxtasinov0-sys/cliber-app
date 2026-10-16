// Mini app va admin panel uchun umumiy yordamchilar

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const fmt = (n) => Number(n || 0).toLocaleString('ru-RU').replace(/ |,/g, ' ');
export const money = (n) => `${fmt(n)} so'm`;

export function fmtDate(d, withTime = true) {
  const dt = new Date(d);
  const pad = (x) => String(x).padStart(2, '0');
  const s = `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
  return withTime ? `${s}, ${pad(dt.getHours())}:${pad(dt.getMinutes())}` : s;
}

// Rasmni brauzerda kichraytirib, JPEG data-URL qaytaradi
export function compressImage(file, maxSide = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(new Error('Rasm fayl tanlang'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error("Rasmni o'qib bo'lmadi"));
    img.src = url;
  });
}

export function formatPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d.startsWith('998')) d = '998' + d.replace(/^998?/, '');
  d = d.slice(0, 12);
  const p = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12)].filter(Boolean);
  return '+' + p.join(' ');
}
export const phoneDigits = (s) => '+' + String(s || '').replace(/\D/g, '');

const P = {
  home: '<path d="m3 10.5 9-7 9 7V20a1.5 1.5 0 0 1-1.5 1.5H15v-7H9v7H4.5A1.5 1.5 0 0 1 3 20z"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  bag: '<path d="M5.5 7.5h13l1 12.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M8.5 10V6.5a3.5 3.5 0 0 1 7 0V10"/>',
  heart: '<path d="M19.6 12.7 12 20.2l-7.6-7.5a4.9 4.9 0 0 1 7.6-6.2 4.9 4.9 0 0 1 7.6 6.2z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  truck: '<path d="M2.5 6.5h11v10h-11zM13.5 9.5h4l3 3.2v3.8h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.8 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.7 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.6 14-1.6 7.5 5-3 5 3-1.6-7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  phone: '<path d="M5 3.5h3.5l1.8 4.5-2.3 1.5a11 11 0 0 0 6.5 6.5l1.5-2.3 4.5 1.8V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5z"/>',
  send: '<path d="M21 4 3 11l6.5 2.5L12 20l3-6.5z"/><path d="m9.5 13.5 5.5-5"/>',
  insta: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="0.6" fill="currentColor"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  store: '<path d="M4 9.5V20h16V9.5M3 5h18l-1 4.5a2.8 2.8 0 0 1-5.3.4 2.8 2.8 0 0 1-5.4 0A2.8 2.8 0 0 1 4 9.5z"/><path d="M10 20v-5h4v5"/>',
  box: '<path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9z"/><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9"/>',
  receipt: '<path d="M5.5 3h13v18l-2.2-1.5L14 21l-2-1.5-2 1.5-2.3-1.5L5.5 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  tie: '<path d="M9 3h6l-1.5 4 2.5 10-4 4-4-4 2.5-10z"/>',
  shirt: '<path d="M8 3.5 3.5 6l1.5 4.5 2.5-1V20.5h9V9.5l2.5 1L20.5 6 16 3.5a4 4 0 0 1-8 0z"/>',
  shoe: '<path d="M3 17.5V8l4.5-1 2 3.5 5 1.5 5 2A2.5 2.5 0 0 1 21 16.5v1z"/><path d="M3 17.5h18v1.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  briefcase: '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8.5 7.5V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2M3 13h18"/>',
  coat: '<path d="M8.5 3h7l4.5 4v14h-5.5L12 15l-2.5 6H4V7z"/><path d="M12 3v12"/>',
  jeans: '<path d="M6 3h12l1.2 18H14l-2-11-2 11H4.8z"/><path d="M6 7h12"/>',
  cap: '<path d="M4 15a8 8 0 0 1 16 0"/><path d="M2.5 15h13.5c3 0 5.5 1 5.5 2.3S19.8 19 18 19H2.5z"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L6 21"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  in: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  out: '<path d="M12 20V9M7 14l5-5 5 5M4 4h16"/>',
  scale: '<path d="M12 3v18M5 21h14M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
};

export const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || P.sparkle}</svg>`;

export function categoryIcon(name = '') {
  const n = name.toLowerCase();
  if (n.includes('dvoyka') || n.includes('kostyum')) return 'tie';
  if (n.includes('polo') || n.includes('futbol') || n.includes("ko'ylak")) return 'shirt';
  if (n.includes('oyoq') || n.includes('krossov') || n.includes('poyabzal') || n.includes('shlyop') || n.includes('ked')) return 'shoe';
  if (n.includes('aksess') || n.includes('sumka')) return 'briefcase';
  if (n.includes('palto') || n.includes('kurtka')) return 'coat';
  if (n.includes('jinsi') || n.includes('shim') || n.includes('trikotaj')) return 'jeans';
  if (n.includes('kepka') || n.includes('bosh')) return 'cap';
  return 'sparkle';
}
