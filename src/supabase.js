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
    throw new Error("Supabase request failed");
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
