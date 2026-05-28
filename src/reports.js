import { CATEGORY_LABELS } from "./constants.js";
import { sendMessage } from "./telegram.js";
import { getAllowedUsers, supabaseGet, supabaseInsert } from "./supabase.js";
import { formatMoney, getDateRange } from "./utils.js";

export async function generateDailyReport(env, user) {
  return generateReport(env, user, "daily", { save: false });
}

export async function generateWeeklyReport(env, user) {
  return generateReport(env, user, "weekly", { save: false });
}

export async function generateMonthlyReport(env, user) {
  return generateReport(env, user, "monthly", { save: false });
}

export async function generateReport(env, user, reportType, options = {}) {
  const range = getDateRange(reportType);
  const [transactions, tasks] = await Promise.all([
    supabaseGet(env, "transactions", {
      user_id: `eq.${user.id}`,
      transaction_at: `gte.${range.start}`,
      select: "*",
      order: "transaction_at.asc",
    }),
    supabaseGet(env, "tasks", {
      user_id: `eq.${user.id}`,
      created_at: `gte.${range.start}`,
      select: "*",
      order: "created_at.asc",
    }),
  ]);

  const periodTransactions = (transactions || []).filter(
    (tx) => tx.transaction_at >= range.start && tx.transaction_at < range.end
  );
  const periodTasks = (tasks || []).filter(
    (task) => task.created_at >= range.start && task.created_at < range.end
  );

  const summary = summarize(periodTransactions, periodTasks);
  const text = buildReportText(reportType, summary);

  if (options.save) {
    await saveReport(env, user.id, reportType, range.start, range.end, text);
  }
  return text;
}

export function buildReportText(reportType, summary) {
  const title = {
    daily: "📊 Kunlik hisobot",
    weekly: "📊 Haftalik hisobot",
    monthly: "📊 Oylik hisobot",
  }[reportType] || "📊 Hisobot";

  const lines = [
    title,
    "",
    `💵 Kirim: ${formatMoney(summary.income)} so'm`,
    `💸 Chiqim: ${formatMoney(summary.expense)} so'm`,
    `📌 Natija: ${formatMoney(summary.net)} so'm`,
  ];

  if (Object.keys(summary.byCategory).length > 0) {
    lines.push("", "Xarajatlar kategoriyalar bo'yicha:");
    for (const [category, amount] of Object.entries(summary.byCategory)) {
      lines.push(`• ${CATEGORY_LABELS[category] || category}: ${formatMoney(amount)} so'm`);
    }
  }

  lines.push(
    "",
    `✅ Bajarilgan vazifalar: ${summary.doneTasks}`,
    `⏳ Kutilayotgan vazifalar: ${summary.pendingTasks}`
  );

  if (reportType === "daily" && summary.pendingTaskTitles.length > 0) {
    lines.push("", "Kutilayotganlar:");
    for (const title of summary.pendingTaskTitles.slice(0, 5)) {
      lines.push(`• ${title}`);
    }
  }

  if (reportType === "monthly") {
    lines.push(`📈 Vazifa bajarish: ${summary.completionRate}%`);
  }

  lines.push("", buildRecommendation(summary));
  return lines.join("\n");
}

export async function saveReport(env, userId, reportType, periodStart, periodEnd, summary) {
  return supabaseInsert(env, "reports", {
    user_id: userId,
    report_type: reportType,
    period_start: periodStart,
    period_end: periodEnd,
    summary,
  });
}

export async function sendScheduledReports(env, reportType) {
  const users = await getAllowedUsers(env);
  let sentCount = 0;

  for (const user of users || []) {
    if (!user.chat_id) continue;
    try {
      const text = await generateReport(env, user, reportType, { save: true });
      await sendMessage(env, user.chat_id, text);
      sentCount++;
    } catch (error) {
      console.log("REPORT_SEND_ERROR", reportType, user.id, error.message);
    }
  }

  return sentCount;
}

function summarize(transactions, tasks) {
  const summary = {
    income: 0,
    expense: 0,
    net: 0,
    byCategory: {},
    doneTasks: 0,
    pendingTasks: 0,
    pendingTaskTitles: [],
    completionRate: 0,
  };

  for (const tx of transactions) {
    const amount = Number(tx.amount || 0);
    if (tx.type === "income") {
      summary.income += amount;
    } else {
      summary.expense += amount;
      summary.byCategory[tx.category || "other"] =
        (summary.byCategory[tx.category || "other"] || 0) + amount;
    }
  }

  for (const task of tasks) {
    if (task.status === "done") {
      summary.doneTasks++;
    } else if (task.status === "pending") {
      summary.pendingTasks++;
      summary.pendingTaskTitles.push(task.title);
    }
  }

  summary.net = summary.income - summary.expense;
  const totalTasks = summary.doneTasks + summary.pendingTasks;
  summary.completionRate = totalTasks ? Math.round((summary.doneTasks / totalTasks) * 100) : 0;
  summary.byCategory = Object.fromEntries(
    Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1])
  );

  return summary;
}

function buildRecommendation(summary) {
  if (summary.expense === 0 && summary.income === 0) {
    return "Tavsiya: bugungi yozuvlarni kiritib boring, hisobot aniqroq bo'ladi.";
  }
  if (summary.expense > summary.income && summary.income > 0) {
    return "Tavsiya: chiqim kirimdan oshib ketgan, katta xarajatlarni qayta ko'rib chiqing.";
  }
  if (summary.pendingTasks > summary.doneTasks && summary.pendingTasks > 2) {
    return "Tavsiya: kutilayotgan vazifalarni 2-3 ta eng muhim ishga ajrating.";
  }
  return "Tavsiya: shu ritmni saqlang va xarajatlarni kategoriyalar bo'yicha kuzatib boring.";
}
