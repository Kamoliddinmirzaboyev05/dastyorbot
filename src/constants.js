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
  food: ["ovqat", "tushlik", "nonushta", "kechki ovqat", "kafe", "restoran", "food", "lunch", "breakfast", "dinner", "coffee", "cafe", "restaurant", "meal", "burger"],
  transport: ["taksi", "taxi", "cab", "uber", "yandex", "yo'l", "yol", "yo'l kira", "yol kira", "avtobus", "bus", "metro", "subway", "train", "fuel", "gas", "petrol", "benzin"],
  education: ["kitob", "book", "books", "kurs", "course", "class", "lesson", "dars", "o'qish", "oqish", "study", "school", "university", "ta'lim", "talim", "education"],
  health: ["dori", "medicine", "pharmacy", "apteka", "doctor", "shifokor", "clinic", "klinika", "hospital", "health"],
  shopping: ["kiyim", "clothes", "bozor", "market", "magazin", "shop", "shopping", "xarid", "purchase"],
  entertainment: ["kino", "movie", "cinema", "game", "games", "o'yin", "oyin", "dam olish", "entertainment", "netflix"],
  salary: ["oylik", "maosh", "salary", "paycheck", "wage"],
  business: ["daromad", "income", "revenue", "profit", "foyda", "savdo", "business", "sales"],
  freelance: ["zakaz", "order", "client", "freelance", "project payment", "loyiha uchun pul"],
  gift: ["sovg'a", "sovga", "hadya", "gift", "present"],
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
  "purchased",
  "cost",
  "cost me",
  "used",
  "gave",
];

export const INCOME_KEYWORDS = [
  "kirim",
  "daromad",
  "foyda",
  "oylik oldim",
  "maosh oldim",
  "pul keldi",
  "keldi",
  "topdim",
  "ishladim",
  "salary",
  "got paid",
  "received",
  "earned",
  "made",
  "income",
  "profit",
  "came in",
];

export const HELP_TEXT = `❓ DastyorBot yordam

Ma'lumot qo'shish matn orqali ishlaydi.

💸 Chiqim:
Bugun 35 ming taksiga sarfladim

💵 Kirim:
1 mln oylik oldim

✅ Reja:
reja bugun reading tugatishim kerak

🔔 Eslatma:
eslatma bugun 15:00 da kursga ketishim kerak

📝 Qayd:
qayd Ali bilan loyiha narxi 2 mln

📊 Hisobot:
bugungi hisobot
haftalik hisobot
oylik hisobot

🎙 Ovozli xabar ingliz tilida ishlaydi.`;

export const MENU_HELP_TEXT = `❓ DastyorBot yordam

Ma'lumot qo'shish faqat matn orqali ishlaydi:

💸 Chiqim:
Bugun 35 ming taksiga sarfladim

💵 Kirim:
1 mln oylik oldim

✅ Reja:
reja bugun reading tugatishim kerak

🔔 Eslatma:
eslatma bugun 15:00 da kursga ketishim kerak

📝 Qayd:
qayd Ali bilan loyiha narxi 2 mln

📊 Hisobot:
bugungi hisobot
haftalik hisobot
oylik hisobot

Buttonlar ko'rish, tahrirlash va o'chirish uchun ishlaydi.`;

export const BOT_MESSAGES = {
  inviteRequired:
    "👋 Assalomu alaykum!\n\nDastyorBot'dan foydalanish uchun invite code kerak.\n\nMasalan:\n/start DASTYOR2026",
  notAllowed:
    "⛔ Sizga hali ruxsat berilmagan.\n\nInvite code bilan kiring:\n/start DASTYOR2026",
  alreadyRegistered:
    "✅ Siz allaqachon ro'yxatdan o'tgansiz.",
  welcome:
    "✅ Xush kelibsiz! Endi DastyorBot'dan foydalanishingiz mumkin.",
  parsing: "⏳ Tushundim, tahlil qilyapman...",
  unknown:
    "🤔 Xabaringizni to'liq tushunmadim. Boshqacharoq yozib ko'ring.\n\nMasalan: Bugun 35 ming taksiga sarfladim",
  saveError: "❌ Saqlashda xatolik bo'ldi. Qaytadan urinib ko'ring.",
  unsupportedMessage: "Hozircha matn va ovozli xabarlarni tushunaman.",
};
