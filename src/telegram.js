export async function sendMessage(env, chatId, text) {
  if (!chatId || !text) return null;

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    }
  );

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    console.log("TELEGRAM_SEND_ERROR", JSON.stringify(data));
    throw new Error("Telegram sendMessage failed");
  }

  return data;
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
