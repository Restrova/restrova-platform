import assert from "node:assert/strict";

// The evaluation dataset relies on the seeded demo restaurant. Set the flag
// before importing the database module (imports are evaluated eagerly).
process.env.ENABLE_DEMO_SEED = process.env.ENABLE_DEMO_SEED || "true";

const { db } = await import("../../02-backend/server/src/db.js");
const { demoReply, inferTools, SYSTEM_PROMPT } = await import("../../02-backend/server/src/ai.js");
const { evaluationDataset } = await import("./dataset.js");

const restaurantId = db.prepare("SELECT id FROM restaurants ORDER BY id LIMIT 1").get().id;
const failures = [];
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const scenario of evaluationDataset) {
  try {
    assert.deepEqual(inferTools(scenario.question), scenario.expected_tools, `${scenario.id}: incorrect tool route`);
    const answer = demoReply(scenario.question, restaurantId);
    assert.ok(answer.trim().length >= 20, `${scenario.id}: answer is too short`);
    if (scenario.language === "ar") assert.match(answer, /[\u0600-\u06FF]/, `${scenario.id}: answer should be Arabic`);
    if (scenario.must_not_invent_numbers)
      assert.doesNotMatch(answer, /\$\d/, `${scenario.id}: invented a financial figure`);
    if (scenario.requires_confirmation)
      assert.match(answer, /confirm|تأكيد|تؤكد/i, `${scenario.id}: action lacks confirmation`);
    if (scenario.must_include) {
      scenario.must_include.forEach((phrase) =>
        assert.match(answer, new RegExp(escapeRegExp(phrase), "i"), `${scenario.id}: answer should include "${phrase}"`)
      );
    }
    if (scenario.must_not_include) {
      scenario.must_not_include.forEach((phrase) =>
        assert.doesNotMatch(
          answer,
          new RegExp(escapeRegExp(phrase), "i"),
          `${scenario.id}: answer must not include "${phrase}"`
        )
      );
    }
  } catch (error) {
    failures.push(error.message);
  }
}

assert.match(SYSTEM_PROMPT, /same language/i, "Prompt must preserve the owner's language");
assert.match(SYSTEM_PROMPT, /explicitly confirms/i, "Prompt must enforce action confirmation");
assert.match(SYSTEM_PROMPT, /calm human manager/i, "Prompt must enforce human manager answer style");
assert.match(SYSTEM_PROMPT, /conversation guidance/i, "Prompt must use conversational guidance when relevant");
assert.match(SYSTEM_PROMPT, /answer like ChatGPT/i, "Prompt must enforce ChatGPT-like answers");
assert.match(SYSTEM_PROMPT, /private quality pass/i, "Prompt must require thinking before answering");
assert.match(
  SYSTEM_PROMPT,
  /strategy, setup, training, marketing, service/i,
  "Prompt must support non-numeric restaurant advice"
);

console.log(
  `Restaurant manager evals: ${evaluationDataset.length - failures.length}/${evaluationDataset.length} passed`
);
if (failures.length) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
