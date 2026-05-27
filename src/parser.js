import {
  EXPENSE_KEYWORDS,
  INCOME_KEYWORDS,
} from "./constants.js";
import {
  clampText,
  isMeaningfulText,
  normalizeCategory,
  normalizeText,
  normalizeUzbekText,
  safeJsonParse,
  todayAtTashkentIso,
  tomorrowAtTashkentIso,
} from "./utils.js";

const EMPTY_PARSED = {
  transactions: [],
  tasks: [],
  reminders: [],
  notes: [],
};

export async function parseUserMessage(env, text) {
  const deterministicFinance = parseSimpleFinanceText(text);
  const deterministicTask = parseSimpleTaskReminder(text);
  const deterministicNote = parseSimpleNote(text);

  if (deterministicFinance.status === "needs_confirmation" && hasFinanceIntent(text)) {
    return deterministicFinance;
  }

  if (deterministicFinance.transactions.length > 0 && !hasComplexIntent(text)) {
    return normalizeParsedData(deterministicFinance, text);
  }

  if (
    (deterministicTask.tasks.length > 0 || deterministicTask.reminders.length > 0) &&
    deterministicFinance.transactions.length === 0
  ) {
    return normalizeParsedData(deterministicTask, text);
  }

  if (deterministicNote.notes.length > 0) {
    return normalizeParsedData(deterministicNote, text);
  }

  try {
    const groqParsed = await parseWithGroq(env, text);
    const normalized = normalizeParsedData(groqParsed, text);

    if (deterministicFinance.transactions.length > 0) {
      normalized.transactions = [...deterministicFinance.transactions];
      return normalized;
    }

    if (normalized.transactions.length > 0 && deterministicFinance.transactions.length === 0) {
      if (!hasFinanceIntent(text)) {
        normalized.transactions = [];
        return normalized;
      }

      const amountCheck = parseUzbekMoneyAmount(text);
      if (!["high", "medium"].includes(amountCheck.confidence)) {
        return buildNeedsConfirmation(text);
      }
      normalized.transactions = normalized.transactions.map((tx) => ({
        ...tx,
        amount: amountCheck.amount,
      }));
    }

    for (const tx of deterministicFinance.transactions) {
      if (!hasSimilarTransaction(normalized.transactions, tx)) {
        normalized.transactions.push(tx);
      }
    }

    return normalized;
  } catch (error) {
    console.log("PARSER_GROQ_FALLBACK", error.message);

    if (deterministicFinance.transactions.length > 0) {
      return normalizeParsedData(deterministicFinance, text);
    }
    if (deterministicTask.tasks.length > 0) {
      return normalizeParsedData(deterministicTask, text);
    }
    if (hasNoteIntent(text) && isMeaningfulText(text)) {
      return normalizeParsedData({ ...EMPTY_PARSED, notes: [{ content: text }] }, text);
    }
    return { ...EMPTY_PARSED };
  }
}

export function parseSimpleFinanceText(text) {
  const normalized = normalizeUzbekText(text);
  const transactions = [];
  const amountMatches = findMoneyMatches(normalized);
  const reliableAmountMatches = amountMatches.filter((match) =>
    ["high", "medium"].includes(match.confidence)
  );
  const wholeTextType = detectTransactionType(normalized);

  if (wholeTextType && reliableAmountMatches.length === 0) {
    return buildNeedsConfirmation(text, normalized);
  }

  for (const amountMatch of reliableAmountMatches) {
    const windowStart = Math.max(0, amountMatch.index - 40);
    const windowEnd = Math.min(normalized.length, amountMatch.index + amountMatch.matchedText.length + 80);
    const context = normalized.slice(windowStart, windowEnd);
    const categoryContext = getLocalAmountSegment(normalized, amountMatch.index, amountMatch.matchedText.length);
    const contextType = detectTransactionType(context);
    const type = contextType || wholeTextType;

    if (!type) continue;

    transactions.push({
      type,
      amount: amountMatch.amount,
      currency: "UZS",
      category: normalizeCategory("", categoryContext || context),
      note: clampText(text),
      transaction_at: new Date().toISOString(),
    });
  }

  return { ...EMPTY_PARSED, transactions: dedupeTransactions(transactions) };
}

export function parseUzbekMoneyAmount(text) {
  const matches = findMoneyMatches(normalizeUzbekText(text));
  if (matches.length === 0) {
    return { amount: null, confidence: "low", matchedText: null };
  }

  const best = matches.find((match) => match.confidence === "high") || matches[0];
  return {
    amount: best.amount,
    confidence: best.confidence,
    matchedText: best.matchedText,
  };
}

export function parseWithGroq(env, text) {
  const now = new Date().toISOString();

  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Sen DastyorBot uchun qat'iy JSON parser vazifasini bajaryapsan.

Foydalanuvchi o'zbekcha yozadi. Matnni transactions, tasks, reminders, notes turlariga ajrat.

Qoidalar:
- Faqat valid JSON qaytar. Markdown va izoh yozma.
- Pul miqdorlari UZS integer bo'lsin: 35 ming=35000, 1 mln=1000000, 1.5 mln=1500000.
- Transaction type faqat income yoki expense.
- Transaction category faqat: food, transport, education, shopping, health, entertainment, salary, freelance, business, gift, other.
- Task fieldlari: title, description, due_at, priority, remind_before_minutes.
- Reminder fieldlari: title, remind_at.
- Note fieldlari: content.
- Bugungi vaqt: ${now}. Timezone: Asia/Tashkent.
- "Bugun 20:00 da dars qilishim kerak 10 daqiqa oldin eslat" task + reminder sifatida qaytsin.
- "Eslab qol" bilan boshlangan kelishuv/malumot notes bo'lsin, agar real xarajat yoki kirim bo'lmasa.

JSON format:
{
  "transactions": [],
  "tasks": [],
  "reminders": [],
  "notes": []
}`,
        },
        { role: "user", content: text },
      ],
    }),
  }).then(async (response) => {
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.log("GROQ_ERROR", JSON.stringify(data));
      throw new Error("Groq API error");
    }

    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(content);
    if (!parsed) throw new Error("Invalid Groq JSON");
    return parsed;
  });
}

export function normalizeParsedData(parsed, originalText = "") {
  const output = {
    transactions: [],
    tasks: [],
    reminders: [],
    notes: [],
  };

  if (Array.isArray(parsed?.transactions)) {
    for (const item of parsed.transactions) {
      const amount = Number(item.amount);
      if (!amount || amount <= 0) continue;
      output.transactions.push({
        type: item.type === "income" ? "income" : "expense",
        amount: Math.round(amount),
        currency: item.currency || "UZS",
        category: normalizeCategory(item.category, item.note || originalText),
        note: clampText(item.note || originalText),
        transaction_at: validIsoOrNow(item.transaction_at),
      });
    }
  }

  if (Array.isArray(parsed?.tasks)) {
    for (const item of parsed.tasks) {
      if (!item.title) continue;
      output.tasks.push({
        title: clampText(item.title, 160),
        description: item.description ? clampText(item.description, 400) : null,
        due_at: validIsoOrNull(item.due_at),
        priority: ["low", "medium", "high"].includes(item.priority) ? item.priority : "medium",
        remind_before_minutes: positiveNumberOrNull(item.remind_before_minutes),
      });
    }
  }

  if (Array.isArray(parsed?.reminders)) {
    for (const item of parsed.reminders) {
      if (!item.title || !item.remind_at) continue;
      const remindAt = validIsoOrNull(item.remind_at);
      if (!remindAt) continue;
      output.reminders.push({
        title: clampText(item.title, 160),
        remind_at: remindAt,
      });
    }
  }

  if (Array.isArray(parsed?.notes)) {
    for (const item of parsed.notes) {
      if (!item.content || !isMeaningfulText(item.content)) continue;
      output.notes.push({ content: clampText(item.content, 1000) });
    }
  }

  return output;
}

export function sanitizeParsedData(parsed, originalText = "") {
  const sanitized = {
    transactions: [...(parsed.transactions || [])],
    tasks: [...(parsed.tasks || [])],
    reminders: [...(parsed.reminders || [])],
    notes: [...(parsed.notes || [])],
  };

  if (parsed.status) {
    sanitized.status = parsed.status;
    sanitized.reason = parsed.reason;
    sanitized.originalText = parsed.originalText;
    sanitized.normalizedText = parsed.normalizedText;
  }

  if (!hasNoteIntent(originalText)) {
    sanitized.notes = [];
  }

  if (!hasReminderIntent(originalText)) {
    sanitized.reminders = [];
    sanitized.tasks = sanitized.tasks.map((task) => ({
      ...task,
      remind_before_minutes: null,
    }));
  } else {
    sanitized.reminders = dedupeReminders(sanitized.reminders);
  }

  sanitized.tasks = sanitized.tasks.filter((task) =>
    hasTaskIntent(originalText) || isMeaningfulText(task.title)
  );

  return sanitized;
}

export function hasReminderIntent(text) {
  const normalized = normalizeText(text);
  return /eslat|eslatib qo'y|ogohlantir|reminder|\d+\s*(daqiqa|minut|soat)\s*oldin|yarim soat oldin/.test(normalized);
}

export function hasNoteIntent(text) {
  const normalized = normalizeText(text);
  return /eslab qol|qayd|note|yodda saqla/.test(normalized);
}

export function hasTaskIntent(text) {
  const normalized = normalizeText(text);
  return /kerak|qilishim kerak|tugatishim kerak|o'qishim kerak|oqishim kerak|borishim kerak|topshirishim kerak/.test(normalized);
}

function parseSimpleTaskReminder(text) {
  const normalized = normalizeText(text);
  const relative = normalized.match(/(\d+)\s*(daqiqa|minut|soat)\s*(?:dan|dan keyin|keyin)?/);

  if (relative && !normalized.includes("oldin") && /(eslat|eslatma|remind|reminder)/.test(normalized)) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const minutes = amount * (unit === "soat" ? 60 : 1);
    const remindAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    return {
      ...EMPTY_PARSED,
      reminders: [{
        title: extractReminderTitle(text, relative[0]),
        remind_at: remindAt,
      }],
    };
  }

  const time = normalized.match(/(?:bugun|ertaga)?\s*(\d{1,2})[:.](\d{2})\s*da|(?:bugun|ertaga)?\s*(\d{1,2})\s*da/);
  if (!time || !/(kerak|eslat|vazifa|qilishim|uchrashuv)/.test(normalized)) {
    if (hasTaskIntent(normalized)) {
      return {
        ...EMPTY_PARSED,
        tasks: [{
          title: extractTaskTitle(text),
          description: null,
          due_at: null,
          priority: "medium",
          remind_before_minutes: null,
        }],
      };
    }

    return { ...EMPTY_PARSED };
  }

  const hour = Number(time[1] || time[3]);
  const minute = Number(time[2] || 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { ...EMPTY_PARSED };

  const dueAt = normalized.includes("ertaga")
    ? tomorrowAtTashkentIso(hour, minute)
    : todayAtTashkentIso(hour, minute);
  const beforeMatch = normalized.match(/(\d+)\s*(daqiqa|minut|soat)\s*oldin/);
  const beforeMinutes = beforeMatch
    ? Number(beforeMatch[1]) * (beforeMatch[2] === "soat" ? 60 : 1)
    : null;
  const title = extractTaskTitle(text);

  if (normalized.includes("eslat") && !/(kerak|qilishim|vazifa)/.test(normalized)) {
    return {
      ...EMPTY_PARSED,
      reminders: [{ title, remind_at: dueAt }],
    };
  }

  return {
    ...EMPTY_PARSED,
    tasks: [{
      title,
      description: null,
      due_at: dueAt,
      priority: "medium",
      remind_before_minutes: beforeMinutes,
    }],
  };
}

function parseSimpleNote(text) {
  const normalized = normalizeText(text);
  if (!normalized.startsWith("eslab qol")) return { ...EMPTY_PARSED };
  const content = text.replace(/^eslab qol[,\s]*/i, "").trim();
  return {
    ...EMPTY_PARSED,
    notes: [{ content: content || text }],
  };
}

function parseAmount(value, unit = "") {
  const base = Number(String(value).replace(",", "."));
  if (!Number.isFinite(base) || base <= 0) return null;
  const normalizedUnit = normalizeText(unit);
  if (["ming", "k"].includes(normalizedUnit)) return Math.round(base * 1000);
  if (["mln", "million", "m"].includes(normalizedUnit)) return Math.round(base * 1000000);
  return Math.round(base);
}

function findMoneyMatches(text) {
  const matches = [];
  const digitPattern = /(?:[$]\s*)?(?<!\d)(\d+(?:(?:[,\s]\d{3})|(?:[.,]\d+))*)\s*(ming|mln|million|m|k)?(?!\d)/g;

  for (const match of text.matchAll(digitPattern)) {
    const amount = parseDigitAmount(match[1], match[2]);
    if (!amount) continue;
    const hasUnit = Boolean(match[2]);
    matches.push({
      amount,
      confidence: hasUnit || amount >= 1000 ? "high" : "low",
      matchedText: match[0].trim(),
      index: match.index,
    });
  }

  for (const match of findWordMoneyMatches(text)) {
    matches.push(match);
  }

  return dedupeMoneyMatches(matches).sort((a, b) => a.index - b.index);
}

function parseDigitAmount(value, unit = "") {
  const raw = String(value).trim();
  const compact = isThousandsSeparated(raw)
    ? raw.replace(/[,\s]/g, "")
    : raw.replace(/\s/g, "").replace(/,/g, ".");
  const base = Number(compact);
  if (!Number.isFinite(base) || base <= 0) return null;
  const normalizedUnit = normalizeText(unit);
  if (["ming", "k"].includes(normalizedUnit)) return Math.round(base * 1000);
  if (["mln", "million", "m"].includes(normalizedUnit)) return Math.round(base * 1000000);
  return Math.round(base);
}

function isThousandsSeparated(value) {
  return /^\d{1,3}([,\s]\d{3})+$/.test(String(value).trim());
}

function findWordMoneyMatches(text) {
  const tokens = text.split(/\s+/);
  const matches = [];
  let offset = 0;

  for (let index = 0; index < tokens.length; index++) {
    const startOffset = text.indexOf(tokens[index], offset);
    offset = startOffset + tokens[index].length;

    for (let length = 1; length <= 5 && index + length <= tokens.length; length++) {
      const phraseTokens = tokens.slice(index, index + length);
      const parsed = parseUzbekNumberPhrase(phraseTokens);
      if (!parsed) continue;

      matches.push({
        amount: parsed.amount,
        confidence: parsed.confidence,
        matchedText: phraseTokens.join(" "),
        index: startOffset,
      });
    }
  }

  return matches;
}

function parseUzbekNumberPhrase(tokens) {
  const multiplierToken = tokens[tokens.length - 1];
  const multiplier = getMultiplier(multiplierToken);
  if (!multiplier) return null;

  const numberTokens = tokens.slice(0, -1);
  if (numberTokens.length === 0) return null;

  if (numberTokens.join(" ") === "bir yarim" && multiplier === 1000000) {
    return { amount: 1500000, confidence: "medium" };
  }

  const number = parseUzbekCardinal(numberTokens);
  if (!number) return null;

  return {
    amount: number * multiplier,
    confidence: "high",
  };
}

function parseUzbekCardinal(tokens) {
  const units = {
    bir: 1,
    ikki: 2,
    uch: 3,
    tort: 4,
    "to'rt": 4,
    besh: 5,
    olti: 6,
    yetti: 7,
    sakkiz: 8,
    toqqiz: 9,
    "to'qqiz": 9,
  };
  const tens = {
    on: 10,
    yigirma: 20,
    ottiz: 30,
    "o'ttiz": 30,
    qirq: 40,
    ellik: 50,
    oltmish: 60,
    yetmish: 70,
    sakson: 80,
    toqson: 90,
    "to'qson": 90,
  };

  if (tokens.length === 1) {
    if (tokens[0] === "yuz") return 100;
    return units[tokens[0]] || tens[tokens[0]] || null;
  }

  if (tokens.length === 2 && tokens[1] === "yuz") {
    return units[tokens[0]] ? units[tokens[0]] * 100 : null;
  }

  if (tokens.length === 2 && tens[tokens[0]] && units[tokens[1]]) {
    return tens[tokens[0]] + units[tokens[1]];
  }

  if (tokens.length === 3 && tokens[1] === "yuz") {
    return units[tokens[0]] && tens[tokens[2]]
      ? units[tokens[0]] * 100 + tens[tokens[2]]
      : null;
  }

  return null;
}

function getMultiplier(token) {
  if (token === "ming") return 1000;
  if (token === "million" || token === "mln") return 1000000;
  return null;
}

function dedupeMoneyMatches(matches) {
  const seen = new Set();
  const unique = matches.filter((match) => {
    const key = `${match.index}:${match.matchedText}:${match.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const selected = [];
  for (const match of unique.sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index;
    return b.matchedText.length - a.matchedText.length;
  })) {
    const start = match.index;
    const end = match.index + match.matchedText.length;
    const overlaps = selected.some((item) => {
      const itemStart = item.index;
      const itemEnd = item.index + item.matchedText.length;
      return start < itemEnd && end > itemStart;
    });
    if (!overlaps) selected.push(match);
  }

  return selected;
}

function buildNeedsConfirmation(originalText, normalizedText = normalizeUzbekText(originalText)) {
  return {
    ...EMPTY_PARSED,
    status: "needs_confirmation",
    reason: "amount_unclear",
    originalText,
    normalizedText,
  };
}

function detectTransactionType(text) {
  if (INCOME_KEYWORDS.some((keyword) => text.includes(normalizeText(keyword)))) {
    return "income";
  }
  if (EXPENSE_KEYWORDS.some((keyword) => text.includes(normalizeText(keyword)))) {
    return "expense";
  }
  return null;
}

function getLocalAmountSegment(text, index, length) {
  const leftComma = text.lastIndexOf(",", index);
  const leftDot = text.lastIndexOf(".", index);
  const start = Math.max(leftComma, leftDot, 0);
  const rightComma = text.indexOf(",", index + length);
  const rightDot = text.indexOf(".", index + length);
  const positiveEnds = [rightComma, rightDot].filter((value) => value >= 0);
  const end = positiveEnds.length ? Math.min(...positiveEnds) : text.length;
  return text.slice(start, end);
}

function dedupeTransactions(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${item.amount}:${item.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasComplexIntent(text) {
  const normalized = normalizeText(text);
  return /(kerak|eslat|eslab qol|vazifa|hisobot|\?|qildim)/.test(normalized) &&
    /[.?!]|,.*(kerak|eslat)/.test(normalized);
}

function hasSimilarTransaction(items, tx) {
  return items.some((item) => item.type === tx.type && item.amount === tx.amount);
}

function hasFinanceIntent(text) {
  const normalized = normalizeText(text);
  return detectTransactionType(normalized) ||
    /(ming|mln|million|\$|so'm|som|taksi|taxi|tushlik|ovqat|oylik|maosh|daromad|xarajat|sarfladim|spent|paid|bought)/.test(normalized);
}

function dedupeReminders(reminders) {
  const seen = new Set();
  return reminders.filter((reminder) => {
    const key = `${normalizeText(reminder.title)}:${reminder.remind_at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validIsoOrNow(value) {
  return validIsoOrNull(value) || new Date().toISOString();
}

function validIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function positiveNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function extractTaskTitle(text) {
  let title = String(text)
    .replace(/bugun|ertaga/gi, "")
    .replace(/\d+\s*(daqiqa|minut|soat)\s*oldin\s*eslat/gi, "")
    .replace(/\d{1,2}[:.]\d{2}\s*da/gi, "")
    .replace(/\d{1,2}\s*da/gi, "")
    .replace(/eslat|qilishim kerak|kerak/gi, "")
    .replace(/o['‘’ʻ]?qishim/gi, "o'qish")
    .replace(/tugatishim/gi, "tugatish")
    .replace(/borishim/gi, "borish")
    .replace(/topshirishim/gi, "topshirish")
    .trim();

  title = title.replace(/^[,.\s]+|[,.\s]+$/g, "");
  return clampText(title || "Eslatma", 160);
}

function extractReminderTitle(text, relativeText) {
  let title = normalizeText(text)
    .replace(relativeText, "")
    .replace(/dan keyin|keyin|haqida|eslatma|eslat|ber|bir|remind|reminder/gi, "")
    .replace(/\b\d+\b/g, "")
    .trim();

  title = title.replace(/^[,.\s-]+|[,.\s-]+$/g, "");
  return clampText(title || "Eslatma", 160);
}
