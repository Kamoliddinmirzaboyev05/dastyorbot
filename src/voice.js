import { sendMessage, sendTypingAction } from "./telegram.js";
import { parseSimpleFinanceText, parseUzbekMoneyAmount } from "./parser.js";
import { normalizeUzbekText } from "./utils.js";

const MAX_VOICE_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const TRANSCRIPTION_PROMPT =
  "Uzbek Latin speech. Do not translate. Preserve numbers exactly as spoken. Common words: ming, million, taksi, tushlik, sarfladim, xarajat qildim, oylik oldim.";
const TRANSCRIPTION_ATTEMPTS = [
  { model: "whisper-large-v3", language: "uz" },
];

export async function getTelegramFilePath(env, fileId) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const data = await response.json().catch(() => null);

  if (!response.ok || data?.ok === false || !data?.result?.file_path) {
    console.log("TELEGRAM_GET_FILE_ERROR", JSON.stringify(data));
    throw new Error("Telegram getFile failed");
  }

  return data.result.file_path;
}

export async function downloadTelegramFile(env, filePath) {
  const response = await fetch(
    `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`
  );

  if (!response.ok) {
    console.log("TELEGRAM_FILE_DOWNLOAD_ERROR", response.status);
    throw new Error("Telegram file download failed");
  }

  return response.blob();
}

export async function transcribeWithGroq(env, audioBlob) {
  const candidates = [];
  let lastError = null;

  for (const attempt of TRANSCRIPTION_ATTEMPTS) {
    try {
      const text = await transcribeWithGroqAttempt(env, audioBlob, attempt);
      candidates.push({
        text,
        score: scoreTranscriptionCandidate(text),
        attempt,
      });

      if (candidates[candidates.length - 1].score >= 100) break;
    } catch (error) {
      lastError = error;
      console.log("GROQ_TRANSCRIPTION_ATTEMPT_ERROR", attempt.model, attempt.language || "auto", error.message);
    }
  }

  const best = selectBestTranscription(candidates);
  if (best) {
    console.log("VOICE_TRANSCRIPTION_SELECTED", best.attempt.model, best.attempt.language || "auto", best.score);
    return best.text;
  }

  throw lastError || new Error("Groq transcription failed");
}

export function selectBestTranscription(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  return [...candidates]
    .filter((candidate) => candidate?.text)
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length)[0] || null;
}

export function scoreTranscriptionCandidate(text) {
  const normalized = normalizeUzbekText(text);
  const finance = parseSimpleFinanceText(text);
  const amount = parseUzbekMoneyAmount(text);
  let score = 0;

  if (finance.transactions?.length > 0) score += 100;
  if (finance.status === "needs_confirmation") score += 25;
  if (amount.confidence === "high") score += 30;
  if (amount.confidence === "medium") score += 15;
  if (/(ming|mln|million|\$|so'm|som)/.test(normalized)) score += 10;
  if (/(taksi|taxi|tushlik|xarajat|sarfladim|spent|paid|oylik|daromad)/.test(normalized)) score += 10;
  if (normalized.length >= 12) score += 5;

  const shortWordCount = normalized.split(/\s+/).filter((word) => word.length <= 2).length;
  if (shortWordCount >= 4) score -= 20;
  if (/[ü]/.test(String(text).toLowerCase())) score -= 3;

  return score;
}

async function transcribeWithGroqAttempt(env, audioBlob, attempt) {
  const formData = new FormData();
  formData.append("file", audioBlob, "voice.ogg");
  formData.append("model", attempt.model);
  if (attempt.language) {
    formData.append("language", attempt.language);
  }
  formData.append("prompt", TRANSCRIPTION_PROMPT);
  formData.append("response_format", "json");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: formData,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.text) {
    console.log("GROQ_TRANSCRIPTION_ERROR", JSON.stringify(data));
    throw new Error("Groq transcription failed");
  }

  return String(data.text).trim();
}

export async function handleVoiceMessage(env, message, user, processText) {
  const chatId = message.chat?.id;
  const fileId = message.voice?.file_id;
  const fileSize = Number(message.voice?.file_size || 0);

  if (!chatId || !fileId) return;

  try {
    if (fileSize > MAX_VOICE_FILE_SIZE_BYTES) {
      throw new Error("Voice file too large");
    }

    await sendTypingAction(env, chatId);
    const filePath = await getTelegramFilePath(env, fileId);
    const audioBlob = await downloadTelegramFile(env, filePath);
    const text = await transcribeWithGroq(env, audioBlob);

    if (!text) {
      await sendMessage(
        env,
        chatId,
        "❌ Ovozli xabarni matnga aylantira olmadim. Qaytadan yuborib ko'ring."
      );
      return;
    }

    await sendMessage(
      env,
      chatId,
      `🎙 Ovozli xabar matnga aylantirildi:\n"${text}"\n\n⏳ Tahlil qilyapman...`
    );

    await processText(text);
  } catch (error) {
    console.log("VOICE_MESSAGE_ERROR", error.message);
    await sendMessage(
      env,
      chatId,
      error.message.includes("download") ||
        error.message.includes("getFile") ||
        error.message.includes("too large")
        ? "❌ Ovozli xabarni yuklab olishda xatolik bo'ldi."
        : "❌ Ovozli xabarni matnga aylantira olmadim. Qaytadan yuborib ko'ring."
    );
  }
}
