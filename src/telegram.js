export async function sendMessage(env, chatId, text, replyMarkup = null) {
  if (!chatId || !text) return null;

  const body = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    console.log("TELEGRAM_SEND_ERROR", JSON.stringify(data));
    throw new Error("Telegram sendMessage failed");
  }

  return data;
}

export async function editMessageText(env, chatId, messageId, text, replyMarkup = null) {
  if (!chatId || !messageId || !text) return null;

  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    console.log("TELEGRAM_EDIT_ERROR", JSON.stringify(data));
    return null;
  }

  return data;
}

export async function answerCallbackQuery(env, callbackQueryId, text = "") {
  if (!callbackQueryId) return null;

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: false,
      }),
    }
  );

  if (!response.ok) {
    console.log("TELEGRAM_CALLBACK_ANSWER_ERROR", await response.text().catch(() => ""));
  }

  return response;
}

export function inlineKeyboard(rows) {
  return {
    inline_keyboard: rows.map((row) =>
      row.map((button) => ({
        text: button.text,
        callback_data: button.callback_data,
      }))
    ),
  };
}

export function mainReplyKeyboard() {
  return {
    keyboard: [
      [{ text: "💸 Kirim-chiqim" }],
      [{ text: "✅ Rejalar" }, { text: "🔔 Eslatmalar" }],
      [{ text: "📝 Qaydlar" }, { text: "📜 Tarix" }],
      [{ text: "❓ Yordam" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export async function sendConfirmationMessage(env, chatId, text, pendingActionId) {
  return sendMessage(env, chatId, text, inlineKeyboard([
    [
      { text: "✅ Tasdiqlash", callback_data: `confirm:${pendingActionId}` },
      { text: "❌ Rad etish", callback_data: `reject:${pendingActionId}` },
    ],
  ]));
}

export async function sendTypingAction(env, chatId) {
  if (!chatId) return null;

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        action: "typing",
      }),
    }
  );

  if (!response.ok) {
    console.log("TELEGRAM_TYPING_ERROR", await response.text().catch(() => ""));
  }

  return response;
}
