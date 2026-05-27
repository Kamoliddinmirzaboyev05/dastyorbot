import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
  SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";
import { detectIntent } from "../src/handlers.js";
import { parseSimpleFinanceText, parseUserMessage, parseUzbekMoneyAmount, sanitizeParsedData } from "../src/parser.js";
import { scoreTranscriptionCandidate, selectBestTranscription } from "../src/voice.js";

describe("DastyorBot worker", () => {
  it("responds with health text for non-POST requests (unit style)", async () => {
    const request = new Request("http://example.com");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);

    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("DastyorBot ishlayapti ✅");
  });

  it("responds with health text for non-POST requests (integration style)", async () => {
    const response = await SELF.fetch("http://example.com");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("DastyorBot ishlayapti ✅");
  });
});

describe("deterministic finance parser", () => {
  it("parses transport expense before Groq is needed", () => {
    const parsed = parseSimpleFinanceText("Bugun 35 ming taksiga sarfladim");

    expect(parsed.transactions).toMatchObject([
      {
        type: "expense",
        amount: 35000,
        category: "transport",
      },
    ]);
  });

  it("parses food expense", () => {
    const parsed = parseSimpleFinanceText("Bugun 50 ming tushlikka ketdi");

    expect(parsed.transactions).toMatchObject([
      {
        type: "expense",
        amount: 50000,
        category: "food",
      },
    ]);
  });

  it("parses salary income with mln unit", () => {
    const parsed = parseSimpleFinanceText("Bugun 1 mln oylik oldim");

    expect(parsed.transactions).toMatchObject([
      {
        type: "income",
        amount: 1000000,
        category: "salary",
      },
    ]);
  });

  it("parses business income", () => {
    const parsed = parseSimpleFinanceText("Bugun 200 ming daromad qildim");

    expect(parsed.transactions).toMatchObject([
      {
        type: "income",
        amount: 200000,
        category: "business",
      },
    ]);
  });

  it("parses education expense", () => {
    const parsed = parseSimpleFinanceText("100 ming kitobga sarfladim");

    expect(parsed.transactions).toMatchObject([
      {
        type: "expense",
        amount: 100000,
        category: "education",
      },
    ]);
  });

  it("keeps categories separate in mixed finance text", () => {
    const parsed = parseSimpleFinanceText("Bugun 30 ming taksiga, 50 ming tushlikka sarfladim");

    expect(parsed.transactions).toMatchObject([
      { type: "expense", amount: 30000, category: "transport" },
      { type: "expense", amount: 50000, category: "food" },
    ]);
  });

  it("parses Uzbek word amounts", () => {
    expect(parseUzbekMoneyAmount("yigirma ming")).toMatchObject({
      amount: 20000,
      confidence: "high",
    });
    expect(parseUzbekMoneyAmount("yigirmam in taksiga xarajat qildim")).toMatchObject({
      amount: 20000,
      confidence: "high",
    });
    expect(parseUzbekMoneyAmount("ottiz besh ming taksiga sarfladim")).toMatchObject({
      amount: 35000,
      confidence: "high",
    });
    expect(parseUzbekMoneyAmount("ellik ming tushlikka ketdi")).toMatchObject({
      amount: 50000,
      confidence: "high",
    });
    expect(parseUzbekMoneyAmount("bir mln oylik oldim")).toMatchObject({
      amount: 1000000,
      confidence: "high",
    });
  });

  it("does not invent an amount when unclear", () => {
    expect(parseUzbekMoneyAmount("taksiga xarajat qildim")).toMatchObject({
      amount: null,
      confidence: "low",
    });

    expect(parseSimpleFinanceText("taksiga xarajat qildim")).toMatchObject({
      status: "needs_confirmation",
      reason: "amount_unclear",
    });
  });

  it("parses imperfect Uzbek voice transcription without guessing", () => {
    const parsed = parseSimpleFinanceText("Men yigirmam in taksiyya harajat qalda");

    expect(parsed.transactions).toMatchObject([
      {
        type: "expense",
        amount: 20000,
        category: "transport",
      },
    ]);
  });

  it("parses screenshot-style Whisper transcription accurately", () => {
    const parsed = parseSimpleFinanceText("Bugun 30 min tüslikke sarifladam");

    expect(parsed.transactions).toMatchObject([
      {
        type: "expense",
        amount: 30000,
        category: "food",
      },
    ]);
  });

  it("requires confirmation for small digit amounts without a unit", () => {
    expect(parseSimpleFinanceText("Bugun 30 tushlikka sarfladim")).toMatchObject({
      status: "needs_confirmation",
      reason: "amount_unclear",
    });
  });

  it("parses English Whisper money transcription without multiplying it", () => {
    const parsed = parseSimpleFinanceText("I spent $45,000 for a taxi.");

    expect(parsed.transactions).toMatchObject([
      {
        type: "expense",
        amount: 45000,
        category: "transport",
      },
    ]);
  });

  it("parses comma thousand separators as one amount", () => {
    expect(parseUzbekMoneyAmount("$45,000")).toMatchObject({
      amount: 45000,
      confidence: "high",
    });
  });
});

describe("deterministic task parser", () => {
  it("parses common Uzbek task text without Groq", async () => {
    const parsed = await parseUserMessage({}, "Bugun 20:00 da ingliz tili o‘qishim kerak");

    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0]).toMatchObject({
      title: "ingliz tili o'qish",
      priority: "medium",
    });
    expect(parsed.tasks[0].due_at).toEqual(expect.any(String));
  });

  it("parses relative reminder text without treating the number as money", async () => {
    const parsed = await parseUserMessage({}, "1 dakikadan uxlashim haqida isilatma bir");

    expect(parsed.transactions).toHaveLength(0);
    expect(parsed.reminders).toHaveLength(1);
    expect(parsed.reminders[0]).toMatchObject({
      title: "uxlash",
    });
    expect(parsed.reminders[0].remind_at).toEqual(expect.any(String));
  });

  it("does not ask for money confirmation on report text", async () => {
    const parsed = await parseUserMessage({}, "I need daily report");

    expect(parsed.status).not.toBe("needs_confirmation");
  });

  it("creates a plain task without reminder or note", async () => {
    const parsed = sanitizeParsedData(
      await parseUserMessage({}, "bugun ingliz tili reading ni tugatishim kerak"),
      "bugun ingliz tili reading ni tugatishim kerak"
    );

    expect(parsed.tasks).toMatchObject([
      { title: "ingliz tili reading ni tugatish" },
    ]);
    expect(parsed.reminders).toHaveLength(0);
    expect(parsed.notes).toHaveLength(0);
  });

  it("keeps due task without reminder when reminder is not requested", async () => {
    const parsed = sanitizeParsedData(
      await parseUserMessage({}, "bugun 20:00 da dars qilishim kerak"),
      "bugun 20:00 da dars qilishim kerak"
    );

    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].due_at).toEqual(expect.any(String));
    expect(parsed.tasks[0].remind_before_minutes).toBeNull();
    expect(parsed.reminders).toHaveLength(0);
  });

  it("keeps task reminder only when reminder is explicit", async () => {
    const parsed = sanitizeParsedData(
      await parseUserMessage({}, "bugun 20:00 da dars qilishim kerak 10 daqiqa oldin eslat"),
      "bugun 20:00 da dars qilishim kerak 10 daqiqa oldin eslat"
    );

    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].remind_before_minutes).toBe(10);
    expect(parsed.notes).toHaveLength(0);
  });
});

describe("intent routing", () => {
  it("detects report queries before parser/save", () => {
    expect(detectIntent("bugungi kunlik hisobotni ber")).toBe("daily_report");
    expect(detectIntent("bugungi hisobot")).toBe("daily_report");
    expect(detectIntent("bugun qancha sarfladim?")).toBe("daily_report");
    expect(detectIntent("haftalik xarajatlar")).toBe("weekly_report");
    expect(detectIntent("oylik xarajatlar")).toBe("monthly_report");
  });

  it("detects task list and done without confusing future task text", () => {
    expect(detectIntent("bugungi vazifalar")).toBe("task_list");
    expect(detectIntent("readingni tugatdim")).toBe("task_done");
    expect(detectIntent("bugun ingliz tili reading ni tugatishim kerak")).toBe("add_data");
    expect(detectIntent("Bugun 200 ming daromad qildim")).toBe("add_data");
  });
});

describe("voice transcription candidate selection", () => {
  it("prefers a parsable finance transcription over garbled text", () => {
    const best = selectBestTranscription([
      { text: "Prüzi, girmami", score: scoreTranscriptionCandidate("Prüzi, girmami"), attempt: { model: "a" } },
      { text: "Bugun 20 ming taksiga sarfladim", score: scoreTranscriptionCandidate("Bugun 20 ming taksiga sarfladim"), attempt: { model: "b" } },
    ]);

    expect(best.text).toBe("Bugun 20 ming taksiga sarfladim");
  });

  it("scores garbled short-word transcription lower", () => {
    expect(scoreTranscriptionCandidate("Bar yu zi ger ma mi")).toBeLessThan(
      scoreTranscriptionCandidate("Bugun 30 ming tushlikka sarfladim")
    );
  });
});
