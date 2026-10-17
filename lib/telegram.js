const api = (method) => `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`;

export const botEnabled = () => Boolean(process.env.BOT_TOKEN);

export async function tg(method, body) {
  if (!botEnabled()) return null;
  try {
    const r = await fetch(api(method), body instanceof FormData ? { method: 'POST', body } : {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.ok) console.error('Telegram', method, j.description);
    return j;
  } catch (e) {
    console.error('Telegram', method, e.message);
    return null;
  }
}

const adminChats = () => (process.env.ADMIN_CHAT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);

export async function notifyAdmins(text, extra = {}) {
  await Promise.all(adminChats().map((chat_id) => tg('sendMessage', { chat_id, text, parse_mode: 'HTML', ...extra })));
}

export async function sendPhotoToAdmins(buffer, mime, caption) {
  if (!botEnabled()) return;
  await Promise.all(
    adminChats().map(async (chat_id) => {
      const fd = new FormData();
      fd.append('chat_id', chat_id);
      fd.append('caption', caption);
      fd.append('parse_mode', 'HTML');
      fd.append('photo', new Blob([buffer], { type: mime }), 'chek.jpg');
      try {
        await fetch(api('sendPhoto'), { method: 'POST', body: fd });
      } catch (e) {
        console.error('Telegram sendPhoto', e.message);
      }
    })
  );
}

export const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
export const money = (n) => `${Number(n || 0).toLocaleString('ru-RU').replace(/,/g, ' ')} so'm`;
