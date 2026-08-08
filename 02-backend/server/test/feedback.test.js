import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db.js";

test("feedback table enforces one expert judgment per assistant message", () => {
  const restaurant = db.prepare("SELECT id FROM restaurants ORDER BY id LIMIT 1").get();
  const session = db.prepare("INSERT INTO chat_sessions(restaurant_id,title) VALUES (?,?)").run(restaurant.id, "Feedback test");
  const message = db.prepare("INSERT INTO chat_messages(session_id,role,content) VALUES (?,'assistant',?)").run(session.lastInsertRowid, "Test answer");
  try {
    db.prepare("INSERT INTO answer_feedback(restaurant_id,session_id,message_id,question,original_answer,rating,correct_tools) VALUES (?,?,?,?,?,?,?)")
      .run(restaurant.id, session.lastInsertRowid, message.lastInsertRowid, "Test question", "Test answer", "approved", JSON.stringify(["get_daily_sales"]));
    assert.throws(() => db.prepare("INSERT INTO answer_feedback(restaurant_id,session_id,message_id,question,original_answer,rating,correct_tools) VALUES (?,?,?,?,?,?,?)")
      .run(restaurant.id, session.lastInsertRowid, message.lastInsertRowid, "Duplicate", "Duplicate", "approved", "[]"), /UNIQUE/);
  } finally {
    db.prepare("DELETE FROM answer_feedback WHERE message_id=?").run(message.lastInsertRowid);
    db.prepare("DELETE FROM chat_messages WHERE id=?").run(message.lastInsertRowid);
    db.prepare("DELETE FROM chat_sessions WHERE id=?").run(session.lastInsertRowid);
  }
});
