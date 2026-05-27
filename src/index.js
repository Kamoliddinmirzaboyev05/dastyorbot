import { handleTelegramUpdate } from "./handlers.js";
import { sendScheduledReports } from "./reports.js";
import { processDueReminders } from "./reminders.js";

const DAILY_REPORT_CRON = "30 17 * * *";
const WEEKLY_REPORT_CRON = "0 17 * * SUN";
const MONTHLY_REPORT_CRON = "0 4 1 * *";

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("DastyorBot ishlayapti ✅", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    try {
      const update = await request.json().catch(() => null);
      if (!update) return new Response("ok");

      await handleTelegramUpdate(env, update);
      return new Response("ok");
    } catch (error) {
      console.log("WORKER_FETCH_ERROR", error.message);
      return new Response("ok");
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event, env));
  },
};

async function handleScheduled(event, env) {
  try {
    const remindersSent = await processDueReminders(env);
    console.log("SCHEDULED_REMINDERS_SENT", remindersSent);

    if (event.cron === DAILY_REPORT_CRON) {
      const count = await sendScheduledReports(env, "daily");
      console.log("SCHEDULED_DAILY_REPORTS_SENT", count);
    }

    if (event.cron === WEEKLY_REPORT_CRON) {
      const count = await sendScheduledReports(env, "weekly");
      console.log("SCHEDULED_WEEKLY_REPORTS_SENT", count);
    }

    if (event.cron === MONTHLY_REPORT_CRON) {
      const count = await sendScheduledReports(env, "monthly");
      console.log("SCHEDULED_MONTHLY_REPORTS_SENT", count);
    }
  } catch (error) {
    console.log("WORKER_SCHEDULED_ERROR", error.message);
  }
}
