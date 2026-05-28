import { CATEGORY_LABELS, MENU_HELP_TEXT } from "./constants.js";
import { generateDailyReport, generateMonthlyReport, generateWeeklyReport } from "./reports.js";
import { recordActionKeyboard, recordActionRows, summarizeRecord } from "./recordActions.js";
import {
  getActiveReminders,
  getRecentNotes,
  getRecentTransactions,
  getTasksByStatus,
  getTodayReminders,
  getTodayTasks,
  getTransactionsForRange,
} from "./supabase.js";
import { editMessageText, inlineKeyboard, mainReplyKeyboard, sendMessage } from "./telegram.js";
import { formatMoney, formatTashkentDateTime, getDateRange } from "./utils.js";

export async function showMainMenu(env, chatId, messageId = null) {
  const text = "📋 DastyorBot menyusi\n\nKo'rmoqchi bo'lgan bo'limni tanlang:";
  if (messageId) return sendMessage(env, chatId, text, mainReplyKeyboard());
  return sendMessage(env, chatId, text, mainReplyKeyboard());
}

export async function showReportsMenu(env, chatId, messageId = null) {
  return sendOrEdit(env, chatId, messageId, "📊 Hisobotlar\n\nQaysi hisobotni ko'rmoqchisiz?", inlineKeyboard([
    [
      { text: "📅 Bugungi", callback_data: "report:daily" },
      { text: "🗓 Haftalik", callback_data: "report:weekly" },
      { text: "📆 Oylik", callback_data: "report:monthly" },
    ],
    [{ text: "⬅️ Orqaga", callback_data: "menu:main" }],
  ]));
}

export async function showFinanceMenu(env, chatId, messageId = null) {
  return sendOrEdit(env, chatId, messageId, "💸 Kirim-chiqim\n\nQaysi ma'lumotni ko'rmoqchisiz?", inlineKeyboard([
    [
      { text: "📅 Bugungi", callback_data: "finance:today" },
      { text: "🗓 Haftalik", callback_data: "finance:week" },
      { text: "📆 Oylik", callback_data: "finance:month" },
    ],
    [{ text: "📂 Kategoriyalar", callback_data: "finance:categories" }],
    [{ text: "⬅️ Orqaga", callback_data: "menu:main" }],
  ]));
}

export async function showTasksMenu(env, chatId, messageId = null) {
  return sendOrEdit(env, chatId, messageId, "✅ Rejalar\n\nQaysi rejalarni ko'rmoqchisiz?", inlineKeyboard([
    [
      { text: "📌 Bugungi", callback_data: "tasks:today" },
      { text: "⏳ Bajarilmagan", callback_data: "tasks:pending" },
      { text: "✅ Bajarilgan", callback_data: "tasks:done" },
    ],
    [{ text: "⬅️ Orqaga", callback_data: "menu:main" }],
  ]));
}

export async function showRemindersMenu(env, chatId, messageId = null) {
  return sendOrEdit(env, chatId, messageId, "🔔 Eslatmalar\n\nQaysi eslatmalarni ko'rmoqchisiz?", inlineKeyboard([
    [
      { text: "📌 Faol eslatmalar", callback_data: "reminders:active" },
      { text: "🕒 Bugungi eslatmalar", callback_data: "reminders:today" },
    ],
    [{ text: "⬅️ Orqaga", callback_data: "menu:main" }],
  ]));
}

export async function showHelp(env, chatId, messageId = null) {
  return sendOrEdit(env, chatId, messageId, MENU_HELP_TEXT, backKeyboard());
}

export async function routeMenuCallback(env, chatId, messageId, user, data) {
  if (data === "menu:main") return showMainMenu(env, chatId, messageId);
  if (data === "menu:reports") return showReportsMenu(env, chatId, messageId);
  if (data === "menu:finance") return showFinanceOverview(env, chatId, messageId, user.id);
  if (data === "menu:tasks") return showTasksOverview(env, chatId, messageId, user.id);
  if (data === "menu:reminders") return showRemindersOverview(env, chatId, messageId, user.id);
  if (data === "menu:notes") return showNotes(env, chatId, messageId, user.id);
  if (data === "menu:history") return showHistory(env, chatId, messageId, user.id);
  if (data === "menu:help") return showHelp(env, chatId, messageId);

  if (data === "report:daily") return sendOrEdit(env, chatId, messageId, await generateDailyReport(env, user), backKeyboard("menu:reports"));
  if (data === "report:weekly") return sendOrEdit(env, chatId, messageId, await generateWeeklyReport(env, user), backKeyboard("menu:reports"));
  if (data === "report:monthly") return sendOrEdit(env, chatId, messageId, await generateMonthlyReport(env, user), backKeyboard("menu:reports"));

  if (data === "finance:today") return showFinanceSummary(env, chatId, messageId, user.id, "daily");
  if (data === "finance:week") return showFinanceSummary(env, chatId, messageId, user.id, "weekly");
  if (data === "finance:month") return showFinanceSummary(env, chatId, messageId, user.id, "monthly");
  if (data === "finance:categories") return showCategoryBreakdown(env, chatId, messageId, user.id);

  if (data === "tasks:today") return showTodayTasks(env, chatId, messageId, user.id);
  if (data === "tasks:pending") return showStatusTasks(env, chatId, messageId, user.id, "pending");
  if (data === "tasks:done") return showStatusTasks(env, chatId, messageId, user.id, "done");

  if (data === "reminders:active") return showActiveReminders(env, chatId, messageId, user.id);
  if (data === "reminders:today") return showTodayReminders(env, chatId, messageId, user.id);

  return showMainMenu(env, chatId, messageId);
}

async function showFinanceSummary(env, chatId, messageId, userId, period) {
  const range = getDateRange(period);
  const transactions = await getTransactionsForRange(env, userId, range.start, range.end);
  const income = sumTransactions(transactions, "income");
  const expense = sumTransactions(transactions, "expense");
  const title = period === "daily" ? "Bugungi" : period === "weekly" ? "Haftalik" : "Oylik";
  const lines = [
    `💸 ${title} kirim-chiqim`,
    "",
    `💵 Kirim: ${formatMoney(income)} so'm`,
    `💸 Chiqim: ${formatMoney(expense)} so'm`,
    `📌 Natija: ${formatMoney(income - expense)} so'm`,
  ];

  if (period === "daily") {
    lines.push("", "Oxirgi 5 yozuv:");
    lines.push(...formatTransactions(transactions.slice(0, 5)));
  } else {
    lines.push("", "Top kategoriyalar:");
    lines.push(...formatCategories(categoryTotals(transactions)).slice(0, 5));
  }

  return sendOrEdit(env, chatId, messageId, lines.join("\n"), recordActionRows(transactions.slice(0, 5), "transaction", { back: "menu:finance" }));
}

async function showFinanceOverview(env, chatId, messageId, userId) {
  const sections = [];
  for (const period of ["daily", "weekly", "monthly"]) {
    const range = getDateRange(period);
    const transactions = await getTransactionsForRange(env, userId, range.start, range.end);
    const income = sumTransactions(transactions, "income");
    const expense = sumTransactions(transactions, "expense");
    const title = period === "daily" ? "📅 Kunlik" : period === "weekly" ? "🗓 Haftalik" : "📆 Oylik";

    sections.push([
      title,
      `💵 Kirim: ${formatMoney(income)} so'm`,
      `💸 Chiqim: ${formatMoney(expense)} so'm`,
      `📌 Natija: ${formatMoney(income - expense)} so'm`,
    ].join("\n"));
  }

  const monthRange = getDateRange("monthly");
  const monthTransactions = await getTransactionsForRange(env, userId, monthRange.start, monthRange.end);
  const recentTransactions = (await getRecentTransactions(env, userId, 5)) || [];
  const lines = [
    "💸 Kirim-chiqim",
    "",
    sections.join("\n\n"),
    "",
    "📂 Bu oy top kategoriyalar:",
    ...formatCategories(categoryTotals(monthTransactions)).slice(0, 5),
    "",
    "Oxirgi 5 yozuv:",
    ...formatTransactions(recentTransactions),
  ];

  return sendOrEdit(env, chatId, messageId, lines.join("\n"), recordActionRows(recentTransactions, "transaction"));
}

async function showCategoryBreakdown(env, chatId, messageId, userId) {
  const range = getDateRange("monthly");
  const transactions = await getTransactionsForRange(env, userId, range.start, range.end);
  const lines = ["📂 Bu oy kategoriyalar bo'yicha", "", ...formatCategories(categoryTotals(transactions))];
  return sendOrEdit(env, chatId, messageId, lines.join("\n"), backKeyboard("menu:finance"));
}

async function showTasksOverview(env, chatId, messageId, userId) {
  const range = getDateRange("daily");
  const [todayTasks, pendingTasks, doneTasks] = await Promise.all([
    getTodayTasks(env, userId, range.start, range.end),
    getTasksByStatus(env, userId, "pending", 10),
    getTasksByStatus(env, userId, "done", 10),
  ]);

  const lines = [
    "✅ Rejalar",
    "",
    "📌 Bugungi rejalar:",
    ...formatTasksList(todayTasks, { includeStatus: true }),
    "",
    "⏳ Bajarilmagan rejalar:",
    ...formatTasksList(pendingTasks, { includeStatus: true }),
    "",
    "✅ Bajarilgan rejalar:",
    ...formatTasksList(doneTasks, { includeStatus: true }),
  ];

  const actionTasks = uniqueById([...pendingTasks, ...doneTasks]).slice(0, 10);
  return sendOrEdit(env, chatId, messageId, lines.join("\n"), recordActionRows(actionTasks, "task"));
}

async function showRemindersOverview(env, chatId, messageId, userId) {
  const range = getDateRange("daily");
  const [activeReminders, todayReminders] = await Promise.all([
    getActiveReminders(env, userId, 10),
    getTodayReminders(env, userId, range.start, range.end),
  ]);

  const lines = [
    "🔔 Eslatmalar",
    "",
    "📌 Faol eslatmalar:",
    ...formatRemindersList(activeReminders),
    "",
    "🕒 Bugungi eslatmalar:",
    ...formatRemindersList(todayReminders),
  ];

  const actionReminders = uniqueById([...activeReminders, ...todayReminders]).slice(0, 10);
  return sendOrEdit(env, chatId, messageId, lines.join("\n"), recordActionRows(actionReminders, "reminder"));
}

async function showTodayTasks(env, chatId, messageId, userId) {
  const range = getDateRange("daily");
  const tasks = await getTodayTasks(env, userId, range.start, range.end);
  return sendOrEdit(env, chatId, messageId, formatTasks("📌 Bugungi rejalar", tasks), recordActionRows(tasks, "task", { back: "menu:tasks" }));
}

async function showStatusTasks(env, chatId, messageId, userId, status) {
  const tasks = await getTasksByStatus(env, userId, status, 10);
  const title = status === "done" ? "✅ Bajarilgan rejalar" : "⏳ Bajarilmagan rejalar";
  return sendOrEdit(env, chatId, messageId, formatTasks(title, tasks), recordActionRows(tasks, "task", { back: "menu:tasks" }));
}

async function showActiveReminders(env, chatId, messageId, userId) {
  const reminders = await getActiveReminders(env, userId);
  return sendOrEdit(env, chatId, messageId, formatReminders("📌 Faol eslatmalar", reminders), recordActionRows(reminders, "reminder", { back: "menu:reminders" }));
}

async function showTodayReminders(env, chatId, messageId, userId) {
  const range = getDateRange("daily");
  const reminders = await getTodayReminders(env, userId, range.start, range.end);
  return sendOrEdit(env, chatId, messageId, formatReminders("🕒 Bugungi eslatmalar", reminders), recordActionRows(reminders, "reminder", { back: "menu:reminders" }));
}

export async function showNotes(env, chatId, messageId, userId) {
  const notes = await getRecentNotes(env, userId, 5);
  const lines = ["📝 Oxirgi qaydlar", ""];
  lines.push(...formatNotesList(notes || []));
  return sendOrEdit(env, chatId, messageId, lines.join("\n"), recordActionRows(notes || [], "note"));
}

export async function showHistory(env, chatId, messageId, userId) {
  const [transactions, tasks, notes] = await Promise.all([
    getRecentTransactions(env, userId, 5),
    getTasksByStatus(env, userId, "pending", 5),
    getRecentNotes(env, userId, 5),
  ]);
  const items = [
    ...(transactions || []).map((record) => ({ ...record, record_type: "transaction" })),
    ...(tasks || []).map((record) => ({ ...record, record_type: "task" })),
    ...(notes || []).map((record) => ({ ...record, record_type: "note" })),
  ].slice(0, 10);
  const lines = ["📜 Oxirgi ma'lumotlar", ""];
  if (!items.length) {
    lines.push("Ma'lumot yo'q.");
  } else {
    lines.push(...items.map((item, index) => `${index + 1}. ${summarizeRecord(item.record_type, item)}`));
  }
  return sendOrEdit(env, chatId, messageId, lines.join("\n\n"), recordActionKeyboard(items));
}

function sendOrEdit(env, chatId, messageId, text, keyboard) {
  if (messageId) return editMessageText(env, chatId, messageId, text, keyboard);
  return sendMessage(env, chatId, text, keyboard);
}

function backKeyboard(callbackData = "menu:main") {
  return inlineKeyboard([[{ text: "⬅️ Orqaga", callback_data: callbackData }]]);
}

function sumTransactions(transactions, type) {
  return (transactions || []).reduce((sum, tx) => sum + (tx.type === type ? Number(tx.amount || 0) : 0), 0);
}

function categoryTotals(transactions) {
  const totals = {};
  for (const tx of transactions || []) {
    if (tx.type !== "expense") continue;
    totals[tx.category || "other"] = (totals[tx.category || "other"] || 0) + Number(tx.amount || 0);
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

function formatCategories(entries) {
  if (!entries.length) return ["Ma'lumot yo'q."];
  return entries.map(([category, amount]) => `• ${CATEGORY_LABELS[category] || category}: ${formatMoney(amount)} so'm`);
}

function formatTransactions(transactions) {
  if (!transactions?.length) return ["Ma'lumot yo'q."];
  return transactions.map((tx, index) => {
    const date = tx.transaction_at ? `\n   Sana: ${formatTashkentDateTime(tx.transaction_at)}` : "";
    const note = tx.note ? `\n   Izoh: ${tx.note}` : "";
    return `${index + 1}. ${tx.type === "income" ? "💵 Kirim" : "💸 Chiqim"}: ${formatMoney(tx.amount)} so'm — ${CATEGORY_LABELS[tx.category] || tx.category || "other"}${date}${note}`;
  });
}

function formatTasks(title, tasks) {
  return [title, "", ...formatTasksList(tasks)].join("\n");
}

function formatTasksList(tasks) {
  if (!tasks?.length) return ["Ma'lumot yo'q."];
  return tasks.map((task, index) => {
    const created = task.created_at ? `\n   Yozilgan: ${formatTashkentDateTime(task.created_at)}` : "";
    const due = task.due_at ? `\n   Muddat: ${formatTashkentDateTime(task.due_at)}` : "";
    const done = task.completed_at ? `\n   Tugatilgan: ${formatTashkentDateTime(task.completed_at)}` : "";
    return `${index + 1}. ${task.title}${created}${due}${done}`;
  });
}

function formatReminders(title, reminders) {
  const lines = [title, ""];
  lines.push(...formatRemindersList(reminders));
  return lines.join("\n");
}

function formatRemindersList(reminders) {
  if (!reminders?.length) return ["Ma'lumot yo'q."];
  return reminders.map((reminder, index) => {
    const created = reminder.created_at ? `\n   Yozilgan: ${formatTashkentDateTime(reminder.created_at)}` : "";
    const remindAt = reminder.remind_at ? `\n   Eslatish: ${formatTashkentDateTime(reminder.remind_at)}` : "";
    const status = reminder.sent ? "\n   Holat: yuborilgan" : "\n   Holat: kutilmoqda";
    return `${index + 1}. ${reminder.title}${created}${remindAt}${status}`;
  });
}

function formatNotesList(notes) {
  if (!notes?.length) return ["Ma'lumot yo'q."];
  return notes.map((note, index) => {
    const created = note.created_at ? `\n   Yozilgan: ${formatTashkentDateTime(note.created_at)}` : "";
    return `${index + 1}. ${note.content}${created}`;
  });
}

function uniqueById(records) {
  const seen = new Set();
  return records.filter((record) => {
    if (!record?.id || seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}
