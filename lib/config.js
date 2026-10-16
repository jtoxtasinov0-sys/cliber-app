export const REGIONS = [
  "Toshkent shahri",
  "Toshkent viloyati",
  "Andijon viloyati",
  "Farg'ona viloyati",
  "Namangan viloyati",
  "Samarqand viloyati",
  "Buxoro viloyati",
  "Navoiy viloyati",
  "Qashqadaryo viloyati",
  "Surxondaryo viloyati",
  "Jizzax viloyati",
  "Sirdaryo viloyati",
  "Xorazm viloyati",
  "Qoraqalpog'iston Respublikasi",
];

export const ORDER_STATUSES = {
  new: 'Yangi',
  confirmed: 'Tasdiqlandi',
  packing: "Yig'ilmoqda",
  shipped: "Yo'lda",
  delivered: 'Yetkazildi',
  cancelled: 'Bekor qilindi',
};

export const PAYMENT_STATUSES = {
  awaiting: "To'lov kutilmoqda",
  review: 'Chek tekshirilmoqda',
  paid: "To'landi",
  rejected: 'Chek rad etildi',
  refunded: 'Qaytarildi',
};

// Admin "Sozlamalar" bo'limida o'zgartiriladi. Narxlar boshlang'ich — tekshirib chiqing.
export const DEFAULT_SETTINGS = {
  shop: {
    name: 'CLIMBER',
    tagline: "Siz eng yaxshisiga loyiqsiz",
    since: 2009,
    phones: ['+998 93 253 23 00', '+998 94 384 83 83'],
    admin_telegram: 'sabiirovs',
    channel: 'https://t.me/climbershahrixon',
    instagram: 'https://www.instagram.com/climber_shahrixon/',
    address: "Shahrixon, Xamza ko'chasi — Hamkor bank yonida",
    lat: 40.709625,
    lng: 72.057649,
    hours: '08:00 — 00:00',
  },
  payment: {
    cards: [
      // { type: 'Uzcard' | 'Humo' | 'Visa' | 'Mastercard', number: '8600 ....', holder: 'F.I.Sh' }
    ],
    reserve_hours: 24,
    note: "To'lovni amalga oshirgach, chek skrinshotini yuklang. Admin 15 daqiqa ichida tasdiqlaydi.",
  },
  delivery: {
    pickup_enabled: true,
    free_from: null,
    days: '1–3 kun',
    prices: Object.fromEntries(REGIONS.map((r) => [r, r === 'Andijon viloyati' ? 25000 : 40000])),
  },
};
