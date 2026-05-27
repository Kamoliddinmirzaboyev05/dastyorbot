import { BOT_MESSAGES } from "./constants.js";
import { parseUserMessage, sanitizeParsedData } from "./parser.js";
import { generateDailyReport, generateMonthlyReport, generateWeeklyReport } from "./reports.js";
import { createReminderForTask } from "./reminders.js";
import { sendMessage, sendTypingAction } from "./telegram.js";
import { getOrCreateUser, supabaseGet, supabaseInsert, supabasePatch, updateUserAllowed } from "./supabase.js";
import { formatMoney, formatTashkentTime, normalizeText } from "./utils.js";
import { handleVoiceMessage } from "./voice.js";

export async function handleTelegramUpdate(env, update) {
  if (!update?.message) return;

  const message = update.message;
  const chatId = message.chat?.id;
  const telegramUserId = String(message.from?.id || "");
  const text = typeof message.text === "string" ? message.text.trim() : "";

  if (!chatId || !telegramUserId) return;

  const user = await getOrCreateUser(env, message);

  if (text.startsWith("/start")) {
    await handleStart(env, chatId, telegramUserId, text, user);
    return;
  }

  if (!user.is_allowed) {
    await sendMessage(env, chatId, BOT_MESSAGES.notAllowed);
    return;
  }

  if (text) {
    await handleTextMessage(env, chatId, user, text);
    return;
  }

  if (message.voice?.file_id) {
    await handleVoiceMessage(env, message, user, (transcribedText) =>
      handleTextMessage(env, chatId, user, transcribedText)
    );
    return;
  }

  await sendMessage(env, chatId, BOT_MESSAGES.unsupportedMessage);
}

export async function handleStart(env, chatId, telegramUserId, text, user) {
  const [, inviteCode] = text.trim().split(/\s+/);

  if (user.is_allowed) {
    await sendMessage(env, chatId, BOT_MESSAGES.alreadyRegistered);
    return;
  }

  if (inviteCode && inviteCode === env.INVITE_CODE) {
    await updateUserAllowed(env, telegramUserId, inviteCode);
    await sendMessage(env, chatId, BOT_MESSAGES.welcome);
    return;
  }

  await sendMessage(env, chatId, BOT_MESSAGES.inviteRequired);
}

export async function handleTextMessage(env, chatId, user, text) {
  if (!text) {
    await sendMessage(env, chatId, BOT_MESSAGES.unknown);
    return;
  }

  const intent = detectIntent(text);

  if (intent === "daily_report" || intent === "finance_query_today") {
    await sendTypingAction(env, chatId);
    await sendMessage(env, chatId, await generateDailyReport(env, user));
    return;
  }

  if (intent === "weekly_report" || intent === "finance_query_week") {
    await sendTypingAction(env, chatId);
    await sendMessage(env, chatId, await generateWeeklyReport(env, user));
    return;
  }

  if (intent === "monthly_report" || intent === "finance_query_month") {
    await sendTypingAction(env, chatId);
    await sendMessage(env, chatId, await generateMonthlyReport(env, user));
    return;
  }

  if (intent === "task_list") {
    await sendMessage(env, chatId, await buildPendingTasksText(env, user.id));
    return;
  }

  if (intent === "task_done") {
    await sendMessage(env, chatId, await markTaskDoneByText(env, user.id, extractTaskDoneQuery(text)));
    return;
  }

  await handleAuthorizedMessage(env, chatId, user, text);
}

export async function handleAuthorizedMessage(env, chatId, user, text) {
  try {
    await sendTypingAction(env, chatId);
    const parsed = sanitizeParsedData(await parseUserMessage(env, text), text);

    if (parsed.status === "needs_confirmation") {
      await sendMessage(env, chatId, buildNeedsConfirmationReply(parsed.originalText || text));
      return;
    }

    const saveResult = await saveParsedData(env, user.id, parsed, text);
    const reply = buildSaveReply(saveResult, parsed);
    await sendMessage(env, chatId, reply);
  } catch (error) {
    console.log("HANDLE_AUTHORIZED_ERROR", error.message);
    await sendMessage(env, chatId, BOT_MESSAGES.saveError);
  }
}

function buildNeedsConfirmationReply(transcribedText) {
  return `🤔 Summani aniq tushunmadim.\nMen quyidagicha eshitdim:\n"${transcribedText}"\n\nIltimos, summani matnda yozing yoki qayta ovozli yuboring.\nMasalan: 20 ming taksiga sarfladim`;
}

export async function handleCommand(env, chatId, user, text) {
  const normalized = normalizeText(text);

  if (["bugungi vazifalar", "vazifalarim", "/tasks"].includes(normalized)) {
    await sendMessage(env, chatId, await buildPendingTasksText(env, user.id));
    return true;
  }

  if (normalized.startsWith("bajarildi") || normalized.startsWith("qildim")) {
    const query = text.replace(/^(bajarildi|qildim)\s*/i, "").trim();
    await sendMessage(env, chatId, await markTaskDoneByText(env, user.id, query));
    return true;
  }

  if (normalized.startsWith("bekor qil")) {
    const query = text.replace(/^bekor qil\s*/i, "").trim();
    await sendMessage(env, chatId, await markTaskCancelledByText(env, user.id, query));
    return true;
  }

  if (isDailyReportCommand(normalized)) {
    await sendTypingAction(env, chatId);
    await sendMessage(env, chatId, await generateDailyReport(env, user));
    return true;
  }

  if (isWeeklyReportCommand(normalized)) {
    await sendTypingAction(env, chatId);
    await sendMessage(env, chatId, await generateWeeklyReport(env, user));
    return true;
  }

  if (isMonthlyReportCommand(normalized)) {
    await sendTypingAction(env, chatId);
    await sendMessage(env, chatId, await generateMonthlyReport(env, user));
    return true;
  }

  return false;
}

export function detectIntent(text) {
  const normalized = normalizeText(text);

  if (normalized.startsWith("/start")) return "start";

  if (isDailyReportCommand(normalized)) return "daily_report";
  if (isWeeklyReportCommand(normalized)) return "weekly_report";
  if (isMonthlyReportCommand(normalized)) return "monthly_report";

  if (/bugun qancha sarfladim|bugungi xarajatlar|bugungi kirim chiqim/.test(normalized)) {
    return "finance_query_today";
  }
  if (/bu hafta qancha sarfladim|haftalik xarajatlar/.test(normalized)) {
    return "finance_query_week";
  }
  if (/bu oy qancha sarfladim|oylik xarajatlar/.test(normalized)) {
    return "finance_query_month";
  }

  if (/^(bugungi vazifalar|vazifalarim|pending tasklar|bajarilmagan vazifalar)$/.test(normalized) ||
    normalized.includes("bugun nima qilishim kerak")) {
    return "task_list";
  }

  if (isTaskDoneIntent(normalized)) {
    return "task_done";
  }

  return "add_data";
}

export async function handleCallback() {
  return null;
}

async function saveParsedData(env, userId, parsed, originalText) {
  const result = {
    transactions: [],
    tasks: [],
    reminders: [],
    notes: [],
  };
  const savedReminderKeys = new Set();

  for (const item of parsed.transactions || []) {
    const inserted = await supabaseInsert(env, "transactions", {
      user_id: userId,
      type: item.type,
      amount: item.amount,
      currency: item.currency || "UZS",
      category: item.category || "other",
      note: item.note || originalText,
      transaction_at: item.transaction_at || new Date().toISOString(),
    });
    result.transactions.push(inserted || item);
  }

  for (const task of parsed.tasks || []) {
    const insertedTask = await supabaseInsert(env, "tasks", {
      user_id: userId,
      title: task.title,
      description: task.description || null,
      due_at: task.due_at || null,
      status: "pending",
      priority: task.priority || "medium",
    });
    result.tasks.push(insertedTask || task);

    if (task.due_at && task.remind_before_minutes) {
      const reminder = await createReminderForTask(
        env,
        userId,
        insertedTask?.id || null,
        task.title,
        task.due_at,
        task.remind_before_minutes
      );
      if (reminder) {
        savedReminderKeys.add(buildReminderKey(reminder.title, reminder.remind_at));
        result.reminders.push(reminder);
      }
    }
  }

  for (const reminder of parsed.reminders || []) {
    const reminderKey = buildReminderKey(reminder.title, reminder.remind_at);
    if (savedReminderKeys.has(reminderKey)) continue;

    const inserted = await supabaseInsert(env, "reminders", {
      user_id: userId,
      task_id: null,
      title: reminder.title,
      remind_at: reminder.remind_at,
      sent: false,
    });
    savedReminderKeys.add(reminderKey);
    result.reminders.push(inserted || reminder);
  }

  for (const note of parsed.notes || []) {
    const inserted = await supabaseInsert(env, "notes", {
      user_id: userId,
      content: note.content,
    });
    result.notes.push(inserted || note);
  }

  return result;
}

function buildReminderKey(title, remindAt) {
  return `${normalizeText(title)}:${remindAt}`;
}

function buildSaveReply(result, parsed) {
  const total =
    result.transactions.length +
    result.tasks.length +
    result.reminders.length +
    result.notes.length;

  if (total === 0) return BOT_MESSAGES.unknown;

  const lines = ["✅ Saqlandi."];

  for (const tx of parsed.transactions || []) {
    lines.push(
      `${tx.type === "income" ? "💵 Kirim" : "💸 Chiqim"}: ${formatMoney(tx.amount)} so'm — ${tx.category || "other"}`
    );
  }

  for (const task of result.tasks || []) {
    lines.push(`✅ Vazifa qo'shildi: ${task.title}`);
  }

  for (const reminder of result.reminders || []) {
    lines.push(`🔔 Eslatma: ${formatTashkentTime(reminder.remind_at)}`);
  }

  for (const note of result.notes || []) {
    lines.push(`📝 Qayd saqlandi: ${note.content}`);
  }

  return lines.join("\n");
}

async function buildPendingTasksText(env, userId) {
  const tasks = await supabaseGet(env, "tasks", {
    user_id: `eq.${userId}`,
    status: "eq.pending",
    select: "id,title,due_at,priority",
    order: "created_at.asc",
    limit: "20",
  });

  if (!tasks?.length) return "✅ Hozircha kutilayotgan vazifa yo'q.";

  const lines = ["📌 Kutilayotgan vazifalar:"];
  tasks.forEach((task, index) => {
    const time = task.due_at ? ` — ${formatTashkentTime(task.due_at)}` : "";
    lines.push(`${index + 1}. ${task.title}${time}`);
  });
  return lines.join("\n");
}

async function markTaskDoneByText(env, userId, query) {
  const task = await findPendingTask(env, userId, query);
  if (!task) return "🤔 Bunday kutilayotgan vazifa topilmadi.";

  await supabasePatch(
    env,
    "tasks",
    { id: `eq.${task.id}`, user_id: `eq.${userId}` },
    {
      status: "done",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  );

  return `✅ Bajarildi: ${task.title}`;
}

async function markTaskCancelledByText(env, userId, query) {
  const task = await findPendingTask(env, userId, query);
  if (!task) return "🤔 Bunday kutilayotgan vazifa topilmadi.";

  await supabasePatch(
    env,
    "tasks",
    { id: `eq.${task.id}`, user_id: `eq.${userId}` },
    {
      status: "cancelled",
      updated_at: new Date().toISOString(),
    }
  );

  return `🚫 Bekor qilindi: ${task.title}`;
}

async function findPendingTask(env, userId, query) {
  const tasks = await supabaseGet(env, "tasks", {
    user_id: `eq.${userId}`,
    status: "eq.pending",
    select: "*",
    order: "created_at.asc",
    limit: "30",
  });

  if (!tasks?.length) return null;
  const normalizedQuery = normalizeText(query);

  if (/^\d+$/.test(normalizedQuery)) {
    return tasks[Number(normalizedQuery) - 1] || null;
  }

  return tasks.find((task) => normalizeText(task.title).includes(normalizedQuery)) || null;
}

function isDailyReportCommand(text) {
  return /^(bugungi hisobot|kunlik hisobot|bugungi kunlik hisobot|bugungi kunlik hisobotni ber)$/.test(text) ||
    text.includes("bugun qancha sarfladim") ||
    text.includes("bugungi xarajatlar") ||
    text.includes("bugungi kirim chiqim") ||
    text.includes("daily report") ||
    text.includes("today report");
}

function isWeeklyReportCommand(text) {
  return text === "haftalik hisobot" ||
    text.includes("bu hafta hisobot") ||
    text.includes("bu hafta qancha sarfladim") ||
    text.includes("haftalik xarajatlar") ||
    text.includes("weekly report");
}

function isMonthlyReportCommand(text) {
  return text === "oylik hisobot" ||
    text.includes("bu oy hisobot") ||
    text.includes("bu oy qancha sarfladim") ||
    text.includes("oylik xarajatlar") ||
    text.includes("monthly report");
}

function isTaskDoneIntent(text) {
  if (/tugatishim kerak|qilishim kerak|bajarishim kerak/.test(text)) return false;
  if (/daromad qildim|foyda qildim/.test(text)) return false;
  return /(^|\s)(bajardim|tugatdim|qildim)(\.|$|\s)/.test(text);
}

function extractTaskDoneQuery(text) {
  return text
    .replace(/\b(bajardim|tugatdim|qildim)\b/gi, "")
    .trim();
}
