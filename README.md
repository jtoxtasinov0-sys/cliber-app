# CLIMBER — Telegram Mini App do'kon

Erkaklar kiyim do'koni **CLIMBER (By Sabirov's · Since 2009)** uchun Telegram Mini App va admin panel.
O'zbekiston bo'ylab yetkazib berish, **faqat karta orqali to'lov** (Uzcard / Humo / Visa / Mastercard), omborni boshqarish.

## Imkoniyatlar

**Mini app** (`/`)
- Bosh sahifa: maxsus takliflar karuseli, kategoriyalar, eng ko'p sotilganlar, yangi kolleksiya
- Katalog: qidiruv, kategoriya, saralash, "faqat mavjud" filtri
- Mahsulot: rasm galereyasi, o'lcham tanlash (ombor qoldig'i bo'yicha), "kam qoldi" ogohlantirishi
- Savat, sevimlilar, buyurtmalar tarixi va holati (timeline)
- Rasmiylashtirish: 14 ta viloyat bo'yicha yetkazish narxi yoki do'kondan olib ketish
- To'lov: do'kon kartasiga o'tkazma + chek skrinshotini yuklash; ixtiyoriy ravishda Click/Payme (Telegram Payments)
- Buyurtma berilganda mahsulot omborda band qilinadi; to'lanmasa bron muddati o'tgach avtomatik bekor bo'ladi

**Admin panel** (`/admin`)
- Bosh panel: tushum, buyurtmalar, tekshiruvdagi cheklar, ombor qiymati, 14 kunlik grafik, kam qolganlar, top mahsulotlar
- Buyurtmalar: chekni ko'rish, to'lovni tasdiqlash / rad etish, holat (yig'ilmoqda → yo'lda → yetkazildi), trek raqam, bekor qilish (mahsulot omborga qaytadi), CSV
- Mahsulotlar: qo'shish/tahrirlash, rasm yuklash, o'lchamlar (SKU, tannarx, min. qoldiq), chegirma narxi
- **Ombor**: qoldiqlar jadvali, kirim (yetkazuvchi, tannarx), chiqim (brak/yo'qotish), inventarizatsiya, har bir pozitsiya tarixi, sotuv/tannarx qiymati, 30 kunlik sotuv, CSV
- Kategoriyalar, bannerlar, mijozlar, sozlamalar (to'lov kartalari, yetkazish narxlari, do'kon ma'lumotlari, Telegram bot)

## Vercel'ga joylash

1. Vercel → **Add New → Project** → `cliber-app` reposini import qiling (Framework: **Other**).
2. **Environment Variables**:

| Nomi | Majburiy | Tavsif |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon PostgreSQL ulanish satri |
| `ADMIN_PASSWORD` | ✅ | Admin panel paroli |
| `AUTH_SECRET` | ✅ | Uzun tasodifiy satr (token imzosi) |
| `BOT_TOKEN` | tavsiya | @BotFather bergan token — xabarnomalar va foydalanuvchini tekshirish |
| `ADMIN_CHAT_ID` | tavsiya | Buyurtma xabarlari keladigan chat ID (bir nechta bo'lsa vergul bilan) |
| `PAYMENT_PROVIDER_TOKEN` | ixtiyoriy | BotFather → Payments → Click yoki Payme tokeni |

3. Deploy qiling. So'ng admin panel → **Sozlamalar** → to'lov kartalarini kiriting va **Webhook o'rnatish** tugmasini bosing.
4. @BotFather → `/mybots` → bot → **Bot Settings → Configure Mini App** → Vercel manzilini kiriting.

## Render.com'ga joylash (muqobil)

1. render.com → **New → Web Service** → GitHub'dan `cliber-app` reposini tanlang.
2. Maydonlar: **Language** `Node`, **Branch** `main`, **Build Command** `npm install`, **Start Command** `npm start`, **Instance Type** `Free`.
3. **Environment Variables** — yuqoridagi jadvaldagi qiymatlar (`DATABASE_URL`, `ADMIN_PASSWORD`, `AUTH_SECRET`, `BOT_TOKEN`, `ADMIN_CHAT_ID`).
4. **Deploy Web Service** → `https://<nom>.onrender.com/admin` → Sozlamalar → **Webhook o'rnatish** (bot Render manziliga o'tadi).
5. BotFather'da Mini App manzilini Render manziliga almashtiring.

> Bepul Render 15 daqiqa ishlatilmasa uxlaydi — birinchi ochilish ~50 soniya. Vercel'da bunday kechikish yo'q.

## Mahsulotlar tartibi

Admin → **Mahsulotlar** jadvalidagi **Tartib** ustuniga raqam yozing va Enter bosing: kichik raqam ilovada birinchi chiqadi
(masalan 1, 2, 3... yoki 10, 20, 30 — orasiga keyin mahsulot qo'shish oson). Kategoriyalar tartibi — **Kategoriyalar** bo'limida.

## Lokal ishga tushirish

```bash
npm install
cp .env.example .env   # qiymatlarni to'ldiring
npm run db:setup       # jadvallar + boshlang'ich ma'lumotlar
npm run dev            # http://localhost:3000 va /admin
```

## Tuzilma

```
api/main.js          — yagona API kirish nuqtasi (Vercel function)
lib/                 — baza, buyurtma/ombor mantiqi, admin va public yo'llar
public/              — mini app (index.html, css/, js/) va admin panel (admin/)
scripts/setup-db.mjs — sxema va seed (data/seed.json)
```

> Eslatma: boshlang'ich ombor qoldiqlari va yetkazish narxlari **namuna** — admin panelda haqiqiy qiymatlarga o'zgartiring. 9 ta mahsulot narxsiz ("narxi so'rov bo'yicha") — narxini kiritsangiz savatga qo'shish ochiladi.
