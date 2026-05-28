import { buildQuery } from "./utils.js";

export function supabaseHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function supabaseFetch(env, path, options = {}) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: supabaseHeaders(env, options.headers || {}),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.log("SUPABASE_ERROR", path, response.status, JSON.stringify(data));
    const error = new Error(data?.message || "Supabase request failed");
    error.status = response.status;
    error.code = data?.code || "";
    error.details = data?.details || "";
    error.hint = data?.hint || "";
    error.path = path;
    throw error;
  }

  return data;
}

export async function supabaseGet(env, table, params = {}) {
  const query = buildQuery(params);
  return supabaseFetch(env, `${table}${query ? `?${query}` : ""}`, {
    method: "GET",
  });
}

export async function supabaseInsert(env, table, payload) {
  const data = await supabaseFetch(env, table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  return Array.isArray(data) ? data[0] : data;
}

export async function supabasePatch(env, table, filters, payload) {
  const query = buildQuery(filters);
  return supabaseFetch(env, `${table}?${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
}

export async function supabaseDelete(env, table, filters) {
  const query = buildQuery(filters);
  return supabaseFetch(env, `${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
}

export async function getOrCreateUser(env, message) {
  const telegramUserId = String(message?.from?.id || "");
  if (!telegramUserId) throw new Error("Telegram user id missing");

  const users = await supabaseGet(env, "users", {
    telegram_user_id: `eq.${telegramUserId}`,
    select: "*",
    limit: "1",
  });

  if (Array.isArray(users) && users.length > 0) {
    await updateLastSeen(env, telegramUserId);
    return users[0];
  }

  return supabaseInsert(env, "users", {
    telegram_user_id: telegramUserId,
    chat_id: String(message.chat.id),
    first_name: message.from.first_name || null,
    last_name: message.from.last_name || null,
    username: message.from.username || null,
    is_allowed: false,
    is_admin: false,
    last_seen_at: new Date().toISOString(),
  });
}

export async function getAllowedUserByTelegramId(env, telegramUserId) {
  const rows = await supabaseGet(env, "users", {
    telegram_user_id: `eq.${String(telegramUserId)}`,
    is_allowed: "eq.true",
    select: "*",
    limit: "1",
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function updateUserAllowed(env, telegramUserId, inviteCode) {
  const rows = await supabasePatch(
    env,
    "users",
    { telegram_user_id: `eq.${telegramUserId}` },
    {
      is_allowed: true,
      invite_code_used: inviteCode,
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    }
  );

  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateLastSeen(env, telegramUserId) {
  await supabasePatch(
    env,
    "users",
    { telegram_user_id: `eq.${telegramUserId}` },
    { last_seen_at: new Date().toISOString() }
  );
}

export async function getAllowedUsers(env) {
  return supabaseGet(env, "users", {
    is_allowed: "eq.true",
    select: "*",
  });
}

export async function getTransactionsForRange(env, userId, start, end) {
  return supabaseGet(env, "transactions", {
    user_id: `eq.${userId}`,
    transaction_at: `gte.${start}`,
    select: "*",
    order: "transaction_at.desc",
  }).then((rows) => (rows || []).filter((row) => row.transaction_at < end));
}

export async function getRecentTransactions(env, userId, limit = 5) {
  return supabaseGet(env, "transactions", {
    user_id: `eq.${userId}`,
    select: "*",
    order: "transaction_at.desc",
    limit: String(limit),
  });
}

export async function getTasksByStatus(env, userId, status, limit = 10) {
  return supabaseGet(env, "tasks", {
    user_id: `eq.${userId}`,
    status: `eq.${status}`,
    select: "*",
    order: status === "done" ? "completed_at.desc" : "created_at.asc",
    limit: String(limit),
  });
}

export async function getTodayTasks(env, userId, start, end) {
  const rows = await supabaseGet(env, "tasks", {
    user_id: `eq.${userId}`,
    due_at: `gte.${start}`,
    select: "*",
    order: "due_at.asc",
    limit: "20",
  });
  return (rows || []).filter((task) => task.due_at && task.due_at < end);
}

export async function getActiveReminders(env, userId, limit = 10) {
  return supabaseGet(env, "reminders", {
    user_id: `eq.${userId}`,
    sent: "eq.false",
    remind_at: `gte.${new Date().toISOString()}`,
    select: "*",
    order: "remind_at.asc",
    limit: String(limit),
  });
}

export async function getTodayReminders(env, userId, start, end) {
  const rows = await supabaseGet(env, "reminders", {
    user_id: `eq.${userId}`,
    remind_at: `gte.${start}`,
    select: "*",
    order: "remind_at.asc",
    limit: "20",
  });
  return (rows || []).filter((reminder) => reminder.remind_at < end);
}

export async function getRecentNotes(env, userId, limit = 5) {
  return supabaseGet(env, "notes", {
    user_id: `eq.${userId}`,
    select: "*",
    order: "created_at.desc",
    limit: String(limit),
  });
}

export async function createPendingAction(env, userId, chatId, actionType, payload, originalText, transcribedText = null) {
  return supabaseInsert(env, "pending_actions", {
    user_id: userId,
    chat_id: String(chatId),
    action_type: actionType,
    payload,
    original_text: originalText,
    transcribed_text: transcribedText,
    status: "pending",
  });
}

export function isMissingPendingActionsTableError(error) {
  return error?.path?.startsWith("pending_actions") &&
    (error.status === 404 || error.code === "42P01" || /pending_actions/i.test(error.message || ""));
}

export async function getPendingAction(env, pendingActionId) {
  const rows = await supabaseGet(env, "pending_actions", {
    id: `eq.${pendingActionId}`,
    select: "*",
    limit: "1",
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function updatePendingActionStatus(env, pendingActionId, status) {
  const rows = await supabasePatch(
    env,
    "pending_actions",
    { id: `eq.${pendingActionId}` },
    {
      status,
      updated_at: new Date().toISOString(),
    }
  );
  return Array.isArray(rows) ? rows[0] || null : rows;
}

const RECORD_TABLES = {
  transaction: "transactions",
  task: "tasks",
  reminder: "reminders",
  note: "notes",
};

export function getRecordTable(recordType) {
  return RECORD_TABLES[recordType] || null;
}

export async function getUserRecord(env, recordType, userId, recordId) {
  const table = getRecordTable(recordType);
  if (!table) return null;
  const rows = await supabaseGet(env, table, {
    id: `eq.${recordId}`,
    user_id: `eq.${userId}`,
    select: "*",
    limit: "1",
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function updateUserRecord(env, recordType, userId, recordId, payload) {
  const table = getRecordTable(recordType);
  if (!table) return null;
  const rows = await supabasePatch(
    env,
    table,
    { id: `eq.${recordId}`, user_id: `eq.${userId}` },
    payload
  );
  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function deleteUserRecord(env, recordType, userId, recordId) {
  const table = getRecordTable(recordType);
  if (!table) return null;
  const rows = await supabaseDelete(env, table, {
    id: `eq.${recordId}`,
    user_id: `eq.${userId}`,
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}
