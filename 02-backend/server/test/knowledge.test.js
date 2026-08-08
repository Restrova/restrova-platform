import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db.js";
import { importKnowledgeDocument, knowledgeStatus, searchKnowledgeBase } from "../src/knowledge.js";
import { executeTool } from "../src/tools.js";
import { inferTools, SYSTEM_PROMPT } from "../src/ai.js";

const restaurantId = db.prepare("SELECT id FROM restaurants ORDER BY id LIMIT 1").get().id;

test("knowledge documents are chunked, searchable, and restaurant scoped", () => {
  const title = `Service Manual ${Date.now()}`;
  const result = importKnowledgeDocument({
    title,
    source: "owner-upload",
    content: "Hospitality rule: greet every guest within thirty seconds and confirm allergies before order entry."
  }, restaurantId);
  try {
    assert.equal(result.chunks, 1);
    assert.ok(knowledgeStatus(restaurantId).documents >= 1);
    const hits = searchKnowledgeBase("allergies guest greeting", restaurantId);
    assert.equal(hits[0].title, title);
    assert.match(hits[0].excerpt, /confirm allergies/);
  } finally {
    db.prepare("DELETE FROM knowledge_documents WHERE id=?").run(result.document_id);
  }
});

test("knowledge search is available as an AI tool", () => {
  assert.deepEqual(inferTools("What does the service manual say about allergies?"), ["search_knowledge_base"]);
  const result = executeTool("search_knowledge_base", { query: "guest service manual" }, restaurantId);
  assert.equal(result.query, "guest service manual");
  assert.ok(Array.isArray(result.results));
});

test("system prompt instructs knowledge-base retrieval for book answers", () => {
  assert.match(SYSTEM_PROMPT, /knowledge base/i);
});
