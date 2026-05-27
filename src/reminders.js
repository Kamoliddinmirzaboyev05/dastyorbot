import { sendMessage } from "./telegram.js";
import { supabaseGet, supabaseInsert, supabasePatch } from "./supabase.js";
import { formatTashkentTime } from "./utils.js";

export async function createReminderForTask(env, userId, taskId, title, dueAt, remindBeforeMinutes) {
  if (!dueAt || !remindBeforeMinutes) return null;

  const dueDate = new Date(dueAt);
  const remindAt = new Date(dueDate.getTime() - Number(remindBeforeMinutes) * 60 * 1000);

  if (Number.isNaN(remindAt.getTime())) return null;

  return supabaseInsert(env, "reminders", {
    user_id: userId,
    task_id: taskId || null,
    title,
    remind_at: remindAt.toISOString(),
    sent: false,
  });
}

export async function processDueReminders(env) {
  const allowedUsers = await supabaseGet(env, "users", {
    is_allowed: "eq.true",
    select: "id,chat_id",
  });
  let sentCount = 0;

  for (const user of allowedUsers || []) {
    const reminders = await supabaseGet(env, "reminders", {
      user_id: `eq.${user.id}`,
      sent: "eq.false",
      remind_at: `lte.${new Date().toISOString()}`,
      select: "*",
      order: "remind_at.asc",
      limit: "20",
    });

    for (const reminder of reminders || []) {
      try {
        await sendMessage(env, user.chat_id, `🔔 Eslatma: ${reminder.title}`);
        await supabasePatch(
          env,
          "reminders",
          { id: `eq.${reminder.id}`, user_id: `eq.${user.id}` },
          { sent: true, sent_at: new Date().toISOString() }
        );
        sentCount++;
      } catch (error) {
        console.log("REMINDER_SEND_ERROR", reminder.id, error.message);
      }
    }
  }

  return sentCount;
}

export function buildReminderSavedLine(reminder) {
  if (!reminder?.remind_at) return null;
  return `🔔 Eslatma: ${formatTashkentTime(reminder.remind_at)}`;
}
