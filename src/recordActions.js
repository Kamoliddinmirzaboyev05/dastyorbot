import { CATEGORY_LABELS } from "./constants.js";
import {
  deleteUserRecord,
  getUserRecord,
  updateUserRecord,
} from "./supabase.js";
import { inlineKeyboard, sendMessage } from "./telegram.js";
import { formatMoney, formatTashkentDateTime, normalizeText } from "./utils.js";

export function recordActionRows(records, type, options = {}) {
  return recordActionKeyboard(records.map((record) => ({ ...record, record_type: type })), options);
}

export function recordActionKeyboard(items, options = {}) {
  const rows = [];
  items.forEach((record, index) => {
    const number = index + 1;
    const type = record.record_type;
    const row = [];
    if (type === "task" && record.status !== "done") {
      row.push({ text: `${number} ✅`, callback_data: `done:task:${record.id}` });
    }
    row.push({ text: `${number} 🗑`, callback_data: `delete:${type}:${record.id}` });
    rows.push(row);
  });
  if (options.back !== false) {
    rows.push([{ text: "⬅️ Orqaga", callback_data: options.back || "menu:main" }]);
  }
  return inlineKeyboard(rows);
}

export async function handleRecordCallback(env, chatId, user, data) {
  const parts = data.split(":");
  const action = parts[0];

  if (action === "done" && parts[1] === "task") {
    return markTaskDoneById(env, chatId, user.id, parts[2]);
  }

  if (action === "delete") {
    return askDeleteConfirmation(env, chatId, user.id, parts[1], parts[2]);
  }

  if (action === "delete_confirm") {
    return confirmDelete(env, chatId, user.id, parts[1], parts[2]);
  }

  if (action === "delete_cancel") {
    await sendMessage(env, chatId, "❌ O'chirish bekor qilindi.");
    return true;
  }

  return false;
}

async function askDeleteConfirmation(env, chatId, userId, recordType, recordId) {
  const record = await getUserRecord(env, recordType, userId, recordId);
  if (!record) {
    await sendMessage(env, chatId, "Ma'lumot topilmadi yoki allaqachon o'chirilgan.");
    return true;
  }

  await sendMessage(
    env,
    chatId,
    `🗑 O'chirishni tasdiqlaysizmi?\n\n${summarizeRecord(recordType, record)}\n\nBu amalni ortga qaytarib bo'lmaydi.`,
    inlineKeyboard([[
      { text: "✅ Ha, o'chirish", callback_data: `delete_confirm:${recordType}:${recordId}` },
      { text: "❌ Bekor qilish", callback_data: `delete_cancel:${recordType}:${recordId}` },
    ]])
  );
  return true;
}

async function confirmDelete(env, chatId, userId, recordType, recordId) {
  const deleted = await deleteUserRecord(env, recordType, userId, recordId);
  await sendMessage(env, chatId, deleted ? "✅ O'chirildi." : "Ma'lumot topilmadi yoki allaqachon o'chirilgan.");
  return true;
}

async function markTaskDoneById(env, chatId, userId, taskId) {
  const task = await updateUserRecord(env, "task", userId, taskId, {
    status: "done",
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  await sendMessage(env, chatId, task ? "✅ Vazifa bajarildi deb belgilandi." : "Ma'lumot topilmadi yoki allaqachon o'chirilgan.");
  return true;
}


export function summarizeRecord(recordType, record) {
  if (recordType === "transaction") {
    return `${record.type === "income" ? "💵 Kirim" : "💸 Chiqim"}: ${formatMoney(record.amount)} so'm — ${CATEGORY_LABELS[record.category] || record.category || "other"}\n📝 ${record.note || ""}\n📅 ${formatTashkentDateTime(record.transaction_at || record.created_at)}`;
  }
  if (recordType === "task") {
    const due = record.due_at ? `\n🕒 Muddat: ${formatTashkentDateTime(record.due_at)}` : "";
    return `✅ Reja: ${record.title}${due}\n📌 Status: ${record.status || "pending"}`;
  }
  if (recordType === "reminder") {
    return `🔔 Eslatma: ${record.title}\n🕒 ${formatTashkentDateTime(record.remind_at)}`;
  }
  if (recordType === "note") {
    return `📝 Qayd:\n${record.content}`;
  }
  return "Ma'lumot";
}
