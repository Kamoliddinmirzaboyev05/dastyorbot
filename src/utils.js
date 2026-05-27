import {
  ALLOWED_TRANSACTION_CATEGORIES,
  CATEGORY_KEYWORDS,
  TASHKENT_OFFSET_MS,
} from "./constants.js";

export function normalizeText(text = "") {
  return normalizeUzbekText(text)
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUzbekText(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[üū]/g, "u")
    .replace(/[‘’`´ʼʻ]/g, "'")
    .replace(/[а]/g, "a")
    .replace(/ў/g, "o'")
    .replace(/o\s*['’‘ʻ`]\s*/g, "o'")
    .replace(/g\s*['’‘ʻ`]\s*/g, "g'")
    .replace(/\btaksiyya\b|\btaksiya\b|\btaxsi\b/g, "taksi")
    .replace(/\btuslikke\b|\btushlikke\b|\btuslikka\b/g, "tushlikka")
    .replace(/\bsarifladam\b|\bsarfladam\b|\bsarifladim\b/g, "sarfladim")
    .replace(/\bdakika\b|\bdakikadan\b/g, "daqiqa")
    .replace(/\bisilatma\b|\besilatma\b/g, "eslatma")
    .replace(/\beslatma\s+bir\b|\beslatma\s+ber\b/g, "eslat")
    .replace(/\buxilashim\b|\buxlashim\b/g, "uxlash")
    .replace(/(\d+(?:[.,]\d+)?)\s+min\b/g, "$1 ming")
    .replace(/\bharajat\b|\bxarajat\b/g, "xarajat")
    .replace(/\bqalda\b|\bqildi\b|\bqildim\b/g, "qildim")
    .replace(/\bigirma\s+ming\b|\byigirmam\s+in\b|\byigirma\s+min\b|\byigirmamin\b|\byigirmaming\b/g, "yigirma ming")
    .replace(/\bo['‘’ʻ]?ttiz\b|\bottiz\b/g, "ottiz")
    .replace(/\bellikmin\b|\bellik\s+min\b/g, "ellik ming")
    .replace(/\bun\s+ming\b|\bon\s+ming\b/g, "on ming")
    .replace(/\byuzmin\b|\byuz\s+min\b/g, "yuz ming")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function formatMoney(amount) {
  return Number(amount || 0).toLocaleString("uz-UZ");
}

export function getTashkentNow() {
  return new Date(Date.now() + TASHKENT_OFFSET_MS);
}

export function toTashkentParts(date = new Date()) {
  const shifted = new Date(date.getTime() + TASHKENT_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    day: shifted.getUTCDay(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

export function tashkentDateToUtcIso(year, month, date, hours = 0, minutes = 0) {
  return new Date(Date.UTC(year, month, date, hours, minutes) - TASHKENT_OFFSET_MS).toISOString();
}

export function todayAtTashkentIso(hours, minutes = 0) {
  const now = toTashkentParts();
  return tashkentDateToUtcIso(now.year, now.month, now.date, hours, minutes);
}

export function tomorrowAtTashkentIso(hours, minutes = 0) {
  const now = toTashkentParts();
  return tashkentDateToUtcIso(now.year, now.month, now.date + 1, hours, minutes);
}

export function formatTashkentTime(isoString) {
  if (!isoString) return "";
  const parts = toTashkentParts(new Date(isoString));
  return `${String(parts.hours).padStart(2, "0")}:${String(parts.minutes).padStart(2, "0")}`;
}

export function getDateRange(period, baseDate = new Date()) {
  const parts = toTashkentParts(baseDate);

  if (period === "weekly") {
    const mondayOffset = parts.day === 0 ? -6 : 1 - parts.day;
    return {
      start: tashkentDateToUtcIso(parts.year, parts.month, parts.date + mondayOffset),
      end: tashkentDateToUtcIso(parts.year, parts.month, parts.date + mondayOffset + 7),
    };
  }

  if (period === "monthly") {
    return {
      start: tashkentDateToUtcIso(parts.year, parts.month, 1),
      end: tashkentDateToUtcIso(parts.year, parts.month + 1, 1),
    };
  }

  return {
    start: tashkentDateToUtcIso(parts.year, parts.month, parts.date),
    end: tashkentDateToUtcIso(parts.year, parts.month, parts.date + 1),
  };
}

export function normalizeCategory(input = "other", sourceText = "") {
  const candidate = normalizeText(input);
  if (ALLOWED_TRANSACTION_CATEGORIES.includes(candidate)) return candidate;

  const text = normalizeText(`${input} ${sourceText}`);
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(normalizeText(keyword)))) {
      return category;
    }
  }

  return "other";
}

export function clampText(value, maxLength = 300) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function isMeaningfulText(text = "") {
  return String(text).trim().replace(/[^\p{L}\p{N}]/gu, "").length >= 3;
}

export function buildQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.set(key, value);
  }
  return search.toString();
}
