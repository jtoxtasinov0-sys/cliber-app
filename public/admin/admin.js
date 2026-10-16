import { esc, money, fmt, fmtDate, compressImage, icon } from '/js/shared.js';

/* ================= Asosiy ================= */
const $app = document.getElementById('app');
const $modal = document.getElementById('modal-root');
const $toast = document.getElementById('toast');
let token = localStorage.getItem('cl_admin') || '';
const META = { statuses: {}, payment_statuses: {}, regions: [] };
let counters = { to_review: 0 };

let tt;
function toast(msg, err = false) {
  $toast.innerHTML = `${icon(err ? 'alert' : 'check', 'sm')}<span>${esc(msg)}</span>`;
  $toast.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(tt);
  tt = setTimeout(() => ($toast.className = 'toast'), 2800);
}

async function api(path, opts = {}) {
  const r = await fetch('/api/' + path, {
    method: opts.method || 'GET',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (r.status === 401 && path !== 'admin/login') {
    logout();
    throw new Error('Sessiya tugadi, qayta kiring');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Xatolik');
  return j;
}

async function withBtn(btn, fn) {
  btn?.classList.add('loading');
  try {
    return await fn();
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn?.classList.remove('loading');
  }
}

function logout() {
  token = '';
  localStorage.removeItem('cl_admin');
  renderLogin();
}

const STATUS_PILL = { new: 'gold', confirmed: 'blue', packing: 'amber', shipped: 'blue', delivered: 'green', cancelled: 'red' };
const PAY_PILL = { awaiting: 'amber', review: 'gold', paid: 'green', rejected: 'red', refunded: 'red' };
const MOVE = { in: ['Kirim', 'green'], out: ['Chiqim', 'red'], sale: ['Sotuv', 'gold'], return: ['Qaytarish', 'blue'], adjust: ['Inventarizatsiya', ''] };
const sPill = (s) => `<span class="pill ${STATUS_PILL[s] || ''}">${esc(META.statuses[s] || s)}</span>`;
const pPill = (s) => `<span class="pill ${PAY_PILL[s] || ''}">${esc(META.payment_statuses[s] || s)}</span>`;
const stockBadge = (v) => `<span class="stockbadge ${v.stock <= 0 ? 'out' : v.stock <= v.low_stock ? 'low' : ''}">${v.stock}</span>`;

function modal(html, { size = '', drawer = false } = {}) {
  $modal.innerHTML = drawer
    ? `<div class="drawer-bg"></div><aside class="drawer">${html}</aside>`
    : `<div class="modal-bg"><div class="modal ${size}">${html}</div></div>`;
  const close = () => ($modal.innerHTML = '');
  const box = $modal.querySelector(drawer ? '.drawer' : '.modal');
  $modal.querySelector(drawer ? '.drawer-bg' : '.modal-bg').addEventListener('mousedown', (e) => {
    if (e.target === e.currentTarget) close();
  });
  box.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
  return { box, close };
}
const mHead = (title) => `<div class="modal-h"><h2>${title}</h2><button class="btn btn-dark btn-icon" data-close aria-label="Yopish">${icon('x', 'sm')}</button></div>`;

function lightbox(src) {
  const d = document.createElement('div');
  d.className = 'lightbox';
  d.innerHTML = `<img src="${esc(src)}" alt="" />`;
  d.onclick = () => d.remove();
  document.body.append(d);
}

function csv(name, rows) {
  const body = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

/* ================= Login ================= */
function renderLogin() {
  $app.innerHTML = `<div class="login"><form class="login-card" id="lf">
    <img src="/img/brand/logo_512.png" alt="CLIMBER" />
    <h1>Admin panel</h1><p>CLIMBER do'konini boshqarish</p>
    <input class="input" type="password" name="password" placeholder="Parol" autocomplete="current-password" autofocus style="height:50px;text-align:center" />
    <button class="btn btn-gold btn-block" style="height:50px;margin-top:12px">Kirish</button>
  </form></div>`;
  const f = document.getElementById('lf');
  f.onsubmit = (e) => {
    e.preventDefault();
    withBtn(f.querySelector('button'), async () => {
      const r = await api('admin/login', { method: 'POST', body: { password: f.password.value } });
      token = r.token;
      localStorage.setItem('cl_admin', token);
      start();
    });
  };
}

/* ================= Shell ================= */
const PAGES = [
  ['dashboard', 'Bosh panel', 'chart'],
  ['orders', 'Buyurtmalar', 'receipt'],
  ['products', 'Mahsulotlar', 'shirt'],
  ['stock', 'Ombor', 'box'],
  ['categories', 'Kategoriyalar', 'grid'],
  ['banners', 'Bannerlar', 'image'],
  ['customers', 'Mijozlar', 'users'],
  ['settings', 'Sozlamalar', 'settings'],
];

function shell() {
  $app.innerHTML = `<div class="mobile-bar"><button class="btn btn-dark btn-icon" id="burger">${icon('menu', 'sm')}</button>
      <img src="/img/brand/logo_512.png" alt="" /><b>CLIMBER</b></div>
    <div class="shell">
      <aside class="side" id="side">
        <div class="side-brand"><img src="/img/brand/logo_512.png" alt="" /><div><b>CLIMBER</b><small>Admin · Since 2009</small></div></div>
        <nav class="nav" id="nav"></nav>
        <div class="side-foot nav">
          <a href="/" target="_blank">${icon('eye', 'sm')} Do'konni ko'rish</a>
          <a href="#" id="logout">${icon('logout', 'sm')} Chiqish</a>
        </div>
      </aside>
      <main class="main" id="main"></main>
    </div>`;
  const side = document.getElementById('side');
  document.getElementById('burger').onclick = () => {
    side.classList.add('open');
    const s = document.createElement('div');
    s.className = 'scrim';
    s.onclick = () => { side.classList.remove('open'); s.remove(); };
    document.body.append(s);
  };
  document.getElementById('logout').onclick = (e) => { e.preventDefault(); logout(); };
}

function renderNav() {
  const cur = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
  document.getElementById('nav').innerHTML = PAGES.map(([k, t, ic]) =>
    `<a href="#/${k}" class="${cur === k ? 'on' : ''}">${icon(ic, 'sm')} ${t}${k === 'orders' && counters.to_review ? `<span class="cnt">${counters.to_review}</span>` : ''}</a>`).join('');
}

function route() {
  document.getElementById('side')?.classList.remove('open');
  document.querySelector('.scrim')?.remove();
  $modal.innerHTML = '';
  const [name, qs] = (location.hash.replace('#/', '') || 'dashboard').split('?');
  renderNav();
  const pages = { dashboard: pDashboard, orders: pOrders, products: pProducts, stock: pStock, categories: pCategories, banners: pBanners, customers: pCustomers, settings: pSettings };
  const main = document.getElementById('main');
  main.innerHTML = `<div class="skel"></div><div class="skel" style="margin-top:14px;height:300px"></div>`;
  (pages[name] || pDashboard)(main, new URLSearchParams(qs || '')).catch((e) => {
    main.innerHTML = `<div class="alert red">${icon('alert', 'sm')} ${esc(e.message)}</div>`;
  });
}

async function start() {
  try {
    const s = await api('admin/settings');
    Object.assign(META, { statuses: s.statuses, payment_statuses: s.payment_statuses, regions: s.regions, env: s.env });
  } catch (e) {
    if (token) $app.innerHTML = `<div class="login"><div class="login-card"><h1>Ulanib bo'lmadi</h1><p>${esc(e.message)}</p><button class="btn btn-gold btn-block" onclick="location.reload()">Qayta urinish</button></div></div>`;
    return;
  }
  shell();
  window.onhashchange = route;
  route();
}

/* ================= Bosh panel ================= */
function barChart(daily) {
  const W = 700, H = 220, pad = 28, max = Math.max(1, ...daily.map((d) => Number(d.revenue)));
  const bw = (W - pad) / daily.length;
  const bars = daily.map((d, i) => {
    const h = (Number(d.revenue) / max) * (H - 50);
    const x = pad + i * bw + bw * 0.18;
    const day = d.day.slice(8, 10) + '.' + d.day.slice(5, 7);
    return `<g><title>${day}: ${money(d.revenue)} · ${d.orders} ta buyurtma</title>
      <rect class="bar" x="${x}" y="${H - 24 - h}" width="${bw * 0.64}" height="${Math.max(h, 2)}" rx="5"/>
      <text x="${x + bw * 0.32}" y="${H - 8}" text-anchor="middle">${day}</text></g>`;
  }).join('');
  const grid = [0.25, 0.5, 0.75, 1].map((k) => {
    const y = H - 24 - k * (H - 50);
    return `<line class="gl" x1="${pad}" x2="${W}" y1="${y}" y2="${y}"/><text x="0" y="${y + 4}">${fmt(Math.round((max * k) / 1000))}k</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7e6ad"/><stop offset="1" stop-color="#b58a2f"/></linearGradient></defs>${grid}${bars}</svg>`;
}

async function pDashboard(main) {
  const d = await api('admin/dashboard');
  counters.to_review = d.totals.to_review;
  renderNav();
  const t = d.totals;
  const kpi = (ic, label, val, sub = '', cls = '') => `<div class="kpi ${cls}"><div class="k-ic">${icon(ic, 'sm')}</div><small>${label}</small><b class="num">${val}</b>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  main.innerHTML = `
    <div class="topline"><h1>Bosh panel<small>${fmtDate(new Date(), false)} · CLIMBER</small></h1>
      <a class="btn btn-dark" href="#/orders?pay=review">${icon('receipt', 'sm')} Cheklar (${t.to_review})</a>
      <a class="btn btn-gold" href="#/stock?doc=in">${icon('in', 'sm')} Kirim qilish</a></div>
    ${t.to_review ? `<div class="alert gold" style="margin-bottom:16px">${icon('info', 'sm')} <span><b>${t.to_review} ta</b> buyurtmada to'lov cheki tekshirilishini kutmoqda. <a href="#/orders?pay=review" style="text-decoration:underline">Ko'rish</a></span></div>` : ''}
    <div class="kpis">
      ${kpi('card', 'Tushum (30 kun)', money(t.revenue_30), `Jami: ${money(t.revenue)}`, 'hl')}
      ${kpi('receipt', 'Bugungi buyurtmalar', t.today, `Jami faol: ${t.orders}`)}
      ${kpi('clock', 'Chek tekshiruvda', t.to_review, "To'lovni tasdiqlang", 'amber')}
      ${kpi('truck', "Jo'natish kerak", t.to_ship, "Tasdiqlangan va yig'ilayotgan", 'green')}
      ${kpi('box', 'Ombor qiymati (sotuv)', money(d.stock.retail_value), `${fmt(d.stock.units)} dona · tannarx ${money(d.stock.cost_value)}`)}
      ${kpi('users', 'Mijozlar', t.customers, `O'rtacha chek: ${money(t.avg_check)}`)}
    </div>
    <div class="grid-2">
      <div class="stack">
        <div class="panel"><div class="panel-h"><h3>${icon('chart', 'sm')} Tushum — oxirgi 14 kun</h3><span class="muted">faqat to'langan</span></div>
          <div class="panel-b">${barChart(d.daily)}</div></div>
        <div class="panel"><div class="panel-h"><h3>${icon('receipt', 'sm')} So'nggi buyurtmalar</h3><a class="btn btn-ghost btn-sm" href="#/orders">Hammasi ${icon('arrow', 'xs')}</a></div>
          <div class="table-wrap"><table class="t"><tbody>
          ${d.recent.length ? d.recent.map((o) => `<tr class="click" data-order="${o.id}"><td><b>${esc(o.code)}</b><div class="muted" style="font-size:12px">${fmtDate(o.created_at)}</div></td>
            <td>${esc(o.customer_name)}</td><td>${pPill(o.payment_status)}</td><td>${sPill(o.status)}</td><td class="r nowrap"><b>${money(o.total)}</b></td></tr>`).join('')
            : `<tr><td class="empty-row">Hali buyurtmalar yo'q</td></tr>`}
          </tbody></table></div></div>
      </div>
      <div class="stack">
        <div class="panel"><div class="panel-h"><h3>${icon('alert', 'sm')} Kam qolgan mahsulotlar</h3><a class="btn btn-ghost btn-sm" href="#/stock?f=low">Ombor ${icon('arrow', 'xs')}</a></div>
          <div class="panel-b" style="padding-top:6px;padding-bottom:6px">${d.low.length ? d.low.map((v) => `<div class="list-item"><img src="${esc(v.image || '/img/brand/logo_512.png')}" alt="" />
            <div class="li-t"><b>${esc(v.name)}</b><small>O'lcham: ${esc(v.size)}</small></div>${stockBadge(v)}</div>`).join('') : `<p class="muted">Hammasi yetarli 👌</p>`}</div></div>
        <div class="panel"><div class="panel-h"><h3>${icon('award', 'sm')} Top mahsulotlar</h3></div>
          <div class="panel-b" style="padding-top:6px;padding-bottom:6px">${d.top.length ? d.top.map((p, i) => `<div class="list-item"><b class="gold" style="width:18px">${i + 1}</b><img src="${esc(p.image || '/img/brand/logo_512.png')}" alt="" />
            <div class="li-t"><b>${esc(p.name)}</b><small>${p.qty} dona · ${money(p.sum)}</small></div></div>`).join('') : `<p class="muted">Sotuvlar hali yo'q</p>`}</div></div>
      </div>
    </div>`;
  main.querySelectorAll('[data-order]').forEach((r) => (r.onclick = () => orderDrawer(r.dataset.order, () => pDashboard(main))));
}

/* ================= Buyurtmalar ================= */
async function pOrders(main, qs) {
  const st = { status: qs.get('status') || '', pay: qs.get('pay') || '', q: '' };
  main.innerHTML = `<div class="topline"><h1>Buyurtmalar<small>To'lovni tasdiqlash, holatni boshqarish</small></h1>
      <button class="btn btn-dark" id="exp">${icon('download', 'sm')} CSV</button></div>
    <div class="tabs" id="otabs"></div>
    <div class="toolbar"><div class="search">${icon('search', 'sm')}<input class="input" id="oq" placeholder="Kod, ism yoki telefon" /></div></div>
    <div class="panel"><div class="table-wrap" id="otable"><div class="skel"></div></div></div>`;
  let rows = [];
  const TABS = [
    ['', '', 'Hammasi'], ['', 'review', 'Chek tekshiruvda'], ['', 'awaiting', "To'lov kutilmoqda"],
    ['confirmed', '', 'Tasdiqlangan'], ['packing', '', "Yig'ilmoqda"], ['shipped', '', "Yo'lda"], ['delivered', '', 'Yetkazildi'], ['cancelled', '', 'Bekor'],
  ];
  const tabsEl = main.querySelector('#otabs');
  const renderTabs = () => {
    tabsEl.innerHTML = TABS.map(([s, p, t], i) => `<button data-i="${i}" class="${st.status === s && st.pay === p ? 'on' : ''}">${t}${p === 'review' && counters.to_review ? `<span class="c">${counters.to_review}</span>` : ''}</button>`).join('');
  };
  tabsEl.onclick = (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    [st.status, st.pay] = TABS[b.dataset.i];
    load();
  };
  async function load() {
    renderTabs();
    rows = await api(`admin/orders?status=${st.status}&payment=${st.pay}&q=${encodeURIComponent(st.q)}`);
    if (!st.status && !st.pay && !st.q) counters.to_review = rows.filter((o) => o.payment_status === 'review' && o.status !== 'cancelled').length;
    renderNav();
    renderTabs();
    main.querySelector('#otable').innerHTML = `<table class="t"><thead><tr><th>Buyurtma</th><th>Mijoz</th><th>Yetkazish</th><th>To'lov</th><th>Holat</th><th class="r">Summa</th></tr></thead><tbody>
      ${rows.length ? rows.map((o) => `<tr class="click" data-id="${o.id}">
        <td><b>${esc(o.code)}</b><div class="muted" style="font-size:12px">${fmtDate(o.created_at)} · ${o.items_count} poz.</div></td>
        <td><b style="font-weight:600">${esc(o.customer_name)}</b><div class="muted" style="font-size:12px">${esc(o.phone)}${o.tg_username ? ' · @' + esc(o.tg_username) : ''}</div></td>
        <td>${o.delivery_method === 'pickup' ? '<span class="pill">Olib ketish</span>' : esc(o.region)}</td>
        <td>${pPill(o.payment_status)}</td><td>${sPill(o.status)}</td><td class="r nowrap"><b>${money(o.total)}</b></td></tr>`).join('')
        : `<tr><td colspan="6" class="empty-row">Buyurtmalar topilmadi</td></tr>`}</tbody></table>`;
    main.querySelectorAll('[data-id]').forEach((r) => (r.onclick = () => orderDrawer(r.dataset.id, load)));
  }
  let t;
  main.querySelector('#oq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); load(); }, 350); };
  main.querySelector('#exp').onclick = () => csv('buyurtmalar', [
    ['Kod', 'Sana', 'Mijoz', 'Telefon', 'Viloyat', 'Manzil', 'Mahsulotlar', 'Yetkazish', 'Jami', "To'lov", 'Holat'],
    ...rows.map((o) => [o.code, fmtDate(o.created_at), o.customer_name, o.phone, o.region, [o.district, o.address].filter(Boolean).join(', '), o.subtotal, o.delivery_price, o.total, META.payment_statuses[o.payment_status], META.statuses[o.status]]),
  ]);
  await load();
}

async function orderDrawer(id, onChange) {
  const o = await api('admin/orders/' + id);
  const { box, close } = modal(`${mHead(`Buyurtma ${esc(o.code)}`)}<div class="modal-b" id="ob"></div>`, { drawer: true });
  const body = box.querySelector('#ob');
  const cancelled = o.status === 'cancelled';
  const paid = o.payment_status === 'paid';
  const NEXT = ['new', 'confirmed', 'packing', 'shipped', 'delivered'];

  body.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">${pPill(o.payment_status)} ${sPill(o.status)}
      <span class="pill">${o.payment_method === 'telegram' ? 'Click/Payme (Telegram)' : "Kartaga o'tkazma"}</span></div>

    ${!cancelled && !paid ? `<div class="sec-t">To'lov</div>
      ${o.receipt_image_id ? `<div class="receipt" id="rc"><img src="/api/admin/receipt/${o.id}?t=${encodeURIComponent(token)}" alt="Chek" id="rcimg" /></div>`
        : `<div class="alert">${icon('clock', 'sm')} Mijoz hali chek yuklamagan. Summa: <b>&nbsp;${money(o.total)}</b></div>`}
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-green" id="approve">${icon('check', 'sm')} To'lovni tasdiqlash</button>
        ${o.receipt_image_id ? `<button class="btn btn-red" id="reject">${icon('x', 'sm')} Chekni rad etish</button>` : ''}
      </div>` : ''}
    ${paid ? `<div class="alert green">${icon('check', 'sm')} To'langan${o.paid_at ? ' · ' + fmtDate(o.paid_at) : ''} — ${money(o.total)}</div>
      ${o.receipt_image_id ? `<button class="btn btn-ghost btn-sm" id="showRc" style="margin-top:8px;padding:0">${icon('eye', 'xs')} Chekni ko'rish</button>` : ''}` : ''}

    <div class="sec-t">Mahsulotlar</div>
    ${o.items.map((it) => `<div class="list-item"><img src="${esc(it.image || '/img/brand/logo_512.png')}" alt="" />
      <div class="li-t"><b>${esc(it.name)}</b><small>O'lcham: ${esc(it.size)}${it.sku ? ' · ' + esc(it.sku) : ''} · ${it.qty} × ${money(it.price)}</small></div><b class="nowrap">${money(it.price * it.qty)}</b></div>`).join('')}
    <div class="kv" style="margin-top:10px;padding-top:12px;border-top:1px solid var(--line)">
      <span>Mahsulotlar</span><b>${money(o.subtotal)}</b><span>Yetkazish</span><b>${money(o.delivery_price)}</b><span>Jami</span><b class="gold">${money(o.total)}</b></div>

    <div class="sec-t">Mijoz va yetkazish</div>
    <div class="kv">
      <span>Ism</span><b>${esc(o.customer_name)}</b>
      <span>Telefon</span><a href="tel:${esc(o.phone)}" class="gold">${esc(o.phone)}</a>
      ${o.tg_username ? `<span>Telegram</span><a href="https://t.me/${esc(o.tg_username)}" target="_blank" class="gold">@${esc(o.tg_username)}</a>` : ''}
      <span>Usul</span><b>${o.delivery_method === 'pickup' ? "Do'kondan olib ketish" : 'Yetkazib berish'}</b>
      ${o.delivery_method !== 'pickup' ? `<span>Manzil</span><b>${esc([o.region, o.district, o.address].filter(Boolean).join(', '))}</b>` : ''}
      ${o.comment ? `<span>Izoh</span><b>${esc(o.comment)}</b>` : ''}
      <span>Yaratilgan</span><b>${fmtDate(o.created_at)}</b>
    </div>

    ${!cancelled ? `<div class="sec-t">Holatni boshqarish</div>
      <div class="fgrid">
        <label class="field"><span>Holat</span><select class="input" id="ost">${NEXT.map((s) => `<option value="${s}" ${o.status === s ? 'selected' : ''} ${!paid && ['packing', 'shipped', 'delivered'].includes(s) ? 'disabled' : ''}>${esc(META.statuses[s])}</option>`).join('')}</select></label>
        <label class="field"><span>Trek raqam (pochta)</span><input class="input" id="otr" value="${esc(o.tracking || '')}" placeholder="BTS / UzPost raqami" /></label>
      </div>
      <label class="field" style="margin-top:14px"><span>Admin izohi (mijozga ko'rinmaydi)</span><textarea class="input" id="ont">${esc(o.admin_note || '')}</textarea></label>
      ${!paid ? `<p class="muted" style="font-size:12.5px">"Yig'ilmoqda" va keyingi holatlar to'lov tasdiqlangandan keyin ochiladi.</p>` : ''}` : `<div class="sec-t">Izoh</div><p>${esc(o.admin_note || '—')}</p>`}
  `;
  if (!cancelled) {
    box.insertAdjacentHTML('beforeend', `<div class="modal-f" style="position:sticky;bottom:0;background:var(--panel)">
      <button class="btn btn-red" id="ocancel">${icon('x', 'sm')} Bekor qilish</button><span style="flex:1"></span>
      <button class="btn btn-gold" id="osave">Saqlash</button></div>`);
  }
  const done = (msg) => { toast(msg); close(); onChange?.(); };
  const patch = (body) => api('admin/orders/' + o.id, { method: 'PATCH', body });

  body.querySelector('#rcimg')?.addEventListener('click', (e) => lightbox(e.target.src));
  body.querySelector('#showRc')?.addEventListener('click', () => lightbox(`/api/admin/receipt/${o.id}?t=${encodeURIComponent(token)}`));
  body.querySelector('#approve')?.addEventListener('click', (e) => {
    if (!confirm(`${money(o.total)} kelib tushganini tasdiqlaysizmi?`)) return;
    withBtn(e.currentTarget, async () => { await patch({ action: 'approve_payment' }); done("To'lov tasdiqlandi"); });
  });
  body.querySelector('#reject')?.addEventListener('click', (e) => {
    const reason = prompt('Rad etish sababi (mijozga yuboriladi):', "Summa to'g'ri kelmadi");
    if (reason === null) return;
    withBtn(e.currentTarget, async () => { await patch({ action: 'reject_payment', reason }); done('Chek rad etildi'); });
  });
  box.querySelector('#ocancel')?.addEventListener('click', (e) => {
    const reason = prompt("Bekor qilish sababi (mahsulotlar omborga qaytariladi):", '');
    if (reason === null) return;
    withBtn(e.currentTarget, async () => { await patch({ action: 'cancel', reason }); done('Buyurtma bekor qilindi, mahsulotlar omborga qaytdi'); });
  });
  box.querySelector('#osave')?.addEventListener('click', (e) => withBtn(e.currentTarget, async () => {
    await patch({ status: body.querySelector('#ost').value, tracking: body.querySelector('#otr').value, admin_note: body.querySelector('#ont').value });
    done('Saqlandi');
  }));
}

/* ================= Mahsulotlar ================= */
let catsCache = null;
const loadCats = async () => (catsCache = await api('admin/categories'));

async function pProducts(main) {
  const [list, cats] = await Promise.all([api('admin/products'), loadCats()]);
  const st = { q: '', cat: '', flag: '' };
  main.innerHTML = `<div class="topline"><h1>Mahsulotlar<small>${list.length} ta mahsulot</small></h1>
      <button class="btn btn-gold" id="newP">${icon('plus', 'sm')} Yangi mahsulot</button></div>
    <div class="toolbar">
      <div class="search">${icon('search', 'sm')}<input class="input" id="pq" placeholder="Nomi yoki brend" /></div>
      <select class="input" id="pc" style="width:auto"><option value="">Barcha kategoriyalar</option>${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <span class="muted" style="font-size:12.5px">Tartib: kichik raqam — ilovada birinchi</span>
      <select class="input" id="pf" style="width:auto"><option value="">Barcha holatlar</option><option value="active">Sotuvda</option><option value="hidden">Yashirin</option><option value="noprice">Narxsiz</option><option value="out">Tugagan</option></select>
    </div>
    <div class="panel"><div class="table-wrap" id="ptable"></div></div>`;
  const render = () => {
    const q = st.q.toLowerCase();
    const rows = list.filter((p) => {
      const stock = p.variants.reduce((s, v) => s + v.stock, 0);
      return (!q || `${p.name} ${p.brand || ''}`.toLowerCase().includes(q)) && (!st.cat || p.category_id === Number(st.cat)) &&
        (!st.flag || (st.flag === 'active' && p.is_active) || (st.flag === 'hidden' && !p.is_active) || (st.flag === 'noprice' && !p.price) || (st.flag === 'out' && stock <= 0));
    });
    main.querySelector('#ptable').innerHTML = `<table class="t"><thead><tr><th title="Kichik raqam — ilovada yuqorida">Tartib</th><th>Mahsulot</th><th>Kategoriya</th><th class="r">Narx</th><th>O'lchamlar va qoldiq</th><th class="r">Jami</th><th>Holat</th></tr></thead><tbody>
      ${rows.length ? rows.map((p) => {
        const stock = p.variants.reduce((s, v) => s + v.stock, 0);
        return `<tr class="click" data-id="${p.id}">
          <td><input class="input num sortin" type="number" min="0" step="1" value="${p.sort}" data-sort="${p.id}" title="Enter yoki boshqa joyni bosing — saqlanadi" /></td>
          <td><div class="pname"><img class="thumb" src="${esc(p.images[0] || '/img/brand/logo_512.png')}" alt="" loading="lazy" /><div><b>${esc(p.name)}</b><small>#${p.id}${p.brand ? ' · ' + esc(p.brand) : ''}</small></div></div></td>
          <td>${esc(p.category_name || '—')}</td>
          <td class="r nowrap">${p.price ? `<b>${money(p.price)}</b>${p.old_price ? `<div class="muted" style="text-decoration:line-through;font-size:12px">${money(p.old_price)}</div>` : ''}` : '<span class="pill amber">Narxsiz</span>'}</td>
          <td><div style="display:flex;gap:4px;flex-wrap:wrap">${p.variants.map((v) => `<span class="pill ${v.stock <= 0 ? 'red' : v.stock <= v.low_stock ? 'amber' : ''}" title="${esc(v.sku || '')}">${esc(v.size)}: ${v.stock}</span>`).join('')}</div></td>
          <td class="r"><span class="stockbadge ${stock <= 0 ? 'out' : ''}">${stock}</span></td>
          <td><div style="display:flex;gap:4px;flex-wrap:wrap">${p.is_active ? '<span class="pill green">Sotuvda</span>' : '<span class="pill">Yashirin</span>'}${p.is_featured ? '<span class="pill gold">Top</span>' : ''}${p.is_new ? '<span class="pill blue">Yangi</span>' : ''}</div></td></tr>`;
      }).join('') : `<tr><td colspan="7" class="empty-row">Mahsulot topilmadi</td></tr>`}</tbody></table>`;
    main.querySelectorAll('[data-id]').forEach((r) => (r.onclick = (e) => {
      if (e.target.closest('.sortin')) return;
      productModal(list.find((p) => p.id === Number(r.dataset.id)), () => pProducts(main));
    }));
    main.querySelectorAll('.sortin').forEach((inp) => {
      inp.onkeydown = (e) => e.key === 'Enter' && inp.blur();
      inp.onchange = async () => {
        const p = list.find((x) => x.id === Number(inp.dataset.sort));
        try {
          const r = await api(`admin/products/${p.id}/sort`, { method: 'PATCH', body: { sort: inp.value } });
          p.sort = r.sort;
          list.sort((a, b) => a.sort - b.sort || a.id - b.id);
          toast(`Tartib saqlandi: ${r.sort}`);
          render();
        } catch (err) {
          toast(err.message, true);
          inp.value = p.sort;
        }
      };
    });
  };
  main.querySelector('#pq').oninput = (e) => { st.q = e.target.value; render(); };
  main.querySelector('#pc').onchange = (e) => { st.cat = e.target.value; render(); };
  main.querySelector('#pf').onchange = (e) => { st.flag = e.target.value; render(); };
  main.querySelector('#newP').onclick = () => productModal(null, () => pProducts(main));
  render();
}

const PRESETS = [['S – XXL', ['S', 'M', 'L', 'XL', 'XXL']], ['M – XXL', ['M', 'L', 'XL', 'XXL']], ['39 – 45', ['39', '40', '41', '42', '43', '44', '45']], ['30 – 36', ['30', '31', '32', '33', '34', '36']], ['Standart', ['Standart']]];

function productModal(p, onSaved) {
  const cats = catsCache || [];
  const st = {
    images: [...(p?.images || [])],
    variants: (p?.variants || [{ size: 'Standart', stock: 0, low_stock: 2 }]).map((v) => ({ ...v })),
  };
  const { box, close } = modal(`${mHead(p ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot')}
    <form class="modal-b" id="pfm">
      <div class="fgrid">
        <label class="field" style="grid-column:1/-1"><span>Nomi *</span><input class="input" name="name" value="${esc(p?.name || '')}" required /></label>
        <label class="field"><span>Kategoriya</span><select class="input" name="category_id"><option value="">—</option>${cats.map((c) => `<option value="${c.id}" ${p?.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Brend</span><input class="input" name="brand" value="${esc(p?.brand || '')}" placeholder="Masalan: Gratude" /></label>
        <label class="field"><span>Narx (so'm)</span><input class="input" name="price" type="number" min="0" step="1000" value="${p?.price ?? ''}" placeholder="Bo'sh = narxi so'rov bo'yicha" /></label>
        <label class="field"><span>Eski narx (chegirma uchun)</span><input class="input" name="old_price" type="number" min="0" step="1000" value="${p?.old_price ?? ''}" placeholder="Ixtiyoriy" /></label>
        <label class="field"><span>Tartib raqami (kichigi — yuqorida)</span><input class="input" name="sort" type="number" min="0" value="${p?.sort ?? ''}" placeholder="Bo'sh = ro'yxat oxiriga" /></label>
      </div>
      <label class="field" style="margin-top:14px"><span>Tavsif</span><textarea class="input" name="description" placeholder="Mato, rang, o'lcham bo'yicha maslahat...">${esc(p?.description || '')}</textarea></label>

      <div class="sec-t">Rasmlar <small class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">— birinchisi asosiy</small></div>
      <div class="imgs" id="imgs"></div>

      <div class="sec-t">O'lchamlar va ombor</div>
      <div class="table-wrap"><table class="vtable"><thead><tr><th>O'lcham</th><th>SKU</th><th>Tannarx</th><th>Min. qoldiq</th><th>Qoldiq</th><th></th></tr></thead><tbody id="vrows"></tbody></table></div>
      <div class="presets"><button type="button" class="btn btn-dark btn-sm" id="addV">${icon('plus', 'xs')} O'lcham</button>
        ${PRESETS.map(([t], i) => `<button type="button" class="btn btn-dark btn-sm" data-preset="${i}">${t}</button>`).join('')}</div>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">Mavjud o'lchamlar qoldig'i faqat <b>Ombor</b> bo'limida (kirim / chiqim / inventarizatsiya) o'zgaradi — har bir harakat tarixda saqlanadi.</p>

      <div class="sec-t">Ko'rinish</div>
      <div style="display:flex;gap:22px;flex-wrap:wrap">
        <label class="toggle"><input type="checkbox" name="is_active" ${p?.is_active !== false ? 'checked' : ''} /><span class="sw"></span>Sotuvda</label>
        <label class="toggle"><input type="checkbox" name="is_featured" ${p?.is_featured ? 'checked' : ''} /><span class="sw"></span>Top (bosh sahifa)</label>
        <label class="toggle"><input type="checkbox" name="is_new" ${p?.is_new ? 'checked' : ''} /><span class="sw"></span>Yangi kolleksiya</label>
      </div>
    </form>
    <div class="modal-f">${p ? `<button class="btn btn-red" id="pdel">${icon('trash', 'sm')} O'chirish</button><span style="flex:1"></span>` : ''}
      <button class="btn btn-dark" data-close>Bekor</button><button class="btn btn-gold" id="psave">Saqlash</button></div>`);

  const f = box.querySelector('#pfm');
  const imgsEl = box.querySelector('#imgs');
  const renderImgs = () => {
    imgsEl.innerHTML = st.images.map((src, i) => `<div class="im"><img src="${esc(src)}" alt="" />${i === 0 ? '<span class="main-tag">Asosiy</span>' : ''}
      <div class="im-a">${i ? `<button type="button" data-main="${i}" title="Asosiy qilish">${icon('award', 'xs')}</button>` : '<span></span>'}<button type="button" data-rmimg="${i}" title="O'chirish">${icon('trash', 'xs')}</button></div></div>`).join('') +
      `<label class="add">${icon('camera')}Rasm qo'shish<input type="file" accept="image/*" multiple hidden id="imgIn" /></label>`;
    imgsEl.querySelector('#imgIn').onchange = async (e) => {
      const files = [...e.target.files].slice(0, 10 - st.images.length);
      for (const file of files) {
        try {
          const image = await compressImage(file, 1200, 0.82);
          const r = await api('admin/upload', { method: 'POST', body: { image } });
          st.images.push(r.url);
          renderImgs();
        } catch (err) {
          toast(err.message, true);
        }
      }
    };
  };
  imgsEl.onclick = (e) => {
    const m = e.target.closest('[data-main]');
    const r = e.target.closest('[data-rmimg]');
    if (m) { const [x] = st.images.splice(Number(m.dataset.main), 1); st.images.unshift(x); renderImgs(); }
    if (r) { st.images.splice(Number(r.dataset.rmimg), 1); renderImgs(); }
  };

  const vrows = box.querySelector('#vrows');
  const readV = () => {
    vrows.querySelectorAll('tr').forEach((tr, i) => {
      const v = st.variants[i];
      tr.querySelectorAll('[data-k]').forEach((inp) => (v[inp.dataset.k] = inp.value));
    });
  };
  const renderV = () => {
    vrows.innerHTML = st.variants.map((v, i) => `<tr>
      <td><input class="input" data-k="size" value="${esc(v.size)}" style="width:90px" /></td>
      <td><input class="input" data-k="sku" value="${esc(v.sku || '')}" placeholder="CL-..." style="min-width:110px" /></td>
      <td><input class="input" data-k="cost_price" type="number" min="0" value="${v.cost_price ?? ''}" placeholder="so'm" style="width:110px" /></td>
      <td><input class="input" data-k="low_stock" type="number" min="0" value="${v.low_stock ?? 2}" style="width:80px" /></td>
      <td>${v.id ? stockBadge({ stock: v.stock, low_stock: v.low_stock }) : `<input class="input" data-k="stock" type="number" min="0" value="${v.stock || 0}" style="width:80px" title="Boshlang'ich qoldiq" />`}</td>
      <td><button type="button" class="btn btn-dark btn-icon" data-rmv="${i}" aria-label="O'chirish">${icon('x', 'xs')}</button></td></tr>`).join('');
  };
  vrows.onclick = (e) => {
    const b = e.target.closest('[data-rmv]');
    if (!b) return;
    readV();
    const v = st.variants[Number(b.dataset.rmv)];
    if (v.id && v.stock > 0 && !confirm(`"${v.size}" o'lchamida ${v.stock} dona qoldiq bor. Baribir o'chirasizmi?`)) return;
    st.variants.splice(Number(b.dataset.rmv), 1);
    renderV();
  };
  box.querySelector('#addV').onclick = () => { readV(); st.variants.push({ size: '', stock: 0, low_stock: 2 }); renderV(); };
  box.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => {
    readV();
    const sizes = PRESETS[b.dataset.preset][1];
    const have = new Set(st.variants.map((v) => v.size));
    st.variants = st.variants.filter((v) => v.id || v.size);
    if (st.variants.length === 1 && !st.variants[0].id && st.variants[0].size === 'Standart') st.variants = [];
    for (const s of sizes) if (!have.has(s) || !st.variants.find((v) => v.size === s)) st.variants.push({ size: s, stock: 0, low_stock: 2 });
    renderV();
  }));
  renderImgs();
  renderV();

  box.querySelector('#psave').onclick = (e) => withBtn(e.currentTarget, async () => {
    readV();
    const fd = new FormData(f);
    const body = {
      name: fd.get('name'), category_id: fd.get('category_id'), brand: fd.get('brand'),
      price: fd.get('price'), old_price: fd.get('old_price'), description: fd.get('description'),
      sort: fd.get('sort'), images: st.images, variants: st.variants,
      is_active: f.is_active.checked, is_featured: f.is_featured.checked, is_new: f.is_new.checked,
    };
    await api(p ? 'admin/products/' + p.id : 'admin/products', { method: p ? 'PUT' : 'POST', body });
    toast(p ? 'Mahsulot yangilandi' : "Mahsulot qo'shildi");
    close();
    onSaved();
  });
  box.querySelector('#pdel')?.addEventListener('click', (e) => {
    if (!confirm("Mahsulotni o'chirasizmi? Buyurtmalarda bo'lsa — faqat yashiriladi.")) return;
    withBtn(e.currentTarget, async () => {
      const r = await api('admin/products/' + p.id, { method: 'DELETE' });
      toast(r.archived ? 'Mahsulot yashirildi (buyurtmalarda bor)' : "Mahsulot o'chirildi");
      close();
      onSaved();
    });
  });
}

/* ================= Ombor ================= */
async function pStock(main, qs) {
  const st = { tab: 'stock', f: qs.get('f') || '', q: '', mtype: '' };
  let rows = await api('admin/stock');

  const render = async () => {
    const units = rows.reduce((s, v) => s + v.stock, 0);
    const retail = rows.reduce((s, v) => s + v.stock * (v.price || 0), 0);
    const cost = rows.reduce((s, v) => s + v.stock * (v.cost_price || 0), 0);
    const low = rows.filter((v) => v.stock > 0 && v.stock <= v.low_stock).length;
    const out = rows.filter((v) => v.stock <= 0).length;
    const noCost = rows.filter((v) => v.stock > 0 && !v.cost_price).length;
    const withCost = rows.filter((v) => v.stock > 0 && v.cost_price && v.price);
    const markup = withCost.length ? Math.round((withCost.reduce((s, v) => s + v.stock * v.price, 0) / withCost.reduce((s, v) => s + v.stock * v.cost_price, 0) - 1) * 100) : null;
    main.innerHTML = `<div class="topline"><h1>Ombor<small>Qoldiqlar, kirim-chiqim va harakatlar tarixi</small></h1>
        <button class="btn btn-dark" id="sexp">${icon('download', 'sm')} CSV</button>
        <button class="btn btn-dark" data-doc="out">${icon('out', 'sm')} Chiqim</button>
        <button class="btn btn-dark" data-doc="adjust">${icon('scale', 'sm')} Inventarizatsiya</button>
        <button class="btn btn-gold" data-doc="in">${icon('in', 'sm')} Kirim</button></div>
      <div class="kpis">
        <div class="kpi hl"><div class="k-ic">${icon('box', 'sm')}</div><small>Jami qoldiq</small><b class="num">${fmt(units)} dona</b><div class="sub">${rows.length} ta pozitsiya (o'lcham)</div></div>
        <div class="kpi"><div class="k-ic">${icon('card', 'sm')}</div><small>Sotuv qiymati</small><b class="num">${money(retail)}</b><div class="sub">Joriy narxlarda</div></div>
        <div class="kpi green"><div class="k-ic">${icon('receipt', 'sm')}</div><small>Tannarx qiymati</small><b class="num">${money(cost)}</b><div class="sub">${noCost ? `${noCost} pozitsiyada tannarx yo'q` : 'Hammasi kiritilgan'}${markup !== null ? ` · ustama ~${markup}%` : ''}</div></div>
        <div class="kpi amber"><div class="k-ic">${icon('alert', 'sm')}</div><small>Kam qolgan</small><b class="num">${low}</b><div class="sub">Min. qoldiqdan past</div></div>
        <div class="kpi red"><div class="k-ic">${icon('x', 'sm')}</div><small>Tugagan</small><b class="num">${out}</b><div class="sub">Sotuvda ko'rinmaydi</div></div>
      </div>
      <div class="tabs" id="stabs">
        <button data-tab="stock" class="${st.tab === 'stock' ? 'on' : ''}">${icon('box', 'xs')} Qoldiqlar</button>
        <button data-tab="moves" class="${st.tab === 'moves' ? 'on' : ''}">${icon('clock', 'xs')} Harakatlar tarixi</button>
      </div>
      <div id="sbody"></div>`;
    main.querySelector('#stabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { st.tab = b.dataset.tab; render(); } };
    main.querySelectorAll('[data-doc]').forEach((b) => (b.onclick = () => stockDoc(b.dataset.doc, rows, null, reload)));
    main.querySelector('#sexp').onclick = () => csv('ombor', [
      ['Mahsulot', "O'lcham", 'SKU', 'Kategoriya', 'Qoldiq', 'Min', 'Tannarx', 'Narx', 'Qiymat (sotuv)', 'Sotildi (30 kun)'],
      ...rows.map((v) => [v.name, v.size, v.sku, v.category_name, v.stock, v.low_stock, v.cost_price, v.price, v.stock * (v.price || 0), v.sold_30]),
    ]);
    if (st.tab === 'stock') renderStock();
    else await renderMoves();
  };

  const renderStock = () => {
    const body = main.querySelector('#sbody');
    body.innerHTML = `<div class="toolbar"><div class="search">${icon('search', 'sm')}<input class="input" id="sq" placeholder="Mahsulot, o'lcham yoki SKU" value="${esc(st.q)}" /></div>
      <div class="tabs" style="margin:0" id="sf">${[['', 'Hammasi'], ['low', 'Kam qolgan'], ['out', 'Tugagan'], ['nocost', "Tannarxsiz"]].map(([k, t]) => `<button data-f="${k}" class="${st.f === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <div class="panel"><div class="table-wrap" id="stbl"></div></div>`;
    const draw = () => {
      const q = st.q.toLowerCase();
      const list = rows.filter((v) => (!q || `${v.name} ${v.size} ${v.sku || ''}`.toLowerCase().includes(q)) &&
        (!st.f || (st.f === 'low' && v.stock > 0 && v.stock <= v.low_stock) || (st.f === 'out' && v.stock <= 0) || (st.f === 'nocost' && !v.cost_price)));
      body.querySelector('#stbl').innerHTML = `<table class="t"><thead><tr><th>Mahsulot</th><th>O'lcham</th><th>SKU</th><th class="r">Qoldiq</th><th class="r">Min</th><th class="r">Tannarx</th><th class="r">Qiymat</th><th class="r">30 kunda sotildi</th><th>Oxirgi harakat</th><th class="r">Amallar</th></tr></thead><tbody>
        ${list.length ? list.map((v) => `<tr>
          <td><div class="pname"><img class="thumb" src="${esc(v.image || '/img/brand/logo_512.png')}" alt="" loading="lazy" /><div><b>${esc(v.name)}</b><small>${esc(v.category_name || '')}${v.is_active ? '' : ' · yashirin'}</small></div></div></td>
          <td><b>${esc(v.size)}</b></td><td class="muted">${esc(v.sku || '—')}</td>
          <td class="r">${stockBadge(v)}</td><td class="r muted">${v.low_stock}</td>
          <td class="r nowrap">${v.cost_price ? money(v.cost_price) : '<span class="muted">—</span>'}</td>
          <td class="r nowrap">${money(v.stock * (v.price || 0))}</td>
          <td class="r">${v.sold_30 || '<span class="muted">0</span>'}</td>
          <td class="muted nowrap" style="font-size:12.5px">${v.last_move ? fmtDate(v.last_move) : '—'}</td>
          <td class="r nowrap"><button class="btn btn-green btn-icon" data-act="in" data-v="${v.id}" title="Kirim">${icon('plus', 'xs')}</button>
            <button class="btn btn-red btn-icon" data-act="out" data-v="${v.id}" title="Chiqim">${icon('minus', 'xs')}</button>
            <button class="btn btn-dark btn-icon" data-act="adjust" data-v="${v.id}" title="Inventarizatsiya">${icon('scale', 'xs')}</button>
            <button class="btn btn-dark btn-icon" data-hist="${v.id}" title="Tarix">${icon('clock', 'xs')}</button></td></tr>`).join('')
          : `<tr><td colspan="10" class="empty-row">Pozitsiya topilmadi</td></tr>`}</tbody></table>`;
    };
    body.querySelector('#sq').oninput = (e) => { st.q = e.target.value; draw(); };
    body.querySelector('#sf').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { st.f = b.dataset.f; renderStock(); } };
    body.querySelector('#stbl').onclick = (e) => {
      const a = e.target.closest('[data-act]');
      const h = e.target.closest('[data-hist]');
      if (a) stockDoc(a.dataset.act, rows, Number(a.dataset.v), reload);
      if (h) historyModal(rows.find((v) => v.id === Number(h.dataset.hist)));
    };
    draw();
  };

  const renderMoves = async () => {
    const body = main.querySelector('#sbody');
    body.innerHTML = `<div class="toolbar"><div class="tabs" style="margin:0" id="mt">${[['', 'Hammasi'], ['in', 'Kirim'], ['out', 'Chiqim'], ['sale', 'Sotuv'], ['return', 'Qaytarish'], ['adjust', 'Inventarizatsiya']].map(([k, t]) => `<button data-t="${k}" class="${st.mtype === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <div class="panel"><div class="table-wrap" id="mtbl"><div class="skel"></div></div></div>`;
    body.querySelector('#mt').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { st.mtype = b.dataset.t; renderMoves(); } };
    const moves = await api('admin/stock/movements?type=' + st.mtype);
    body.querySelector('#mtbl').innerHTML = movesTable(moves);
  };

  const reload = async () => { rows = await api('admin/stock'); render(); };
  await render();
  if (qs.get('doc')) stockDoc(qs.get('doc'), rows, null, reload);
}

function movesTable(moves, compact = false) {
  return `<table class="t"><thead><tr><th>Sana</th>${compact ? '' : '<th>Mahsulot</th>'}<th>Turi</th><th class="r">Miqdor</th><th class="r">Qoldiq</th><th class="r">Tannarx</th><th>Izoh</th></tr></thead><tbody>
    ${moves.length ? moves.map((m) => {
      const [t, c] = MOVE[m.type] || [m.type, ''];
      return `<tr><td class="nowrap muted" style="font-size:12.5px">${fmtDate(m.created_at)}</td>
        ${compact ? '' : `<td><b style="font-weight:600">${esc(m.name)}</b> <span class="muted">· ${esc(m.size)}</span></td>`}
        <td><span class="pill ${c}">${t}</span></td>
        <td class="r num ${m.qty > 0 ? 'mv-in' : m.qty < 0 ? 'mv-out' : ''}"><b>${m.qty > 0 ? '+' : ''}${m.qty}</b></td>
        <td class="r num">${m.balance ?? '—'}</td><td class="r nowrap">${m.cost_price ? money(m.cost_price) : '—'}</td>
        <td style="font-size:12.5px">${esc([m.supplier && 'Yetkazuvchi: ' + m.supplier, m.note].filter(Boolean).join(' · ') || '—')}</td></tr>`;
    }).join('') : `<tr><td colspan="7" class="empty-row">Harakatlar yo'q</td></tr>`}</tbody></table>`;
}

async function historyModal(v) {
  const { box } = modal(`${mHead(`${esc(v.name)} · ${esc(v.size)}`)}<div class="modal-b" style="padding:0"><div class="table-wrap" id="hb"><div class="skel" style="margin:20px"></div></div></div>`);
  const moves = await api('admin/stock/movements?variant_id=' + v.id);
  box.querySelector('#hb').innerHTML = movesTable(moves, true);
}

// Kirim / chiqim / inventarizatsiya hujjati (bir nechta qator)
function stockDoc(type, rows, variantId, onDone) {
  const T = {
    in: ['Kirim hujjati', 'Yangi tovar keldi — qoldiqqa qo\'shiladi', 'Miqdor'],
    out: ['Chiqim hujjati', 'Brak, yo\'qotish, qaytarish yoki do\'kondan sotuv', 'Miqdor'],
    adjust: ['Inventarizatsiya', 'Sanab chiqilgan haqiqiy qoldiqni kiriting', 'Haqiqiy qoldiq'],
  }[type];
  const lines = variantId ? [{ variant_id: variantId, qty: '', cost_price: rows.find((v) => v.id === variantId)?.cost_price || '' }] : [{ variant_id: '', qty: '', cost_price: '' }];
  const opts = rows.map((v) => `<option value="${v.id}">${esc(v.name)} — ${esc(v.size)} (qoldiq: ${v.stock})</option>`).join('');

  const { box, close } = modal(`${mHead(T[0])}<div class="modal-b">
      <p class="muted" style="margin:0 0 16px">${T[1]}</p>
      ${type === 'in' ? `<div class="fgrid" style="margin-bottom:16px"><label class="field"><span>Yetkazuvchi</span><input class="input" id="sup" placeholder="Masalan: Toshkent, Abu Saxiy" /></label>
        <label class="field"><span>Izoh</span><input class="input" id="dnote" placeholder="Hujjat raqami, sana..." /></label></div>`
        : `<label class="field" style="margin-bottom:16px"><span>Sabab / izoh</span><input class="input" id="dnote" placeholder="${type === 'out' ? "Masalan: brak, do'kondan naqd sotuv" : 'Masalan: oylik inventarizatsiya'}" /></label>`}
      <div class="table-wrap"><table class="vtable"><thead><tr><th>Mahsulot va o'lcham</th><th>${T[2]}</th>${type === 'in' ? '<th>Tannarx</th>' : ''}<th></th></tr></thead><tbody id="dl"></tbody></table></div>
      <button type="button" class="btn btn-dark btn-sm" id="addL" style="margin-top:10px">${icon('plus', 'xs')} Qator qo'shish</button>
    </div>
    <div class="modal-f"><button class="btn btn-dark" data-close>Bekor</button><button class="btn btn-gold" id="dsave">${icon('check', 'sm')} Hujjatni o'tkazish</button></div>`);

  const dl = box.querySelector('#dl');
  const read = () => dl.querySelectorAll('tr').forEach((tr, i) => tr.querySelectorAll('[data-k]').forEach((x) => (lines[i][x.dataset.k] = x.value)));
  const draw = () => {
    dl.innerHTML = lines.map((l, i) => `<tr>
      <td style="min-width:280px"><select class="input" data-k="variant_id"><option value="">Tanlang...</option>${opts}</select></td>
      <td><input class="input" type="number" min="0" data-k="qty" value="${esc(l.qty)}" style="width:110px" /></td>
      ${type === 'in' ? `<td><input class="input" type="number" min="0" data-k="cost_price" value="${esc(l.cost_price)}" placeholder="so'm" style="width:120px" /></td>` : ''}
      <td>${lines.length > 1 ? `<button type="button" class="btn btn-dark btn-icon" data-rm="${i}">${icon('x', 'xs')}</button>` : ''}</td></tr>`).join('');
    dl.querySelectorAll('select').forEach((s, i) => (s.value = lines[i].variant_id || ''));
  };
  dl.onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { read(); lines.splice(Number(b.dataset.rm), 1); draw(); } };
  dl.onchange = (e) => {
    if (e.target.dataset.k === 'variant_id' && type === 'in') {
      read();
      const tr = e.target.closest('tr');
      const i = [...dl.children].indexOf(tr);
      const v = rows.find((x) => x.id === Number(e.target.value));
      if (v?.cost_price && !lines[i].cost_price) { lines[i].cost_price = v.cost_price; draw(); }
    }
  };
  box.querySelector('#addL').onclick = () => { read(); lines.push({ variant_id: '', qty: '', cost_price: '' }); draw(); };
  draw();

  box.querySelector('#dsave').onclick = (e) => withBtn(e.currentTarget, async () => {
    read();
    const items = lines.filter((l) => l.variant_id && l.qty !== '');
    if (!items.length) throw new Error("Kamida bitta qatorni to'ldiring");
    await api('admin/stock/movements', {
      method: 'POST',
      body: { type, items, supplier: box.querySelector('#sup')?.value, note: box.querySelector('#dnote')?.value },
    });
    toast(`${T[0]} o'tkazildi`);
    close();
    onDone();
  });
}

/* ================= Kategoriyalar ================= */
async function pCategories(main) {
  const cats = await loadCats();
  main.innerHTML = `<div class="topline"><h1>Kategoriyalar<small>Mini app'dagi bo'limlar. Bo'sh kategoriyalar ilovada ko'rinmaydi. Rasm qo'yilmasa — birinchi mahsulot rasmi olinadi.</small></h1></div>
    <div class="panel" style="max-width:860px"><div class="table-wrap"><table class="t"><thead><tr><th>Rasm</th><th>Nomi</th><th class="r">Tartib</th><th class="r">Mahsulot</th><th>Faol</th><th></th></tr></thead><tbody>
    ${cats.map((c) => `<tr data-id="${c.id}" data-image="${esc(c.image || '')}"><td><label class="catimg" title="Rasm yuklash">${c.image ? `<img src="${esc(c.image)}" alt="" />` : icon('camera', 'sm')}<input type="file" accept="image/*" hidden /></label></td>
      <td><input class="input" data-k="name" value="${esc(c.name)}" /></td>
      <td class="r"><input class="input" data-k="sort" type="number" value="${c.sort}" style="width:80px" /></td>
      <td class="r">${c.count}</td><td><label class="toggle"><input type="checkbox" data-k="is_active" ${c.is_active ? 'checked' : ''} /><span class="sw"></span></label></td>
      <td class="r nowrap"><button class="btn btn-dark btn-sm" data-save>Saqlash</button> <button class="btn btn-red btn-icon" data-del ${c.count ? 'disabled title="Avval mahsulotlarni ko\'chiring"' : ''}>${icon('trash', 'xs')}</button></td></tr>`).join('')}
    <tr><td></td><td><input class="input" id="nc" placeholder="Yangi kategoriya nomi" /></td><td class="r"><input class="input" id="ns" type="number" value="${cats.length}" style="width:80px" /></td><td></td><td></td>
      <td class="r"><button class="btn btn-gold btn-sm" id="addC">${icon('plus', 'xs')} Qo'shish</button></td></tr>
    </tbody></table></div></div>`;
  main.querySelectorAll('tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    const val = () => ({ name: tr.querySelector('[data-k=name]').value, sort: tr.querySelector('[data-k=sort]').value, is_active: tr.querySelector('[data-k=is_active]').checked, image: tr.dataset.image });
    tr.querySelector('.catimg input').onchange = async (e) => {
      try {
        const { url } = await api('admin/upload', { method: 'POST', body: { image: await compressImage(e.target.files[0], 700) } });
        tr.dataset.image = url;
        tr.querySelector('.catimg').innerHTML = `<img src="${esc(url)}" alt="" /><input type="file" accept="image/*" hidden />`;
        await api('admin/categories/' + id, { method: 'PUT', body: val() });
        toast('Rasm saqlandi');
        pCategories(main);
      } catch (err) {
        toast(err.message, true);
      }
    };
    tr.querySelector('[data-save]').onclick = (e) => withBtn(e.currentTarget, async () => { await api('admin/categories/' + id, { method: 'PUT', body: val() }); toast('Saqlandi'); });
    tr.querySelector('[data-del]').onclick = (e) => {
      if (!confirm("Kategoriyani o'chirasizmi?")) return;
      withBtn(e.currentTarget, async () => { await api('admin/categories/' + id, { method: 'DELETE' }); pCategories(main); });
    };
  });
  main.querySelector('#addC').onclick = (e) => withBtn(e.currentTarget, async () => {
    await api('admin/categories', { method: 'POST', body: { name: main.querySelector('#nc').value, sort: main.querySelector('#ns').value } });
    toast("Kategoriya qo'shildi");
    pCategories(main);
  });
}

/* ================= Bannerlar ================= */
async function pBanners(main) {
  const [list, cats] = await Promise.all([api('admin/banners'), loadCats()]);
  main.innerHTML = `<div class="topline"><h1>Bannerlar<small>Bosh sahifadagi "Maxsus takliflar" karuseli. Chegirmali mahsulotlar avtomatik qo'shiladi.</small></h1>
    <button class="btn btn-gold" id="nb">${icon('plus', 'sm')} Yangi banner</button></div>
    <div class="cards-grid">${list.map((b) => `<div class="bn"><div class="bn-img">${b.image ? `<img src="${esc(b.image)}" alt="" />` : ''}</div>
      <div class="bn-b"><small>${esc(b.badge || '')}</small><b>${esc(b.title)}</b><div class="muted" style="font-size:13px">${esc(b.subtitle || '')}</div>
      <div style="display:flex;gap:8px;margin-top:12px;align-items:center">${b.is_active ? '<span class="pill green">Faol</span>' : '<span class="pill">O\'chiq</span>'}<span style="flex:1"></span>
      <button class="btn btn-dark btn-sm" data-edit="${b.id}">${icon('edit', 'xs')} Tahrirlash</button></div></div></div>`).join('') || '<p class="muted">Bannerlar yo\'q</p>'}</div>`;
  const open = (b) => {
    let image = b?.image || '';
    const { box, close } = modal(`${mHead(b ? 'Bannerni tahrirlash' : 'Yangi banner')}<form class="modal-b" id="bf">
      <div class="fgrid"><label class="field"><span>Yorliq (badge)</span><input class="input" name="badge" value="${esc(b?.badge || '')}" placeholder="Masalan: -20% · Chegirma" /></label>
        <label class="field"><span>Sarlavha *</span><input class="input" name="title" value="${esc(b?.title || '')}" /></label></div>
      <label class="field" style="margin-top:14px"><span>Qo'shimcha matn</span><input class="input" name="subtitle" value="${esc(b?.subtitle || '')}" /></label>
      <div class="fgrid" style="margin-top:14px"><label class="field"><span>Bosilganda</span><select class="input" name="link_type">
          <option value="none">Katalogga</option><option value="category" ${b?.link_type === 'category' ? 'selected' : ''}>Kategoriyaga</option><option value="product" ${b?.link_type === 'product' ? 'selected' : ''}>Mahsulotga (ID)</option></select></label>
        <label class="field"><span>Kategoriya / mahsulot ID</span><input class="input" name="link_value" value="${esc(b?.link_value || '')}" list="catl" /><datalist id="catl">${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</datalist></label>
        <label class="field"><span>Tartib</span><input class="input" name="sort" type="number" value="${b?.sort ?? list.length}" /></label></div>
      <div class="sec-t">Rasm</div><div class="imgs" id="bim"></div>
      <label class="toggle" style="margin-top:16px"><input type="checkbox" name="is_active" ${b?.is_active !== false ? 'checked' : ''} /><span class="sw"></span>Faol</label>
    </form><div class="modal-f">${b ? `<button class="btn btn-red" id="bdel">${icon('trash', 'sm')}</button><span style="flex:1"></span>` : ''}<button class="btn btn-dark" data-close>Bekor</button><button class="btn btn-gold" id="bsave">Saqlash</button></div>`);
    const bim = box.querySelector('#bim');
    const drawImg = () => {
      bim.innerHTML = (image ? `<div class="im" style="width:180px"><img src="${esc(image)}" alt="" /></div>` : '') + `<label class="add">${icon('camera')}${image ? 'Almashtirish' : 'Yuklash'}<input type="file" accept="image/*" hidden /></label>`;
      bim.querySelector('input').onchange = async (e) => {
        try { image = (await api('admin/upload', { method: 'POST', body: { image: await compressImage(e.target.files[0], 1200) } })).url; drawImg(); } catch (err) { toast(err.message, true); }
      };
    };
    drawImg();
    const f = box.querySelector('#bf');
    box.querySelector('#bsave').onclick = (e) => withBtn(e.currentTarget, async () => {
      const body = { ...Object.fromEntries(new FormData(f)), image, is_active: f.is_active.checked };
      await api(b ? 'admin/banners/' + b.id : 'admin/banners', { method: b ? 'PUT' : 'POST', body });
      toast('Saqlandi');
      close();
      pBanners(main);
    });
    box.querySelector('#bdel')?.addEventListener('click', (e) => {
      if (!confirm("Bannerni o'chirasizmi?")) return;
      withBtn(e.currentTarget, async () => { await api('admin/banners/' + b.id, { method: 'DELETE' }); close(); pBanners(main); });
    });
  };
  main.querySelector('#nb').onclick = () => open(null);
  main.querySelectorAll('[data-edit]').forEach((x) => (x.onclick = () => open(list.find((b) => b.id === Number(x.dataset.edit)))));
}

/* ================= Mijozlar ================= */
async function pCustomers(main) {
  const list = await api('admin/customers');
  main.innerHTML = `<div class="topline"><h1>Mijozlar<small>${list.length} ta mijoz (telefon raqami bo'yicha)</small></h1>
    <button class="btn btn-dark" id="cexp">${icon('download', 'sm')} CSV</button></div>
    <div class="panel"><div class="table-wrap"><table class="t"><thead><tr><th>Mijoz</th><th>Telefon</th><th>Hudud</th><th class="r">Buyurtmalar</th><th class="r">Xarid summasi</th><th>Oxirgi buyurtma</th></tr></thead><tbody>
    ${list.length ? list.map((c) => `<tr><td><b style="font-weight:600">${esc(c.name)}</b>${c.tg_username ? `<div><a class="gold" style="font-size:12px" href="https://t.me/${esc(c.tg_username)}" target="_blank">@${esc(c.tg_username)}</a></div>` : ''}</td>
      <td><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></td><td>${esc(c.region)}</td><td class="r">${c.orders}</td><td class="r nowrap"><b>${money(c.spent)}</b></td><td class="muted">${fmtDate(c.last_order)}</td></tr>`).join('')
      : `<tr><td colspan="6" class="empty-row">Hali mijozlar yo'q</td></tr>`}</tbody></table></div></div>`;
  main.querySelector('#cexp').onclick = () => csv('mijozlar', [['Ism', 'Telefon', 'Telegram', 'Hudud', 'Buyurtmalar', 'Summa'], ...list.map((c) => [c.name, c.phone, c.tg_username, c.region, c.orders, c.spent])]);
}

/* ================= Sozlamalar ================= */
async function pSettings(main) {
  const { settings: s, regions, env } = await api('admin/settings');
  const cards = [...s.payment.cards];
  main.innerHTML = `<div class="topline"><h1>Sozlamalar<small>To'lov kartalari, yetkazib berish narxlari, do'kon ma'lumotlari</small></h1>
    <button class="btn btn-gold" id="ssave">${icon('check', 'sm')} Saqlash</button></div>
    <div class="grid-2e">
      <div class="stack">
        <div class="panel"><div class="panel-h"><h3>${icon('card', 'sm')} To'lov kartalari</h3></div><div class="panel-b">
          ${!cards.length ? `<div class="alert red" style="margin-bottom:14px">${icon('alert', 'sm')} Hali karta kiritilmagan — mijozlar to'lov uchun karta raqamini ko'rmaydi.</div>` : ''}
          <div id="cards"></div>
          <button class="btn btn-dark btn-sm" id="addCard" style="margin-top:12px">${icon('plus', 'xs')} Karta qo'shish</button>
          <div class="fgrid" style="margin-top:18px">
            <label class="field"><span>Bron muddati (soat)</span><input class="input" id="rh" type="number" min="0" value="${s.payment.reserve_hours}" /></label></div>
          <label class="field" style="margin-top:14px"><span>To'lov sahifasidagi izoh</span><textarea class="input" id="pnote">${esc(s.payment.note || '')}</textarea></label>
          <p class="muted" style="font-size:12.5px;margin:10px 0 0">To'lanmagan buyurtma bron muddati o'tgach avtomatik bekor qilinadi va mahsulot omborga qaytadi (0 = o'chirilgan).</p>
        </div></div>

        <div class="panel"><div class="panel-h"><h3>${icon('store', 'sm')} Do'kon</h3></div><div class="panel-b">
          <div class="fgrid">
            <label class="field"><span>Nomi</span><input class="input" data-shop="name" value="${esc(s.shop.name)}" /></label>
            <label class="field"><span>Shior</span><input class="input" data-shop="tagline" value="${esc(s.shop.tagline)}" /></label>
            <label class="field"><span>Telefon 1</span><input class="input" data-phone="0" value="${esc(s.shop.phones[0] || '')}" /></label>
            <label class="field"><span>Telefon 2</span><input class="input" data-phone="1" value="${esc(s.shop.phones[1] || '')}" /></label>
            <label class="field"><span>Admin Telegram (username)</span><input class="input" data-shop="admin_telegram" value="${esc(s.shop.admin_telegram)}" /></label>
            <label class="field"><span>Ish vaqti</span><input class="input" data-shop="hours" value="${esc(s.shop.hours)}" /></label>
            <label class="field"><span>Telegram kanal</span><input class="input" data-shop="channel" value="${esc(s.shop.channel)}" /></label>
            <label class="field"><span>Instagram</span><input class="input" data-shop="instagram" value="${esc(s.shop.instagram)}" /></label>
          </div>
          <label class="field" style="margin-top:14px"><span>Manzil</span><input class="input" data-shop="address" value="${esc(s.shop.address)}" /></label>
        </div></div>

        <div class="panel"><div class="panel-h"><h3>${icon('send', 'sm')} Telegram bot</h3></div><div class="panel-b">
          <div style="display:grid;gap:8px">
            <div>${env.bot ? '<span class="pill green">BOT_TOKEN ulangan</span>' : '<span class="pill red">BOT_TOKEN yo\'q</span>'} <span class="muted">— xabarnomalar va initData tekshiruvi</span></div>
            <div>${env.admin_chat ? '<span class="pill green">ADMIN_CHAT_ID bor</span>' : '<span class="pill amber">ADMIN_CHAT_ID yo\'q</span>'} <span class="muted">— yangi buyurtma xabarlari</span></div>
            <div>${env.telegram_pay ? '<span class="pill green">Click/Payme ulangan</span>' : '<span class="pill">PAYMENT_PROVIDER_TOKEN yo\'q</span>'} <span class="muted">— Telegram ichida karta to'lovi</span></div>
          </div>
          <p class="muted" style="font-size:12.5px">Bu qiymatlar Vercel → Project → Settings → Environment Variables bo'limida kiritiladi, keyin qayta deploy qilinadi.</p>
          <button class="btn btn-dark" id="wh" ${env.bot ? '' : 'disabled'}>${icon('refresh', 'sm')} Webhook va menyu tugmasini o'rnatish</button>
        </div></div>
      </div>

      <div class="panel"><div class="panel-h"><h3>${icon('truck', 'sm')} Yetkazib berish</h3></div><div class="panel-b">
        <div style="display:flex;gap:22px;flex-wrap:wrap;margin-bottom:16px"><label class="toggle"><input type="checkbox" id="pick" ${s.delivery.pickup_enabled ? 'checked' : ''} /><span class="sw"></span>Do'kondan olib ketish (bepul)</label></div>
        <div class="fgrid"><label class="field"><span>Bepul yetkazish (so'mdan)</span><input class="input" id="ff" type="number" min="0" step="10000" value="${s.delivery.free_from || ''}" placeholder="Bo'sh = o'chiq" /></label>
          <label class="field"><span>Muddat matni</span><input class="input" id="dd" value="${esc(s.delivery.days)}" /></label></div>
        <div class="sec-t">Viloyatlar bo'yicha narx (so'm)</div>
        <table class="vtable"><tbody>${regions.map((r) => `<tr><td style="width:60%">${esc(r)}</td><td><input class="input" data-region="${esc(r)}" type="number" min="0" step="1000" value="${s.delivery.prices[r] ?? 0}" /></td></tr>`).join('')}</tbody></table>
        <div class="presets"><span class="muted" style="font-size:12.5px;align-self:center">Hammasiga:</span>${[25000, 30000, 35000, 40000, 50000].map((x) => `<button class="btn btn-dark btn-sm" data-all="${x}">${fmt(x)}</button>`).join('')}</div>
      </div></div>
    </div>`;

  const cardsEl = main.querySelector('#cards');
  const readCards = () => cardsEl.querySelectorAll('.bankrow').forEach((row, i) => row.querySelectorAll('[data-c]').forEach((x) => (cards[i][x.dataset.c] = x.value)));
  const drawCards = () => {
    cardsEl.innerHTML = cards.map((c, i) => `<div class="bankrow">
      <select class="input" data-c="type">${['Uzcard', 'Humo', 'Visa', 'Mastercard'].map((t) => `<option ${c.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input class="input num" data-c="number" value="${esc(c.number)}" placeholder="8600 0000 0000 0000" inputmode="numeric" />
      <input class="input" data-c="holder" value="${esc(c.holder)}" placeholder="Karta egasi (F.I.Sh)" />
      <button class="btn btn-dark btn-icon" data-rmc="${i}">${icon('trash', 'xs')}</button></div>`).join('');
  };
  cardsEl.onclick = (e) => { const b = e.target.closest('[data-rmc]'); if (b) { readCards(); cards.splice(Number(b.dataset.rmc), 1); drawCards(); } };
  cardsEl.oninput = (e) => {
    if (e.target.dataset.c === 'number') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
  };
  main.querySelector('#addCard').onclick = () => { readCards(); if (cards.length < 5) cards.push({ type: 'Uzcard', number: '', holder: '' }); drawCards(); };
  drawCards();
  main.querySelectorAll('[data-all]').forEach((b) => (b.onclick = () => main.querySelectorAll('[data-region]').forEach((x) => (x.value = b.dataset.all))));

  main.querySelector('#wh').onclick = (e) => withBtn(e.currentTarget, async () => {
    const r = await api('admin/telegram/webhook', { method: 'POST' });
    toast("Webhook o'rnatildi: " + r.url);
  });

  main.querySelector('#ssave').onclick = (e) => withBtn(e.currentTarget, async () => {
    readCards();
    const bad = cards.find((c) => c.number.replace(/\s/g, '').length !== 16);
    if (bad) throw new Error("Karta raqami 16 ta raqamdan iborat bo'lishi kerak");
    const shop = {};
    main.querySelectorAll('[data-shop]').forEach((x) => (shop[x.dataset.shop] = x.value));
    shop.phones = [...main.querySelectorAll('[data-phone]')].map((x) => x.value).filter(Boolean);
    const prices = {};
    main.querySelectorAll('[data-region]').forEach((x) => (prices[x.dataset.region] = x.value));
    await api('admin/settings', {
      method: 'PUT',
      body: {
        shop,
        payment: { cards, reserve_hours: main.querySelector('#rh').value, note: main.querySelector('#pnote').value },
        delivery: { pickup_enabled: main.querySelector('#pick').checked, free_from: main.querySelector('#ff').value, days: main.querySelector('#dd').value, prices },
      },
    });
    toast('Sozlamalar saqlandi');
    pSettings(main);
  });
}

/* ================= Ishga tushirish ================= */
token ? start() : renderLogin();
