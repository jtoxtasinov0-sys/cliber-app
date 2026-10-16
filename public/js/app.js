import { esc, money, fmtDate, compressImage, formatPhone, phoneDigits, icon, categoryIcon } from './shared.js';

/* ================= Telegram & holat ================= */
const tg = window.Telegram?.WebApp;
const inTg = Boolean(tg?.initData);
if (tg) {
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor('#0a0a0b');
    tg.setBackgroundColor('#0a0a0b');
    tg.setBottomBarColor?.('#0a0a0b');
    tg.disableVerticalSwipes?.();
  } catch {}
}
if (inTg) document.documentElement.classList.add('tg');
const tgUser = tg?.initDataUnsafe?.user || null;
const haptic = (t = 'light') => { try { tg?.HapticFeedback?.impactOccurred(t); } catch {} };
const hapticOk = (t = 'success') => { try { tg?.HapticFeedback?.notificationOccurred(t); } catch {} };

const ls = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let deviceId = ls.get('cl_device', null);
if (!deviceId) {
  deviceId = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));
  ls.set('cl_device', deviceId);
}

const S = {
  data: null,
  byId: new Map(),
  variantById: new Map(),
  cart: ls.get('cl_cart', []),
  favs: new Set(ls.get('cl_favs', [])),
  profile: ls.get('cl_profile', {}),
  orders: [],
};
const saveCart = () => { ls.set('cl_cart', S.cart); renderTabbar(); };
const saveFavs = () => ls.set('cl_favs', [...S.favs]);

async function api(path, opts = {}) {
  const r = await fetch('/api/' + path, {
    method: opts.method || 'GET',
    headers: {
      'content-type': 'application/json',
      'x-device-id': deviceId,
      ...(inTg ? { 'x-telegram-init-data': tg.initData } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Tarmoq xatosi');
  return j;
}

/* ================= UI yordamchilar ================= */
const $view = document.getElementById('view');
const $tab = document.getElementById('tabbar');
const $toast = document.getElementById('toast');
let toastTimer;
function toast(msg, err = false) {
  $toast.innerHTML = `${icon(err ? 'alert' : 'check', 'sm')}<span>${esc(msg)}</span>`;
  $toast.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($toast.className = 'toast' + (err ? ' err' : '')), 2600);
}
function openLink(url) {
  if (!url) return;
  if (tg && /^https:\/\/t\.me\//.test(url)) return tg.openTelegramLink(url);
  if (tg && /^https?:/.test(url)) return tg.openLink(url);
  window.open(url, '_blank');
}
const priceHtml = (p) =>
  p.price
    ? `<b>${money(p.price)}</b>${p.old_price ? `<s>${money(p.old_price)}</s>` : ''}`
    : `<span class="ask">Narxi so'rov bo'yicha</span>`;
const discount = (p) => (p.price && p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0);
const cartCount = () => S.cart.reduce((s, i) => s + i.qty, 0);
const isLow = (n) => n > 0 && n <= 3;

function productCard(p) {
  const d = discount(p);
  const out = p.stock <= 0;
  return `
  <a class="pcard${out ? ' out' : ''}" href="#/product/${p.id}">
    <div class="pcard-img">
      <img src="${esc(p.images[0] || '/img/brand/logo_512.png')}" alt="${esc(p.name)}" loading="lazy" decoding="async" />
      <div class="badges">
        ${d ? `<span class="badge red">-${d}%</span>` : ''}
        ${p.is_new && !out ? `<span class="badge gold">Yangi</span>` : ''}
        ${out ? `<span class="badge dark">Tugagan</span>` : ''}
      </div>
      <button class="fav${S.favs.has(p.id) ? ' on' : ''}" data-fav="${p.id}" aria-label="Sevimli">${icon('heart', 'sm')}</button>
    </div>
    <div class="pcard-body">
      ${p.brand ? `<div class="pcard-brand">${esc(p.brand)}</div>` : `<div class="pcard-brand">${esc(p.category_name || 'CLIMBER')}</div>`}
      <div class="pcard-name">${esc(p.name)}</div>
      <div class="price">${priceHtml(p)}</div>
    </div>
  </a>`;
}

function pageHead(title, right = '') {
  return `<header class="pagehead">
    <button class="icon-btn back-btn" data-back aria-label="Orqaga">${icon('back')}</button>
    <h1>${esc(title)}</h1>${right}
  </header>`;
}

function emptyState(ic, title, text, btn = '') {
  return `<div class="empty page"><div class="em-ic">${icon(ic)}</div><h2>${title}</h2><p>${text}</p>${btn}</div>`;
}

function sheet(html) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `<div class="sheet-bg"></div><div class="sheet">${html}</div>`;
  const bg = root.querySelector('.sheet-bg');
  const sh = root.querySelector('.sheet');
  requestAnimationFrame(() => { bg.classList.add('open'); sh.classList.add('open'); });
  const close = () => {
    bg.classList.remove('open');
    sh.classList.remove('open');
    setTimeout(() => (root.innerHTML = ''), 300);
  };
  bg.onclick = close;
  return { el: sh, close };
}

/* ================= Router ================= */
const ROOTS = ['', 'catalog', 'cart', 'favorites', 'profile'];
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || '', arg: parts[1], q: new URLSearchParams(qs || '') };
}
const go = (h, replace = false) => (replace ? location.replace(h) : (location.hash = h));
const scrollMemo = {};
let currentKey = '';

function router() {
  const r = parseHash();
  scrollMemo[currentKey] = window.scrollY;
  currentKey = location.hash;
  const views = { '': vHome, catalog: vCatalog, product: vProduct, cart: vCart, checkout: vCheckout, order: vOrder, orders: vOrders, favorites: vFavorites, profile: vProfile };
  const fn = views[r.name] || vHome;
  document.getElementById('sheet-root').innerHTML = '';
  fn(r);
  const isRoot = ROOTS.includes(r.name);
  $tab.classList.toggle('hide', !isRoot);
  $view.classList.toggle('no-tab', !isRoot);
  renderTabbar();
  if (tg?.BackButton) isRoot && r.name === '' ? tg.BackButton.hide() : tg.BackButton.show();
  requestAnimationFrame(() => window.scrollTo(0, scrollMemo[currentKey] || 0));
}
function goBack() {
  if (history.length > 1) history.back();
  else go('#/');
}
tg?.BackButton?.onClick(goBack);

function renderTabbar() {
  const r = parseHash().name;
  const n = cartCount();
  const tab = (h, name, ic, label) =>
    `<a class="tab${r === name ? ' active' : ''}" href="${h}"><span class="ti">${icon(ic)}</span>${label}</a>`;
  $tab.innerHTML = `
    ${tab('#/', '', 'home', 'Asosiy')}
    ${tab('#/catalog', 'catalog', 'grid', 'Katalog')}
    <a class="tab-cart" href="#/cart" aria-label="Savat">${icon('bag')}${n ? `<span class="count">${n}</span>` : ''}</a>
    ${tab('#/favorites', 'favorites', 'heart', 'Sevimli')}
    ${tab('#/profile', 'profile', 'user', 'Profil')}`;
}
function bumpCart() {
  const c = $tab.querySelector('.count');
  if (c) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
}

/* ================= Sahifalar ================= */
function vHome() {
  const { shop, banners, categories, products } = S.data;
  const name = tgUser?.first_name || S.profile.name?.split(' ')[0];
  const available = products.filter((p) => p.stock > 0);
  const best = [...available].sort((a, b) => b.sold_count - a.sold_count || b.is_featured - a.is_featured).slice(0, 10);
  const fresh = available.filter((p) => p.is_new).slice(0, 10);

  const promos = [
    ...products.filter((p) => discount(p) > 0 && p.stock > 0).map((p) => ({
      badge: `-${discount(p)}% · Chegirma`, title: p.name, image: p.images[0], href: `#/product/${p.id}`, price: p, red: true,
    })),
    ...banners.map((b) => ({
      badge: b.badge, title: b.title, sub: b.subtitle, image: b.image,
      href: b.link_type === 'category' ? `#/catalog?cat=${b.link_value}` : b.link_type === 'product' ? `#/product/${b.link_value}` : '#/catalog',
    })),
  ];

  $view.innerHTML = `<div class="page">
    <div class="topbar">
      <div class="brand">
        <img src="/img/brand/logo_512.png" alt="" />
        <div><div class="brand-name">${esc(shop.name)}</div>
          <div class="brand-sub"><span class="by">By Sabirov's</span><span class="since">Since ${esc(shop.since)}</span></div></div>
      </div>
      <a class="icon-btn" href="#/orders" aria-label="Buyurtmalarim">${icon('receipt')}${S.orders.some((o) => o.payment_status === 'awaiting' && o.status === 'new') ? '<span class="dot"></span>' : ''}</a>
    </div>
    <div class="hello">
      <small>${name ? `Assalomu alaykum, ${esc(name)} 👋` : 'Assalomu alaykum 👋'}</small>
      <h1>Siz <em>eng yaxshisiga</em><br/>loyiqsiz</h1>
    </div>
    <form class="searchbar" id="homeSearch">${icon('search', 'sm')}<input name="q" type="search" placeholder="Polo, krossovka, kostyum..." enterkeyhint="search" />
      <a class="filter-btn" href="#/catalog" aria-label="Katalog">${icon('sliders', 'sm')}</a></form>

    <div class="hscroll chips">
      ${categories.map((c) => `<a class="chip" href="#/catalog?cat=${c.id}"><span class="ci">${icon(categoryIcon(c.name), 'sm')}</span>${esc(c.name)}</a>`).join('')}
    </div>

    ${promos.length ? `<section class="section">
      <div class="section-head"><h2>Maxsus takliflar</h2></div>
      <div class="promo-track" id="promoTrack">
        ${promos.map((p) => `<a class="promo${p.red ? ' red' : ''}" href="${p.href}">
          <div class="promo-body">
            ${p.badge ? `<div class="promo-badge">${esc(p.badge)}</div>` : ''}
            <div class="promo-title">${esc(p.title)}</div>
            ${p.price ? `<div class="promo-price"><b>${money(p.price.price)}</b><s>${money(p.price.old_price)}</s></div>` : p.sub ? `<div class="promo-sub">${esc(p.sub)}</div>` : ''}
            <span class="promo-cta">Ko'rish ${icon('arrow', 'xs')}</span>
          </div>
          <div class="promo-img">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" />` : ''}</div>
        </a>`).join('')}
      </div>
      <div class="dots" id="promoDots">${promos.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>
    </section>` : ''}

    ${best.length ? `<section class="section">
      <div class="section-head"><h2>Eng ko'p sotilgan</h2><a class="link-more" href="#/catalog?sort=popular">Hammasi ${icon('arrow', 'xs')}</a></div>
      <div class="hscroll">${best.map(productCard).join('')}</div>
    </section>` : ''}

    <div class="trust">
      <div>${icon('truck')}<b>Yetkazish</b>O'zbekiston bo'ylab</div>
      <div>${icon('shield')}<b>Xavfsiz to'lov</b>Uzcard · Humo · Visa</div>
      <div>${icon('award')}<b>Since ${esc(shop.since)}</b>${new Date().getFullYear() - shop.since} yillik tajriba</div>
    </div>

    ${fresh.length ? `<section class="section">
      <div class="section-head"><h2>Yangi kolleksiya</h2><a class="link-more" href="#/catalog?sort=new">Hammasi ${icon('arrow', 'xs')}</a></div>
      <div class="hscroll">${fresh.map(productCard).join('')}</div>
    </section>` : ''}

    <section class="section">
      <div class="section-head"><h2>Barcha mahsulotlar</h2><a class="link-more" href="#/catalog">Katalog ${icon('arrow', 'xs')}</a></div>
      <div class="grid">${products.slice(0, 12).map(productCard).join('')}</div>
      ${products.length > 12 ? `<div class="wrap" style="margin-top:18px"><a class="btn btn-dark btn-block" href="#/catalog">Yana ${products.length - 12} ta mahsulot ${icon('arrow', 'sm')}</a></div>` : ''}
    </section>
    ${footer()}
  </div>`;

  document.getElementById('homeSearch').onsubmit = (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q').trim();
    go('#/catalog' + (q ? '?q=' + encodeURIComponent(q) : ''));
  };
  setupCarousel();
}

let carouselTimer;
function setupCarousel() {
  clearInterval(carouselTimer);
  const track = document.getElementById('promoTrack');
  const dots = document.getElementById('promoDots');
  if (!track) return;
  const slides = [...track.children];
  let idx = 0;
  const setDot = () => {
    const w = slides[0].offsetWidth + 12;
    idx = Math.round(track.scrollLeft / w);
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === idx));
  };
  track.addEventListener('scroll', () => requestAnimationFrame(setDot), { passive: true });
  let paused = false;
  track.addEventListener('touchstart', () => (paused = true), { passive: true });
  track.addEventListener('touchend', () => setTimeout(() => (paused = false), 4000), { passive: true });
  if (slides.length > 1) {
    carouselTimer = setInterval(() => {
      if (paused || !document.body.contains(track)) return;
      const next = (idx + 1) % slides.length;
      track.scrollTo({ left: slides[next].offsetLeft - slides[0].offsetLeft, behavior: 'smooth' });
    }, 4500);
  }
}

function footer() {
  const s = S.data.shop;
  return `<div class="foot"><img src="/img/brand/logo_512.png" alt="" />
    <div><b style="color:var(--text);letter-spacing:.14em">${esc(s.name)}</b> · <em>Since ${esc(s.since)}</em></div>
    <div style="margin-top:4px">${esc(s.address)} · ${esc(s.hours)}</div></div>`;
}

function vCatalog(r) {
  const { categories, products } = S.data;
  const cat = Number(r.q.get('cat')) || 0;
  const q = r.q.get('q') || '';
  const sort = r.q.get('sort') || 'new';
  const onlyAvail = r.q.get('avail') === '1';

  const norm = (s) => s.toLowerCase().replace(/[ʻʼ`’']/g, '');
  let list = products.filter((p) => (!cat || p.category_id === cat) && (!onlyAvail || p.stock > 0));
  if (q) {
    const words = norm(q).split(/\s+/).filter(Boolean);
    list = list.filter((p) => {
      const hay = norm(`${p.name} ${p.brand || ''} ${p.category_name || ''}`);
      return words.every((w) => hay.includes(w));
    });
  }
  const priceOf = (p) => p.price ?? Infinity;
  const sorters = {
    new: (a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id,
    cheap: (a, b) => priceOf(a) - priceOf(b),
    expensive: (a, b) => (b.price ?? -1) - (a.price ?? -1),
    popular: (a, b) => b.sold_count - a.sold_count || b.is_featured - a.is_featured,
  };
  list.sort((a, b) => (b.stock > 0) - (a.stock > 0) || (sorters[sort] || sorters.new)(a, b));

  const link = (patch) => {
    const p = new URLSearchParams({ ...(cat && { cat }), ...(q && { q }), sort, ...(onlyAvail && { avail: '1' }), ...patch });
    for (const [k, v] of [...p]) if (!v || v === '0') p.delete(k);
    return '#/catalog?' + p.toString();
  };

  $view.innerHTML = `<div class="page">
    <div class="topbar"><h1 style="font-size:26px;font-weight:800;flex:1">Katalog</h1>
      <span class="muted" style="font-size:13px">${list.length} ta mahsulot</span></div>
    <form class="searchbar" id="catSearch" style="margin-top:6px">${icon('search', 'sm')}
      <input name="q" type="search" value="${esc(q)}" placeholder="Mahsulot qidirish..." enterkeyhint="search" autocomplete="off" />
      ${q ? `<a class="filter-btn" href="${link({ q: '' })}" aria-label="Tozalash">${icon('x', 'sm')}</a>` : ''}
    </form>
    <div class="hscroll chips">
      <a class="chip plain${!cat ? ' active' : ''}" href="${link({ cat: '' })}">Hammasi</a>
      ${categories.map((c) => `<a class="chip${cat === c.id ? ' active' : ''}" href="${link({ cat: c.id })}"><span class="ci">${icon(categoryIcon(c.name), 'sm')}</span>${esc(c.name)}</a>`).join('')}
    </div>
    <div class="sortbar">
      <select id="sortSel" aria-label="Saralash">
        ${[['new', 'Avval yangilari'], ['popular', 'Ommaboplari'], ['cheap', 'Arzonroq'], ['expensive', 'Qimmatroq']].map(([v, t]) => `<option value="${v}"${sort === v ? ' selected' : ''}>${t}</option>`).join('')}
      </select>
      <span class="grow"></span>
      <a class="chip plain${onlyAvail ? ' active' : ''}" style="height:36px;font-size:13px" href="${link({ avail: onlyAvail ? '' : '1' })}">Faqat mavjud</a>
    </div>
    ${list.length ? `<div class="grid">${list.map(productCard).join('')}</div>` : emptyState('search', 'Hech narsa topilmadi', "Boshqa so'z bilan qidirib ko'ring yoki filtrni o'zgartiring", `<a class="btn btn-dark" href="#/catalog">Filtrni tozalash</a>`)}
  </div>`;

  const form = document.getElementById('catSearch');
  form.onsubmit = (e) => {
    e.preventDefault();
    form.q.blur();
    go(link({ q: form.q.value.trim() }), true);
  };
  let t;
  form.q.oninput = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      go(link({ q: form.q.value.trim() }), true);
      const inp = document.querySelector('#catSearch input');
      inp?.focus();
      inp?.setSelectionRange(inp.value.length, inp.value.length);
    }, 450);
  };
  document.getElementById('sortSel').onchange = (e) => go(link({ sort: e.target.value }), true);
}

function vProduct(r) {
  const p = S.byId.get(Number(r.arg));
  if (!p) {
    $view.innerHTML = pageHead('Mahsulot') + emptyState('box', 'Mahsulot topilmadi', 'Ehtimol, u sotuvdan olingan', `<a class="btn btn-gold" href="#/catalog">Katalogga o'tish</a>`);
    return;
  }
  const { delivery, shop } = S.data;
  const avail = p.variants.filter((v) => v.stock > 0);
  let sel = avail.length === 1 ? avail[0].id : p.variants.length === 1 && p.variants[0].stock > 0 ? p.variants[0].id : null;
  let qty = 1;
  const similar = S.data.products.filter((x) => x.id !== p.id && x.category_id === p.category_id && x.stock > 0).slice(0, 10);
  const d = discount(p);
  const minDelivery = Math.min(...Object.values(delivery.prices).filter((x) => x > 0));

  $view.innerHTML = `<div class="page">
    <div class="gallery">
      <div class="gallery-top">
        <button class="icon-btn back-btn" data-back aria-label="Orqaga">${icon('back')}</button>
        <div class="right">
          <button class="fav${S.favs.has(p.id) ? ' on' : ''}" data-fav="${p.id}" aria-label="Sevimli">${icon('heart', 'sm')}</button>
        </div>
      </div>
      <div class="gallery-track" id="gal">${p.images.map((src, i) => `<img src="${esc(src)}" alt="${esc(p.name)}" ${i ? 'loading="lazy"' : ''} />`).join('')}</div>
      ${p.images.length > 1 ? `<div class="dots" id="galDots">${p.images.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
    </div>
    <div class="pinfo">
      <div class="meta">${esc(p.category_name || '')}${p.brand ? `<i></i>${esc(p.brand)}` : ''}</div>
      <h1>${esc(p.name)}</h1>
      <div class="price">${priceHtml(p)}${d ? `<span class="badge red" style="align-self:center">-${d}%</span>` : ''}</div>
      <div id="stockLine"></div>

      ${p.variants.length > 1 || p.variants[0]?.size !== 'Standart' ? `
      <div class="sub-h">O'lchamni tanlang <small id="sizeHint"></small></div>
      <div class="sizes" id="sizes">
        ${p.variants.map((v) => `<button class="size" data-v="${v.id}" ${v.stock <= 0 ? 'disabled' : ''}>${esc(v.size)}${isLow(v.stock) ? `<small>${v.stock}</small>` : ''}</button>`).join('')}
      </div>` : ''}

      ${p.price && p.stock > 0 ? `
      <div class="sub-h">Miqdor</div>
      <div class="stepper" id="qty"><button data-q="-1" aria-label="Kamaytirish">${icon('minus', 'sm')}</button><span>1</span><button data-q="1" aria-label="Ko'paytirish">${icon('plus', 'sm')}</button></div>` : ''}

      ${p.description ? `<div class="sub-h">Tavsif</div><div class="desc">${esc(p.description)}</div>` : ''}

      <div class="perks">
        <div class="perk"><span class="pi">${icon('truck')}</span><div><b>O'zbekiston bo'ylab yetkazish</b>
          <small>${delivery.days}${isFinite(minDelivery) ? ` · ${money(minDelivery)} dan` : ''}${delivery.free_from ? ` · ${money(delivery.free_from)} dan bepul` : ''}</small></div></div>
        <div class="perk"><span class="pi">${icon('card')}</span><div><b>Faqat karta orqali to'lov</b><small>Uzcard, Humo, Visa — oldindan to'lov</small></div></div>
        ${delivery.pickup_enabled ? `<div class="perk"><span class="pi">${icon('store')}</span><div><b>Do'kondan olib ketish — bepul</b><small>${esc(shop.address)}</small></div></div>` : ''}
      </div>

      <button class="btn btn-dark btn-block" style="margin-top:14px" data-ask="${p.id}">${icon('send', 'sm')} Admin bilan bog'lanish</button>
    </div>

    ${similar.length ? `<section class="section"><div class="section-head"><h2>O'xshash mahsulotlar</h2></div>
      <div class="hscroll">${similar.map(productCard).join('')}</div></section>` : ''}

    <div class="buybar">
      <div class="bb-price"><small>${p.price ? 'Narxi' : 'Narx'}</small><b id="bbPrice">${p.price ? money(p.price) : "So'rang"}</b></div>
      <button class="btn btn-gold" id="addBtn"></button>
    </div>
  </div>`;

  const gal = document.getElementById('gal');
  const gd = document.getElementById('galDots');
  if (gd) gal.addEventListener('scroll', () => {
    const i = Math.round(gal.scrollLeft / gal.offsetWidth);
    [...gd.children].forEach((x, j) => x.classList.toggle('on', i === j));
  }, { passive: true });

  const addBtn = document.getElementById('addBtn');
  const stockLine = document.getElementById('stockLine');
  const qtyEl = document.getElementById('qty');

  function update() {
    const v = p.variants.find((x) => x.id === sel);
    document.querySelectorAll('#sizes .size').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === sel));
    const stock = v ? v.stock : p.stock;
    stockLine.innerHTML = p.stock <= 0
      ? `<span class="stock-line out">Hozircha mavjud emas</span>`
      : isLow(stock) ? `<span class="stock-line low">Shoshiling! Atigi ${stock} dona qoldi</span>`
      : `<span class="stock-line">Omborda mavjud${v ? ` · ${stock} dona` : ''}</span>`;
    if (v && qty > v.stock) qty = v.stock;
    if (qtyEl) {
      qtyEl.querySelector('span').textContent = qty;
      qtyEl.querySelector('[data-q="-1"]').disabled = qty <= 1;
      qtyEl.querySelector('[data-q="1"]').disabled = v ? qty >= v.stock : false;
    }
    if (p.price) document.getElementById('bbPrice').textContent = money(p.price * qty);
    const inCart = v && S.cart.find((c) => c.variant_id === v.id);
    if (!p.price) addBtn.innerHTML = `${icon('send', 'sm')} Narxini so'rash`;
    else if (p.stock <= 0) { addBtn.innerHTML = 'Tugagan'; addBtn.disabled = true; }
    else if (inCart) addBtn.innerHTML = `${icon('check', 'sm')} Savatda (${inCart.qty}) · Qo'shish`;
    else addBtn.innerHTML = `${icon('bag', 'sm')} Savatga qo'shish`;
  }

  document.getElementById('sizes')?.addEventListener('click', (e) => {
    const b = e.target.closest('.size');
    if (!b || b.disabled) return;
    sel = Number(b.dataset.v);
    haptic('light');
    document.getElementById('sizeHint').textContent = '';
    update();
  });
  qtyEl?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    qty = Math.max(1, qty + Number(b.dataset.q));
    haptic('light');
    update();
  });
  addBtn.onclick = () => {
    if (!p.price) return askAdmin(p);
    if (!sel) {
      document.getElementById('sizeHint').innerHTML = `<span style="color:var(--amber)">Avval o'lchamni tanlang</span>`;
      document.getElementById('sizes')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      hapticOk('warning');
      return;
    }
    const v = p.variants.find((x) => x.id === sel);
    const ex = S.cart.find((c) => c.variant_id === sel);
    const already = ex ? ex.qty : 0;
    if (already + qty > v.stock) return toast(`Omborda faqat ${v.stock} dona bor`, true);
    if (ex) ex.qty += qty;
    else S.cart.push({ variant_id: sel, product_id: p.id, qty });
    saveCart();
    hapticOk();
    toast("Savatga qo'shildi");
    qty = 1;
    update();
  };
  update();
}

function askAdmin(p) {
  const user = S.data.shop.admin_telegram;
  const text = encodeURIComponent(`Assalomu alaykum! "${p.name}" haqida ma'lumot olmoqchiman.`);
  openLink(`https://t.me/${user}?text=${text}`);
}

function cartLines() {
  const lines = [];
  for (const c of S.cart) {
    const p = S.byId.get(c.product_id);
    const v = S.variantById.get(c.variant_id);
    if (!p || !v || !p.price) continue;
    lines.push({ ...c, p, v, sum: p.price * c.qty });
  }
  return lines;
}

function vCart() {
  // mavjud bo'lmagan / o'chirilgan pozitsiyalarni tozalash
  const before = S.cart.length;
  S.cart = S.cart.filter((c) => S.byId.get(c.product_id) && S.variantById.get(c.variant_id));
  if (S.cart.length !== before) saveCart();
  const lines = cartLines();
  if (!lines.length) {
    $view.innerHTML = `<div class="topbar"><h1 style="font-size:26px;font-weight:800">Savat</h1></div>` +
      emptyState('bag', "Savatingiz bo'sh", "Yoqqan mahsulotlarni savatga qo'shing — biz ularni O'zbekistonning istalgan hududiga yetkazamiz", `<a class="btn btn-gold" href="#/catalog">Xaridni boshlash ${icon('arrow', 'sm')}</a>`);
    return;
  }
  const subtotal = lines.reduce((s, l) => s + l.sum, 0);
  const { delivery } = S.data;
  const free = delivery.free_from;
  const hasIssue = lines.some((l) => l.qty > l.v.stock);

  $view.innerHTML = `<div class="page">
    <div class="topbar"><h1 style="font-size:26px;font-weight:800;flex:1">Savat</h1>
      <button class="btn-ghost" style="font-weight:600;font-size:14px" id="clearCart">Tozalash</button></div>
    <div class="wrap" style="margin-top:8px">
      ${free ? `<div class="freebar">${subtotal >= free ? `🎉 <b>Bepul yetkazib berish</b> sizga tegishli!` : `Bepul yetkazishgacha yana <b class="gold">${money(free - subtotal)}</b>`}
        <div class="track"><span style="width:${Math.min(100, (subtotal / free) * 100)}%"></span></div></div>` : ''}
      ${lines.map((l) => `<div class="citem">
        <a href="#/product/${l.p.id}"><img src="${esc(l.p.images[0])}" alt="" loading="lazy" /></a>
        <div class="cb">
          <div style="display:flex;gap:8px"><div style="flex:1;min-width:0"><div class="cn">${esc(l.p.name)}</div>
            <div class="cs">O'lcham: <b style="color:var(--text)">${esc(l.v.size)}</b> · ${money(l.p.price)}</div></div>
            <button class="rm" data-rm="${l.variant_id}" aria-label="O'chirish">${icon('trash', 'sm')}</button></div>
          ${l.v.stock <= 0 ? `<div class="warn">Bu o'lcham tugadi — o'chirib tashlang</div>` : l.qty > l.v.stock ? `<div class="warn">Omborda faqat ${l.v.stock} dona qoldi</div>` : ''}
          <div class="cf"><span class="cp">${money(l.sum)}</span>
            <div class="stepper"><button data-dq="${l.variant_id}" data-d="-1" ${l.qty <= 1 ? 'disabled' : ''}>${icon('minus', 'sm')}</button><span>${l.qty}</span>
              <button data-dq="${l.variant_id}" data-d="1" ${l.qty >= l.v.stock ? 'disabled' : ''}>${icon('plus', 'sm')}</button></div></div>
        </div></div>`).join('')}

      <div class="card" style="margin-top:16px">
        <div class="rows">
          <div class="row"><span>Mahsulotlar (${lines.reduce((s, l) => s + l.qty, 0)} dona)</span><span>${money(subtotal)}</span></div>
          <div class="row"><span>Yetkazib berish</span><span class="muted">keyingi qadamda</span></div>
          <div class="row total"><span>Jami</span><span>${money(subtotal)}</span></div>
        </div>
      </div>
      <div class="perk" style="margin-top:12px"><span class="pi">${icon('shield')}</span><div><b>Faqat karta orqali to'lov</b><small>Buyurtmadan so'ng Uzcard / Humo / Visa kartaga o'tkazasiz</small></div></div>
    </div>
    <div class="buybar cartbar">
      <div class="bb-price"><small>Jami</small><b>${money(subtotal)}</b></div>
      <a class="btn btn-gold" href="#/checkout"${hasIssue ? ' style="pointer-events:none;opacity:.45"' : ''}>Rasmiylashtirish ${icon('arrow', 'sm')}</a>
    </div>
  </div>`;
  $view.style.paddingBottom = '210px';

  $view.querySelector('#clearCart').onclick = () => {
    if (!confirm('Savatni tozalaysizmi?')) return;
    S.cart = [];
    saveCart();
    vCart();
  };
  $view.onclick = null;
}

function vCheckout() {
  $view.style.paddingBottom = '';
  const lines = cartLines();
  if (!lines.length) return go('#/cart', true);
  const { delivery, regions, payment, shop } = S.data;
  const pr = S.profile;
  const subtotal = lines.reduce((s, l) => s + l.sum, 0);
  const st = {
    method: pr.method === 'pickup' && delivery.pickup_enabled ? 'pickup' : 'delivery',
    region: pr.region || '',
    pay: 'card_transfer',
  };
  const dPrice = () => (st.method === 'pickup' ? 0 : delivery.free_from && subtotal >= delivery.free_from ? 0 : delivery.prices[st.region] ?? null);

  $view.innerHTML = `<div class="page">
    ${pageHead('Rasmiylashtirish')}
    <form id="co" class="wrap" style="margin-top:16px" novalidate>
      <div class="card"><h3>${icon('user', 'sm')} Qabul qiluvchi</h3>
        <label class="field"><span>Ism va familiya</span><input class="input" name="customer_name" autocomplete="name" value="${esc(pr.name || [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' '))}" placeholder="Masalan: Azizbek Karimov" /></label>
        <label class="field" style="margin:0"><span>Telefon raqam</span><input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(pr.phone || '+998 ')}" placeholder="+998 90 123 45 67" /></label>
      </div>

      <div class="card"><h3>${icon('truck', 'sm')} Yetkazib berish</h3>
        ${delivery.pickup_enabled ? `<div class="seg" id="seg">
          <button type="button" data-m="delivery">${icon('truck', 'sm')} Yetkazish</button>
          <button type="button" data-m="pickup">${icon('store', 'sm')} Olib ketish</button></div>` : ''}
        <div id="delFields">
          <label class="field"><span>Viloyat</span><select class="input" name="region"><option value="">Tanlang</option>
            ${regions.map((r) => `<option${st.region === r ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
          <label class="field"><span>Tuman / shahar</span><input class="input" name="district" value="${esc(pr.district || '')}" placeholder="Masalan: Shahrixon tumani" /></label>
          <label class="field" style="margin:0"><span>Manzil</span><input class="input" name="address" value="${esc(pr.address || '')}" placeholder="Ko'cha, uy, mo'ljal" /></label>
          <p class="muted" style="font-size:12.5px;margin:10px 4px 0">${icon('clock', 'xs')} Yetkazish muddati: ${esc(delivery.days)}</p>
        </div>
        <div id="pickFields" class="perk" style="margin:0"><span class="pi">${icon('pin')}</span><div><b>${esc(shop.address)}</b><small>Ish vaqti: ${esc(shop.hours)}</small></div></div>
      </div>

      <div class="card"><h3>${icon('card', 'sm')} To'lov usuli</h3>
        <div class="radio on" data-pay="card_transfer"><span class="rb"></span><div class="rt"><b>Kartaga o'tkazma</b>
          <small>Buyurtmadan so'ng do'kon kartasiga o'tkazib, chekni yuklaysiz</small>
          <div class="paylogos"><span>UZCARD</span><span>HUMO</span><span>VISA</span><span>MASTERCARD</span></div></div></div>
        ${payment.telegram_pay ? `<div class="radio" data-pay="telegram"><span class="rb"></span><div class="rt"><b>Click / Payme orqali</b>
          <small>Telegram ichida kartadan darhol to'lash</small><div class="paylogos"><span>CLICK</span><span>PAYME</span></div></div></div>` : ''}
        <p class="muted" style="font-size:12.5px;margin:12px 4px 0">${icon('shield', 'xs')} Naqd pul qabul qilinmaydi — faqat karta orqali oldindan to'lov.</p>
      </div>

      <div class="card"><h3>${icon('edit', 'sm')} Izoh <small class="muted" style="font-weight:500;font-size:12px">(ixtiyoriy)</small></h3>
        <textarea class="input" name="comment" placeholder="Masalan: qo'ng'iroq qilmasdan oldin yozing">${''}</textarea></div>

      <div class="card"><h3>${icon('receipt', 'sm')} Buyurtma</h3>
        ${lines.map((l) => `<div class="row" style="display:flex;gap:10px;align-items:center;padding:6px 0">
          <img src="${esc(l.p.images[0])}" style="width:42px;height:50px;border-radius:9px;object-fit:cover" alt="" />
          <div style="flex:1;min-width:0;font-size:13.5px"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.p.name)}</div>
          <small class="muted">${esc(l.v.size)} · ${l.qty} dona</small></div><b style="font-size:13.5px">${money(l.sum)}</b></div>`).join('')}
        <div class="rows" style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
          <div class="row"><span>Mahsulotlar</span><span>${money(subtotal)}</span></div>
          <div class="row"><span>Yetkazib berish</span><span id="dRow">—</span></div>
          <div class="row total"><span>Jami to'lov</span><span id="tRow">${money(subtotal)}</span></div>
        </div>
      </div>
      <p class="muted" style="font-size:12px;text-align:center;margin:14px 10px 0">Buyurtma berish orqali siz mahsulotlar ${payment.reserve_hours} soat davomida siz uchun band qilinishiga rozilik bildirasiz.</p>
    </form>
    <div class="buybar"><button class="btn btn-gold btn-block" id="submit" form="co">Buyurtma berish</button></div>
  </div>`;

  const f = document.getElementById('co');
  const btn = document.getElementById('submit');
  const sync = () => {
    document.querySelectorAll('#seg button').forEach((b) => b.classList.toggle('on', b.dataset.m === st.method));
    document.getElementById('delFields').classList.toggle('hidden', st.method !== 'delivery');
    document.getElementById('pickFields').classList.toggle('hidden', st.method !== 'pickup');
    document.querySelectorAll('[data-pay]').forEach((b) => b.classList.toggle('on', b.dataset.pay === st.pay));
    const d = dPrice();
    document.getElementById('dRow').innerHTML = st.method === 'pickup' ? '<span class="gold">Bepul</span>' : d === null ? '<span class="muted">viloyatni tanlang</span>' : d === 0 ? '<span class="gold">Bepul</span>' : money(d);
    const total = subtotal + (d || 0);
    document.getElementById('tRow').textContent = money(total);
    btn.textContent = `Buyurtma berish · ${money(total)}`;
  };
  document.getElementById('seg')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (b) { st.method = b.dataset.m; haptic(); sync(); }
  });
  f.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pay]');
    if (b) { st.pay = b.dataset.pay; haptic(); sync(); }
  });
  f.region.onchange = () => { st.region = f.region.value; f.region.classList.remove('err'); sync(); };
  f.phone.oninput = () => {
    const pos = f.phone.value.length;
    f.phone.value = formatPhone(f.phone.value);
    f.phone.classList.remove('err');
    if (pos >= f.phone.value.length) f.phone.setSelectionRange(f.phone.value.length, f.phone.value.length);
  };
  f.querySelectorAll('.input').forEach((i) => i.addEventListener('input', () => i.classList.remove('err')));
  sync();

  f.onsubmit = async (e) => {
    e.preventDefault();
    const val = Object.fromEntries(new FormData(f));
    const errs = [];
    if (val.customer_name.trim().length < 2) errs.push('customer_name');
    if (!/^\+998\d{9}$/.test(phoneDigits(val.phone))) errs.push('phone');
    if (st.method === 'delivery') {
      if (!val.region) errs.push('region');
      if ((val.address || '').trim().length < 5) errs.push('address');
    }
    f.querySelectorAll('.err').forEach((x) => x.classList.remove('err'));
    if (errs.length) {
      errs.forEach((n) => f[n].classList.add('err'));
      f[errs[0]].scrollIntoView({ behavior: 'smooth', block: 'center' });
      hapticOk('error');
      return toast("Iltimos, maydonlarni to'g'ri to'ldiring", true);
    }
    btn.classList.add('loading');
    try {
      const res = await api('orders', {
        method: 'POST',
        body: {
          items: lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty })),
          customer_name: val.customer_name,
          phone: phoneDigits(val.phone),
          delivery_method: st.method,
          region: val.region,
          district: val.district,
          address: val.address,
          comment: val.comment,
          payment_method: st.pay,
        },
      });
      S.profile = { name: val.customer_name.trim(), phone: val.phone, region: val.region, district: val.district, address: val.address, method: st.method };
      ls.set('cl_profile', S.profile);
      S.cart = [];
      saveCart();
      hapticOk();
      refreshData();
      go('#/order/' + res.order.code + (st.pay === 'telegram' ? '?pay=1' : ''), true);
    } catch (err) {
      btn.classList.remove('loading');
      hapticOk('error');
      toast(err.message, true);
      refreshData();
    }
  };
}

const STEPS = [
  ['new', 'Buyurtma qabul qilindi'],
  ['paid', "To'lov tasdiqlandi"],
  ['packing', "Yig'ilmoqda"],
  ['shipped', "Yo'lda"],
  ['delivered', 'Yetkazildi'],
];
function stepIndex(o) {
  if (o.status === 'delivered') return 4;
  if (o.status === 'shipped') return 3;
  if (o.status === 'packing') return 2;
  if (o.payment_status === 'paid') return 1;
  return 0;
}
function statusPill(o) {
  if (o.status === 'cancelled') return `<span class="pill red">Bekor qilingan</span>`;
  if (o.payment_status === 'awaiting') return `<span class="pill amber">To'lov kutilmoqda</span>`;
  if (o.payment_status === 'review') return `<span class="pill gold">Chek tekshirilmoqda</span>`;
  if (o.payment_status === 'rejected') return `<span class="pill red">Chek rad etildi</span>`;
  if (o.status === 'delivered') return `<span class="pill green">Yetkazildi</span>`;
  return `<span class="pill green">${esc(o.status_text)}</span>`;
}

let orderTimer;
async function vOrder(r) {
  clearInterval(orderTimer);
  const code = r.arg;
  $view.innerHTML = pageHead('Buyurtma') + `<div class="wrap" style="margin-top:20px"><div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:220px;margin-top:12px"></div></div>`;
  let res;
  try {
    res = await api('orders/' + encodeURIComponent(code));
  } catch (e) {
    $view.innerHTML = pageHead('Buyurtma') + emptyState('receipt', 'Buyurtma topilmadi', esc(e.message), `<a class="btn btn-dark" href="#/orders">Buyurtmalarim</a>`);
    return;
  }
  if (parseHash().arg !== code) return;
  const { order: o, payment } = res;
  const needPay = o.status !== 'cancelled' && ['awaiting', 'rejected'].includes(o.payment_status);
  const deadline = new Date(o.created_at).getTime() + payment.reserve_hours * 3600e3;
  const idx = stepIndex(o);

  let hero;
  if (o.status === 'cancelled') hero = `<div class="sh-ic bad">${icon('x')}</div><h2>Buyurtma bekor qilindi</h2><p>${esc(o.code)}</p>`;
  else if (needPay) hero = `<div class="sh-ic">${icon('card')}</div><h2>${o.payment_status === 'rejected' ? 'Chek tasdiqlanmadi' : "To'lovni amalga oshiring"}</h2>
    <p>Buyurtma <b style="color:var(--text)">${esc(o.code)}</b> · to'lov summasi</p><div class="amount">${money(o.total)}</div>
    ${payment.reserve_hours ? `<div class="timer" id="timer">${icon('clock', 'xs')} <span></span></div>` : ''}`;
  else if (o.payment_status === 'review') hero = `<div class="sh-ic">${icon('clock')}</div><h2>Chek tekshirilmoqda</h2><p>Admin to'lovni tez orada tasdiqlaydi. Xabarnoma Telegram orqali keladi.</p>`;
  else hero = `<div class="sh-ic ok">${icon('check')}</div><h2>${o.status === 'delivered' ? 'Yetkazildi — rahmat!' : "To'lov qabul qilindi"}</h2><p>Buyurtma ${esc(o.code)} · ${money(o.total)}</p>`;

  const cards = payment.cards.length
    ? payment.cards.map((c) => `<div class="bankcard">
        <div class="bc-top"><span class="bc-brand">CLIMBER</span><span class="bc-type">${esc(c.type.toUpperCase())}</span></div>
        <div class="chip-ic"></div>
        <div class="bc-num"><span>${esc(c.number)}</span><button class="copy" data-copy="${esc(c.number.replace(/\s/g, ''))}" aria-label="Nusxa olish">${icon('copy', 'sm')}</button></div>
        <div class="bc-holder">${esc(c.holder)}</div></div>`).join('')
    : `<div class="perk"><span class="pi">${icon('info')}</span><div><b>Karta ma'lumotlari tez orada yuboriladi</b><small>Admin siz bilan Telegram yoki telefon orqali bog'lanadi</small></div></div>`;

  $view.innerHTML = `<div class="page">
    ${pageHead('Buyurtma ' + o.code)}
    <div class="status-hero">${hero}</div>
    <div class="wrap" style="margin-top:14px">
      ${needPay ? `
        ${payment.telegram_pay ? `<button class="btn btn-gold btn-block" id="tgPay" style="margin-bottom:14px">${icon('card', 'sm')} Click / Payme orqali to'lash</button>
          <div class="muted" style="text-align:center;font-size:12.5px;margin:-4px 0 14px">yoki kartaga o'tkazing</div>` : ''}
        ${cards}
        <div class="card" style="margin-top:12px"><h3>${icon('info', 'sm')} Qanday to'lanadi?</h3>
          <ol class="steps">
            <li><span>Bank ilovangizni oching (Click, Payme, Uzum, bank ilovasi)</span></li>
            <li><span>Yuqoridagi kartaga aynan <b class="gold">${money(o.total)}</b> o'tkazing</span></li>
            <li><span>To'lov chekining skrinshotini quyida yuklang</span></li>
          </ol>
          ${payment.note ? `<p class="muted" style="font-size:12.5px;margin:12px 0 0">${esc(payment.note)}</p>` : ''}
        </div>
        <label class="upload" style="margin-top:12px" id="upl">${icon('camera')}<b>Chekni yuklash</b><small>JPG yoki PNG skrinshot</small>
          <input type="file" accept="image/*" hidden id="rcpt" /></label>
      ` : ''}

      ${o.status !== 'cancelled' ? `<div class="card" style="margin-top:12px"><h3>${icon('box', 'sm')} Holat</h3><div class="timeline">
        ${STEPS.map(([, t], i) => `<div class="tl ${i < idx || (i === idx && i === 4) ? 'done' : i === idx ? 'now' : ''}"><span class="tl-dot">${i < idx || (i === 4 && idx === 4) ? icon('check', 'xs') : ''}</span>
          <div><b>${t}</b>${i === 0 ? `<small>${fmtDate(o.created_at)}</small>` : i === 3 && o.tracking ? `<small>Trek: ${esc(o.tracking)}</small>` : ''}</div></div>`).join('')}
      </div></div>` : ''}

      <div class="card"><h3>${icon('receipt', 'sm')} Tarkibi</h3>
        ${o.items.map((it) => `<a href="#/product/${it.product_id}" style="display:flex;gap:10px;align-items:center;padding:6px 0">
          <img src="${esc(it.image || '/img/brand/logo_512.png')}" style="width:42px;height:50px;border-radius:9px;object-fit:cover" alt="" />
          <div style="flex:1;min-width:0;font-size:13.5px"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.name)}</div>
          <small class="muted">${esc(it.size)} · ${it.qty} dona</small></div><b style="font-size:13.5px">${money(it.price * it.qty)}</b></a>`).join('')}
        <div class="rows" style="margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
          <div class="row"><span>Mahsulotlar</span><span>${money(o.subtotal)}</span></div>
          <div class="row"><span>Yetkazib berish</span><span>${o.delivery_price ? money(o.delivery_price) : 'Bepul'}</span></div>
          <div class="row total"><span>Jami</span><span>${money(o.total)}</span></div>
        </div>
      </div>
      <div class="card"><h3>${icon(o.delivery_method === 'pickup' ? 'store' : 'pin', 'sm')} ${o.delivery_method === 'pickup' ? "Do'kondan olib ketish" : 'Yetkazish manzili'}</h3>
        <div style="font-size:14px">${o.delivery_method === 'pickup' ? esc(S.data.shop.address) : esc([o.region, o.district, o.address].filter(Boolean).join(', '))}</div>
        <div class="muted" style="font-size:13px;margin-top:4px">${esc(o.customer_name)} · ${esc(o.phone)}</div></div>
      <button class="btn btn-dark btn-block" style="margin-top:12px" id="helpBtn">${icon('send', 'sm')} Admin bilan bog'lanish</button>
    </div>
  </div>`;

  const timer = document.getElementById('timer');
  if (timer) {
    const tick = () => {
      const left = deadline - Date.now();
      if (left <= 0) { timer.querySelector('span').textContent = "Bron muddati tugadi"; return clearInterval(orderTimer); }
      const h = Math.floor(left / 3600e3), m = Math.floor((left % 3600e3) / 60e3), s = Math.floor((left % 60e3) / 1e3);
      timer.querySelector('span').textContent = `Mahsulotlar band qilingan: ${h ? h + ' soat ' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    tick();
    orderTimer = setInterval(() => (document.body.contains(timer) ? tick() : clearInterval(orderTimer)), 1000);
  }

  document.getElementById('helpBtn').onclick = () =>
    openLink(`https://t.me/${S.data.shop.admin_telegram}?text=${encodeURIComponent(`Assalomu alaykum! Buyurtma ${o.code} bo'yicha savolim bor.`)}`);

  const inp = document.getElementById('rcpt');
  if (inp) inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    const upl = document.getElementById('upl');
    upl.innerHTML = `<span class="btn loading btn-ghost" style="height:auto"></span><b>Yuklanmoqda...</b>`;
    try {
      const image = await compressImage(file);
      await api(`orders/${encodeURIComponent(o.code)}/receipt`, { method: 'POST', body: { image } });
      hapticOk();
      toast('Chek yuborildi! Admin tekshirmoqda');
      loadOrders();
      vOrder(r);
    } catch (e) {
      toast(e.message, true);
      vOrder(r);
    }
  };

  const payBtn = document.getElementById('tgPay');
  const startTgPay = async () => {
    try {
      payBtn?.classList.add('loading');
      const { url } = await api(`orders/${encodeURIComponent(o.code)}/invoice`, { method: 'POST' });
      if (tg?.openInvoice) {
        tg.openInvoice(url, (status) => {
          payBtn?.classList.remove('loading');
          if (status === 'paid') { hapticOk(); toast("To'lov qabul qilindi!"); setTimeout(() => vOrder(r), 1500); }
          else if (status === 'failed') toast("To'lov amalga oshmadi", true);
        });
      } else openLink(url);
    } catch (e) {
      payBtn?.classList.remove('loading');
      toast(e.message, true);
    }
  };
  if (payBtn) payBtn.onclick = startTgPay;
  if (payBtn && r.q.get('pay') === '1') { history.replaceState(null, '', '#/order/' + o.code); startTgPay(); }
}

async function loadOrders() {
  try {
    S.orders = await api('orders/my');
  } catch {
    S.orders = [];
  }
  return S.orders;
}

async function vOrders() {
  $view.innerHTML = pageHead('Buyurtmalarim') + `<div class="wrap" style="margin-top:16px"><div class="skeleton" style="height:150px"></div><div class="skeleton" style="height:150px;margin-top:10px"></div></div>`;
  const list = await loadOrders();
  if (parseHash().name !== 'orders') return;
  $view.innerHTML = `<div class="page">${pageHead('Buyurtmalarim')}
    ${list.length ? `<div class="wrap" style="margin-top:16px">${list.map((o) => `<a class="ocard" href="#/order/${esc(o.code)}">
      <div class="oh"><div><div class="oc">${esc(o.code)}</div><div class="od">${fmtDate(o.created_at)}</div></div>${statusPill(o)}</div>
      <div class="othumbs">${o.items.slice(0, 5).map((i) => `<img src="${esc(i.image || '/img/brand/logo_512.png')}" alt="" loading="lazy" />`).join('')}
        ${o.items.length > 5 ? `<span class="pill" style="height:54px;width:46px;justify-content:center;border-radius:10px">+${o.items.length - 5}</span>` : ''}</div>
      <div class="of"><span class="muted" style="font-size:13px">${o.items.reduce((s, i) => s + i.qty, 0)} dona · ${o.delivery_method === 'pickup' ? 'Olib ketish' : esc(o.region)}</span><b>${money(o.total)}</b></div>
    </a>`).join('')}</div>` : emptyState('receipt', "Hali buyurtmalar yo'q", "Birinchi xaridingizni qiling — u shu yerda ko'rinadi", `<a class="btn btn-gold" href="#/catalog">Katalogni ochish</a>`)}
  </div>`;
}

function vFavorites() {
  const list = [...S.favs].map((id) => S.byId.get(id)).filter(Boolean);
  $view.innerHTML = `<div class="page"><div class="topbar"><h1 style="font-size:26px;font-weight:800;flex:1">Sevimlilar</h1>
    ${list.length ? `<span class="muted" style="font-size:13px">${list.length} ta</span>` : ''}</div>
    ${list.length ? `<div class="grid" style="margin-top:10px">${list.map(productCard).join('')}</div>` : emptyState('heart', "Sevimlilar bo'sh", "Mahsulotlardagi ♡ belgisini bosing — ular shu yerda saqlanadi", `<a class="btn btn-gold" href="#/catalog">Mahsulotlarni ko'rish</a>`)}
  </div>`;
}

function vProfile() {
  const s = S.data.shop;
  const name = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ') || S.profile.name || 'Mehmon';
  const initials = name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  const paid = S.orders.filter((o) => o.payment_status === 'paid');
  const mapUrl = `https://yandex.uz/maps/?pt=${s.lng},${s.lat}&z=17&l=map`;
  const mi = (ic, title, sub, attrs) => `<button class="mi" ${attrs}><span class="mic">${icon(ic, 'sm')}</span><span class="mt"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${icon('chev', 'sm')}</button>`;

  $view.innerHTML = `<div class="page">
    <div class="topbar"><h1 style="font-size:26px;font-weight:800">Profil</h1></div>
    <div class="profile-hero">
      <div class="avatar">${tgUser?.photo_url ? `<img src="${esc(tgUser.photo_url)}" alt="" />` : esc(initials)}</div>
      <div style="min-width:0"><h2>${esc(name)}</h2><small>${tgUser?.username ? '@' + esc(tgUser.username) : esc(S.profile.phone || 'CLIMBER mijozi')}</small></div>
    </div>
    <div class="stats">
      <div><b>${S.orders.filter((o) => o.status !== 'cancelled').length}</b><small>Buyurtma</small></div>
      <div><b>${S.favs.size}</b><small>Sevimli</small></div>
      <div><b>${paid.reduce((n, o) => n + o.items.reduce((s2, i) => s2 + i.qty, 0), 0)}</b><small>Xarid</small></div>
    </div>

    <div class="menu-title">Xaridlar</div>
    <div class="menu">
      ${mi('receipt', 'Buyurtmalarim', S.orders.length ? `Oxirgisi: ${esc(S.orders[0].code)} · ${esc(S.orders[0].payment_text)}` : "Hali buyurtma yo'q", 'data-go="#/orders"')}
      ${mi('heart', 'Sevimlilar', `${S.favs.size} ta mahsulot`, 'data-go="#/favorites"')}
      ${mi('pin', 'Yetkazish manzilim', S.profile.address ? esc([S.profile.region, S.profile.address].filter(Boolean).join(', ')) : 'Birinchi buyurtmada saqlanadi', 'data-info="address"')}
    </div>

    <div class="menu-title">Do'kon</div>
    <div class="menu">
      ${s.phones.map((p) => mi('phone', esc(p), 'Qo\'ng\'iroq qilish', `data-tel="${esc(p.replace(/\s/g, ''))}"`)).join('')}
      ${mi('send', 'Admin bilan yozishish', '@' + esc(s.admin_telegram), `data-link="https://t.me/${esc(s.admin_telegram)}"`)}
      ${mi('send', 'Telegram kanal', 'Yangi kolleksiyalar va aksiyalar', `data-link="${esc(s.channel)}"`)}
      ${mi('insta', 'Instagram', '@climber_shahrixon', `data-link="${esc(s.instagram)}"`)}
      ${mi('pin', 'Do\'kon manzili', esc(s.address), `data-link="${esc(mapUrl)}"`)}
      ${mi('clock', 'Ish vaqti', esc(s.hours) + ' · har kuni', '')}
    </div>

    <div class="menu-title">Ma'lumot</div>
    <div class="menu">
      ${mi('truck', 'Yetkazib berish', `O'zbekiston bo'ylab · ${esc(S.data.delivery.days)}`, 'data-info="delivery"')}
      ${mi('card', "To'lov", 'Faqat karta: Uzcard, Humo, Visa', 'data-info="payment"')}
    </div>
    ${footer()}
  </div>`;
}

function infoSheet(kind) {
  const { delivery, payment } = S.data;
  if (kind === 'address') {
    const p = S.profile;
    const m = sheet(`<h3>Saqlangan manzil</h3>
      ${p.address ? `<div class="card"><b>${esc(p.name || '')}</b><div class="muted" style="font-size:13.5px;margin-top:4px">${esc(p.phone || '')}</div>
        <div style="margin-top:8px;font-size:14px">${esc([p.region, p.district, p.address].filter(Boolean).join(', '))}</div></div>
        <button class="btn btn-dark btn-block" style="margin-top:12px" id="forget">${icon('trash', 'sm')} Manzilni o'chirish</button>`
        : `<p class="muted">Manzil birinchi buyurtmani rasmiylashtirganingizda avtomatik saqlanadi.</p>`}`);
    m.el.querySelector('#forget')?.addEventListener('click', () => { S.profile = {}; ls.set('cl_profile', {}); m.close(); vProfile(); });
    return;
  }
  if (kind === 'delivery') {
    const rows = Object.entries(delivery.prices).sort((a, b) => a[1] - b[1]);
    sheet(`<h3>Yetkazib berish narxlari</h3>
      ${delivery.free_from ? `<div class="freebar">${money(delivery.free_from)} dan yuqori buyurtmalarga — <b>bepul</b></div>` : ''}
      <div class="rows">${rows.map(([r, p]) => `<div class="row"><span>${esc(r)}</span><span>${p ? money(p) : 'Bepul'}</span></div>`).join('')}
      ${delivery.pickup_enabled ? `<div class="row"><span>Do'kondan olib ketish</span><span class="gold">Bepul</span></div>` : ''}</div>
      <p class="muted" style="font-size:13px">Muddat: ${esc(delivery.days)}</p>`);
  } else {
    sheet(`<h3>To'lov qanday amalga oshiriladi?</h3>
      <ol class="steps"><li><span>Savatni rasmiylashtiring — mahsulotlar ${payment.reserve_hours} soat siz uchun band qilinadi</span></li>
      <li><span>Ko'rsatilgan Uzcard / Humo / Visa kartaga summani o'tkazing</span></li>
      <li><span>To'lov chekini ilovaga yuklang — admin tasdiqlaydi va buyurtma yo'lga chiqadi</span></li></ol>
      <p class="muted" style="font-size:13px;margin-top:16px">Naqd pul va yetkazilganda to'lov qabul qilinmaydi.</p>`);
  }
}

/* ================= Global hodisalar ================= */
document.addEventListener('click', async (e) => {
  const t = e.target;
  const fav = t.closest('[data-fav]');
  if (fav) {
    e.preventDefault();
    e.stopPropagation();
    const id = Number(fav.dataset.fav);
    S.favs.has(id) ? S.favs.delete(id) : S.favs.add(id);
    saveFavs();
    haptic('medium');
    document.querySelectorAll(`[data-fav="${id}"]`).forEach((b) => b.classList.toggle('on', S.favs.has(id)));
    if (parseHash().name === 'favorites') vFavorites();
    return;
  }
  if (t.closest('[data-back]')) return goBack();
  const g = t.closest('[data-go]');
  if (g) return go(g.dataset.go);
  const l = t.closest('[data-link]');
  if (l) return openLink(l.dataset.link);
  const tel = t.closest('[data-tel]');
  if (tel) return (location.href = 'tel:' + tel.dataset.tel);
  const info = t.closest('[data-info]');
  if (info) return infoSheet(info.dataset.info);
  const ask = t.closest('[data-ask]');
  if (ask) return askAdmin(S.byId.get(Number(ask.dataset.ask)));
  const cp = t.closest('[data-copy]');
  if (cp) {
    try {
      await navigator.clipboard.writeText(cp.dataset.copy);
    } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: cp.dataset.copy });
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    hapticOk();
    return toast('Karta raqami nusxalandi');
  }
  const rm = t.closest('[data-rm]');
  if (rm) {
    S.cart = S.cart.filter((c) => c.variant_id !== Number(rm.dataset.rm));
    saveCart();
    haptic('medium');
    return vCart();
  }
  const dq = t.closest('[data-dq]');
  if (dq) {
    const c = S.cart.find((x) => x.variant_id === Number(dq.dataset.dq));
    const v = S.variantById.get(c?.variant_id);
    if (!c || !v) return;
    c.qty = Math.max(1, Math.min(v.stock, c.qty + Number(dq.dataset.d)));
    saveCart();
    haptic();
    return vCart();
  }
});

window.addEventListener('hashchange', () => {
  $view.style.paddingBottom = '';
  router();
});

function indexData(d) {
  S.data = d;
  S.byId = new Map(d.products.map((p) => [p.id, p]));
  S.variantById = new Map(d.products.flatMap((p) => p.variants.map((v) => [v.id, v])));
}
async function refreshData() {
  try {
    indexData(await api('bootstrap'));
  } catch {}
}

async function boot() {
  // Keshdagi katalog darhol ko'rsatiladi, yangisi fonda yuklanadi
  const cached = ls.get('cl_boot', null);
  const fresh = api('bootstrap').then((d) => {
    ls.set('cl_boot', d);
    return d;
  });
  try {
    if (cached?.products) {
      indexData(cached);
      fresh.then((d) => {
        indexData(d);
        if (['', 'catalog', 'favorites', 'cart'].includes(parseHash().name) && !document.querySelector('.sheet')) router();
      }).catch(() => {});
    } else indexData(await fresh);
  } catch (e) {
    $view.innerHTML = emptyState('refresh', "Ulanishda xatolik", esc(e.message), `<button class="btn btn-gold" onclick="location.reload()">Qayta urinish</button>`);
    document.getElementById('splash').classList.add('out');
    return;
  }
  const start = tg?.initDataUnsafe?.start_param;
  if (start && !location.hash) {
    if (/^p\d+$/.test(start)) location.hash = '#/product/' + start.slice(1);
    else if (/^CL-\d+$/.test(start)) location.hash = '#/order/' + start;
  }
  router();
  document.getElementById('splash').classList.add('out');
  loadOrders().then((list) => {
    const n = parseHash().name;
    if (n === 'profile' || (n === '' && list.some((o) => o.payment_status === 'awaiting' && o.status === 'new'))) router();
  });
}
boot();
