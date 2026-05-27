export const TIMEZONE = "Asia/Tashkent";
export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

export const ALLOWED_TRANSACTION_CATEGORIES = [
  "food",
  "transport",
  "education",
  "shopping",
  "health",
  "entertainment",
  "salary",
  "freelance",
  "business",
  "gift",
  "other",
];

export const CATEGORY_LABELS = {
  food: "ovqat",
  transport: "transport",
  education: "ta'lim",
  shopping: "xarid",
  health: "sog'liq",
  entertainment: "dam olish",
  salary: "oylik",
  freelance: "freelance",
  business: "biznes",
  gift: "sovg'a",
  other: "boshqa",
};

export const CATEGORY_KEYWORDS = {
  food: ["ovqat", "tushlik", "nonushta", "kechki ovqat", "kafe", "restoran"],
  transport: ["taksi", "taxi", "yo'l", "yol", "yo'l kira", "yol kira", "avtobus", "metro", "benzin"],
  education: ["kitob", "kurs", "dars", "o'qish", "oqish", "ta'lim", "talim"],
  health: ["dori", "apteka", "shifokor", "klinika"],
  shopping: ["kiyim", "bozor", "magazin", "xarid"],
  entertainment: ["kino", "o'yin", "oyin", "dam olish"],
  salary: ["oylik", "maosh"],
  business: ["daromad", "foyda", "savdo"],
  freelance: ["zakaz", "freelance", "loyiha uchun pul"],
  gift: ["sovg'a", "sovga", "hadya"],
};

export const EXPENSE_KEYWORDS = [
  "sarfladim",
  "ketdi",
  "to'ladim",
  "to'lov",
  "toladim",
  "berdim",
  "xarajat",
  "sotib oldim",
  "spent",
  "paid",
  "bought",
];

export const INCOME_KEYWORDS = [
  "kirim",
  "daromad",
  "foyda",
  "oylik oldim",
  "maosh oldim",
  "pul keldi",
  "topdim",
  "ishladim",
];

export const BOT_MESSAGES = {
  inviteRequired:
    "👋 Assalomu alaykum!\n\nDastyorBot'dan foydalanish uchun invite code kerak.\n\nMasalan:\n/start DASTYOR2026",
  notAllowed:
    "⛔ Sizga hali ruxsat berilmagan.\n\nInvite code bilan kiring:\n/start DASTYOR2026",
  alreadyRegistered:
    "✅ Siz allaqachon ro'yxatdan o'tgansiz.\n\nXarajat, kirim, vazifa yoki eslatma yozishingiz mumkin.",
  welcome:
    "✅ Xush kelibsiz! Endi DastyorBot'dan foydalanishingiz mumkin.\n\nMisollar:\n• Bugun 35 ming taksiga sarfladim\n• Bugun 200 ming kirim bo'ldi\n• Bugun 20:00 da dars qilishim kerak",
  parsing: "⏳ Tushundim, tahlil qilyapman...",
  unknown:
    "🤔 Xabaringizni to'liq tushunmadim. Boshqacharoq yozib ko'ring.\n\nMasalan: Bugun 35 ming taksiga sarfladim",
  saveError: "❌ Saqlashda xatolik bo'ldi. Qaytadan urinib ko'ring.",
  unsupportedMessage: "Hozircha faqat matn va ovozli xabarlarni tushunaman.",
};
