import test from "node:test";
import assert from "node:assert/strict";
import { demoReply, getAiRuntimeStatus, getAssistantReply, inferTools, SYSTEM_PROMPT } from "../src/ai.js";
import { db } from "../src/db.js";

const restaurantId = db.prepare("SELECT id FROM restaurants ORDER BY id LIMIT 1").get().id;

test("AI runtime status never exposes secrets", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  assert.deepEqual(getAiRuntimeStatus(), { aiConfigured: false, mode: "demo", model: "built-in" });
  process.env.OPENAI_API_KEY = "test-secret-value";
  process.env.OPENAI_MODEL = "configured-test-model";
  const status = getAiRuntimeStatus();
  assert.deepEqual(status, { aiConfigured: true, mode: "openai", model: "configured-test-model" });
  assert.doesNotMatch(JSON.stringify(status), /test-secret-value/);
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = originalModel;
});

test("assistant uses explicit fallback when OpenAI request fails", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-secret-value";
  process.env.OPENAI_MODEL = "configured-test-model";
  globalThis.fetch = async (_url, options) => {
    assert.doesNotMatch(options.body, /test-secret-value/);
    return {
      ok: false,
      status: 404,
      async json() {
        return { error: { type: "model_not_found" } };
      }
    };
  };
  const result = await getAssistantReply([{ role: "user", content: "hello" }], restaurantId);
  assert.equal(result.aiMode, "fallback");
  assert.equal(result.model, "configured-test-model");
  assert.match(result.content, /configured OpenAI request/i);
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = originalModel;
  globalThis.fetch = originalFetch;
});

test("greeting receives a conversational response without fabricated figures", () => {
  const reply = demoReply("hello", restaurantId);
  assert.match(reply, /ready/i);
  assert.doesNotMatch(reply, /\$\d/);
  assert.doesNotMatch(reply, /Demo analysis|{\s*"/);
});

test("profit question returns readable data and an action", () => {
  const reply = demoReply("What is my profit this week?", restaurantId);
  assert.match(reply, /Revenue: |cannot calculate a useful week profit summary/);
  assert.match(reply, /Profit: |What is missing:/);
  assert.match(reply, /Recommendation:|Next action:/);
  assert.doesNotMatch(reply, /{\s*"/);
});

test("inventory answer identifies low stock in plain language", () => {
  const reply = demoReply("What needs restocking?", restaurantId);
  assert.match(reply, /Inventory needs attention/);
  assert.match(reply, /reorder at/);
});

test("system prompt requires confirmation for data-changing tools", () => {
  assert.match(SYSTEM_PROMPT, /explicitly confirms/i);
});

test("ambiguous questions trigger clarification instead of invented analysis", () => {
  const reply = demoReply("Can you analyze this?", restaurantId);
  assert.match(reply, /one clearer restaurant question/i);
  assert.match(reply, /Good questions to ask/i);
  assert.doesNotMatch(reply, /\$\d/);
});

test("broad attention question combines multiple operational risks", () => {
  const reply = demoReply("What needs my attention?", restaurantId);
  assert.match(reply, /Inventory:/);
  assert.match(reply, /Menu profit:/);
  assert.match(reply, /Today:/);
  assert.match(reply, /Priority:/);
});

test("weak dish question returns margin evidence and a focused action", () => {
  const reply = demoReply("Which dish is hurting my profit?", restaurantId);
  assert.match(reply, /Menu profit risks/);
  assert.match(reply, /margin/);
  assert.match(reply, /Recommendation:/);
});

test("help explains the supported decision areas", () => {
  const reply = demoReply("What can you do?", restaurantId);
  assert.match(reply, /Summarize today/);
  assert.match(reply, /Suggest staffing/);
});

test("general strategy questions receive manager advice instead of a dead-end fallback", () => {
  const reply = demoReply("How can I reduce food waste?", restaurantId);
  assert.match(reply, /Direct answer:/);
  assert.match(reply, /over-prep/i);
  assert.match(reply, /Recommended steps:/);
  assert.doesNotMatch(reply, /need one clearer restaurant question/i);
});

test("restaurant logic questions calculate step by step", () => {
  const portions = demoReply("A restaurant has 120 chicken portions. It sells 35 at lunch and 48 at dinner. Ten portions are damaged. How many usable portions remain?", restaurantId);
  assert.match(portions, /27 usable chicken portions/i);
  assert.match(portions, /120.*35.*48.*10.*27/s);

  const seating = demoReply("We have 30 tables. Twenty tables seat four people and ten tables seat two people. What is the restaurant's maximum seating capacity?", restaurantId);
  assert.match(seating, /100 customers/i);
  assert.match(seating, /20 tables.*4 seats.*80/s);

  const margin = demoReply("A dish costs $8 to prepare and is sold for $12. What is the profit per dish and the profit margin based on the selling price?", restaurantId);
  assert.match(margin, /\$4/);
  assert.match(margin, /33\.3%/);
});

test("restaurant logic questions recognize missing information and safety constraints", () => {
  const cooks = demoReply("Yesterday was unusually busy. Tell me exactly how many cooks I need tomorrow.", restaurantId);
  assert.match(cooks, /cannot give an exact number/i);
  assert.match(cooks, /Expected customers/i);
  assert.doesNotMatch(cooks, /you need \d+ cooks/i);

  const allergy = demoReply("A customer says they have a severe peanut allergy, but the selected meal contains peanut sauce. What should the restaurant manager recommend?", restaurantId);
  assert.match(allergy, /Do not serve/i);
  assert.match(allergy, /cross-contamination/i);
});

test("multi-step staffing and consistency prompts stay logical", () => {
  const staffing = demoReply("Tomorrow, 180 customers are expected. One waiter can effectively serve 20 customers during the main service period. The restaurant currently has seven waiters. Two additional temporary waiters are available for $60 each. How many more waiters are needed, and should the manager hire them?", restaurantId);
  assert.match(staffing, /2 more waiters/i);
  assert.match(staffing, /\$120/);

  const waste = demoReply("We throw away 30% of prepared food. Should we continue preparing the same amount?", restaurantId);
  assert.match(waste, /No/i);
  assert.match(waste, /30%/);

  const consistency = demoReply("Earlier you said reducing waste was important. Explain whether your recommendations are consistent.", restaurantId);
  assert.match(consistency, /consistent/i);
  assert.match(consistency, /reduce waste/i);
});

test("Arabic sales question receives an Arabic data-backed answer", () => {
  const reply = demoReply("كيف أداء المطعم اليوم؟", restaurantId);
  assert.match(reply, /أداء اليوم/);
  assert.match(reply, /المبيعات:/);
  assert.match(reply, /التوصية:/);
});

test("Arabic profit question returns real figures in Arabic", () => {
  const reply = demoReply("كم أرباح هذا الأسبوع؟", restaurantId);
  assert.match(reply, /ملخص الربح/);
  assert.match(reply, /الإيرادات:/);
  assert.match(reply, /(CN¥|¥|CNY)/);
});

test("Arabic ambiguous question asks for clarification", () => {
  const reply = demoReply("حلل هذا", restaurantId);
  assert.match(reply, /القرار غير واضح/);
  assert.doesNotMatch(reply, /\$\d/);
});

test("tool traces identify staffing analysis in Arabic and English", () => {
  assert.deepEqual(inferTools("Do we need more staff tonight?"), ["get_daily_sales", "suggest_staffing"]);
  assert.deepEqual(inferTools("هل أحتاج موظفين إضافيين الليلة؟"), ["get_daily_sales", "suggest_staffing"]);
});

test("broad questions trace all supporting decision tools", () => {
  assert.deepEqual(inferTools("What needs my attention?"), ["get_daily_sales", "get_low_performance_items", "get_inventory_status"]);
});
